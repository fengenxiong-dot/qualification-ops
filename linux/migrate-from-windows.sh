#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "请使用sudo运行：sudo bash migrate-from-windows.sh <迁移ZIP> [安装目录]" >&2
  exit 1
fi
if [[ $# -lt 1 ]]; then
  echo "用法：sudo bash migrate-from-windows.sh /path/CertificationOps-Windows-Data-时间.zip [/opt/certification-ops]" >&2
  exit 1
fi

BACKUP_FILE="$(readlink -f "$1")"
INSTALL_DIR="${2:-/opt/certification-ops}"
SERVICE_NAME="certification-ops"
SERVICE_USER="certops"
STAMP="$(date +%Y%m%d-%H%M%S)"
ROLLBACK_DIR="$INSTALL_DIR/migration-rollback-$STAMP"

[[ -f "$BACKUP_FILE" ]] || { echo "迁移ZIP不存在：$BACKUP_FILE" >&2; exit 1; }
[[ -f "$INSTALL_DIR/server.py" ]] || { echo "Linux程序尚未安装：$INSTALL_DIR/server.py" >&2; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "需要unzip命令，请先安装unzip。" >&2; exit 1; }
unzip -tq "$BACKUP_FILE" >/dev/null || { echo "迁移ZIP校验失败。" >&2; exit 1; }
unzip -Z1 "$BACKUP_FILE" | grep -Fxq 'data/certification.db' || { echo "迁移ZIP缺少data/certification.db。" >&2; exit 1; }
if unzip -Z1 "$BACKUP_FILE" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "迁移ZIP包含不安全路径，已中止。" >&2
  exit 1
fi

echo "1/7 停止Linux服务……"
systemctl stop "$SERVICE_NAME.service"

echo "2/7 保存Linux现有数据用于回滚……"
install -d -m 0700 "$ROLLBACK_DIR"
if [[ -d "$INSTALL_DIR/data" ]]; then cp -a "$INSTALL_DIR/data" "$ROLLBACK_DIR/data"; fi

rollback() {
  echo "迁移失败，正在恢复Linux迁移前数据……" >&2
  systemctl stop "$SERVICE_NAME.service" 2>/dev/null || true
  if [[ -d "$ROLLBACK_DIR/data" ]]; then
    rm -rf "$INSTALL_DIR/data"
    cp -a "$ROLLBACK_DIR/data" "$INSTALL_DIR/data"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/data"
  fi
  systemctl start "$SERVICE_NAME.service" 2>/dev/null || true
}
trap rollback ERR

echo "3/7 使用应用内置恢复逻辑校验并导入……"
export PYTHONPATH="$INSTALL_DIR/vendor${PYTHONPATH:+:$PYTHONPATH}"
python3 "$INSTALL_DIR/server.py" --restore "$BACKUP_FILE" --confirm
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/data" "$INSTALL_DIR/backups" "$INSTALL_DIR/logs"

echo "4/7 启动Linux服务……"
systemctl start "$SERVICE_NAME.service"
sleep 4
systemctl is-active --quiet "$SERVICE_NAME.service"

echo "5/7 校验数据库完整性……"
INTEGRITY="$(runuser -u "$SERVICE_USER" -- env PYTHONPATH="$INSTALL_DIR/vendor" python3 - "$INSTALL_DIR/data/certification.db" <<'PY'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as conn:
    print(conn.execute('PRAGMA integrity_check').fetchone()[0])
PY
)"
[[ "$INTEGRITY" == "ok" ]] || { echo "数据库完整性校验失败：$INTEGRITY" >&2; false; }

echo "6/7 输出迁移后数据数量……"
runuser -u "$SERVICE_USER" -- env PYTHONPATH="$INSTALL_DIR/vendor" python3 - "$INSTALL_DIR/data/certification.db" <<'PY'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as conn:
    for table, label in [('submissions','被评价人'),('reviewers','评委'),('review_assignments','评价关系'),('reviews','评价记录'),('module_scores','逐项评分')]:
        try:
            count = conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
        except sqlite3.OperationalError:
            count = 0
        print(f'{label}: {count}')
PY

echo "7/7 迁移完成。回滚副本：$ROLLBACK_DIR"
trap - ERR
echo '请完成浏览器验收前保留Windows虚拟机及其原数据，不要删除。'
