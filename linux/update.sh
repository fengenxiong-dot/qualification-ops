#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${1:-/opt/certification-ops}"
SERVICE_NAME="${2:-certification-ops}"
PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ROLLBACK_DIR="$INSTALL_DIR/rollback/program-$TIMESTAMP"
UPDATED=0

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "请使用 sudo 运行：sudo bash update.sh $INSTALL_DIR $SERVICE_NAME" >&2
  exit 1
fi
if [[ ! -f "$INSTALL_DIR/server.py" || ! -d "$INSTALL_DIR/data" ]]; then
  echo "目标目录不是已部署的任职资格认证系统：$INSTALL_DIR" >&2
  exit 1
fi
if [[ -e "$PACKAGE_DIR/data" || -e "$PACKAGE_DIR/backups" || -e "$PACKAGE_DIR/config" ]]; then
  echo "更新包不应包含 data、backups 或 config，已中止。" >&2
  exit 1
fi

OWNER="$(stat -c '%U' "$INSTALL_DIR")"
GROUP="$(stat -c '%G' "$INSTALL_DIR")"

rollback_program() {
  if [[ "$UPDATED" -eq 1 && -d "$ROLLBACK_DIR" ]]; then
    echo "更新未成功，正在自动恢复旧程序……" >&2
    rm -rf "$INSTALL_DIR/static"
    cp -a "$ROLLBACK_DIR/server.py" "$INSTALL_DIR/server.py"
    cp -a "$ROLLBACK_DIR/static" "$INSTALL_DIR/static"
    if [[ -f "$ROLLBACK_DIR/requirements.txt" ]]; then
      cp -a "$ROLLBACK_DIR/requirements.txt" "$INSTALL_DIR/requirements.txt"
    fi
    chown -R "$OWNER:$GROUP" "$INSTALL_DIR/server.py" "$INSTALL_DIR/static" "$INSTALL_DIR/requirements.txt" 2>/dev/null || true
    systemctl restart "$SERVICE_NAME" || true
  fi
}
trap rollback_program ERR

echo "1/6 检查服务和业务数据"
systemctl status "$SERVICE_NAME" --no-pager >/dev/null || true
if [[ ! -f "$INSTALL_DIR/data/certification.db" ]]; then
  echo "警告：未找到 certification.db；请确认这确实是目标安装目录。" >&2
  exit 1
fi

echo "2/6 生成系统业务备份"
if [[ -x "$INSTALL_DIR/.venv/bin/python" ]]; then
  sudo -u "$OWNER" env PYTHONPATH="$INSTALL_DIR/vendor" "$INSTALL_DIR/.venv/bin/python" "$INSTALL_DIR/server.py" --backup
else
  sudo -u "$OWNER" env PYTHONPATH="$INSTALL_DIR/vendor" python3 "$INSTALL_DIR/server.py" --backup
fi

echo "3/6 停止服务"
systemctl stop "$SERVICE_NAME"

echo "4/6 保存旧程序到 $ROLLBACK_DIR"
mkdir -p "$ROLLBACK_DIR"
cp -a "$INSTALL_DIR/server.py" "$ROLLBACK_DIR/server.py"
cp -a "$INSTALL_DIR/static" "$ROLLBACK_DIR/static"
[[ -f "$INSTALL_DIR/requirements.txt" ]] && cp -a "$INSTALL_DIR/requirements.txt" "$ROLLBACK_DIR/requirements.txt"
UPDATED=1

echo "5/6 安装新程序（不会触碰 data、backups、配置和附件）"
install -m 0644 "$PACKAGE_DIR/server.py" "$INSTALL_DIR/server.py"
[[ -f "$PACKAGE_DIR/requirements.txt" ]] && install -m 0644 "$PACKAGE_DIR/requirements.txt" "$INSTALL_DIR/requirements.txt"
rm -rf "$INSTALL_DIR/static"
cp -a "$PACKAGE_DIR/static" "$INSTALL_DIR/static"
[[ -f "$PACKAGE_DIR/VERSION" ]] && install -m 0644 "$PACKAGE_DIR/VERSION" "$INSTALL_DIR/VERSION"
chown -R "$OWNER:$GROUP" "$INSTALL_DIR/server.py" "$INSTALL_DIR/static" "$INSTALL_DIR/requirements.txt" "$INSTALL_DIR/VERSION" 2>/dev/null || true

echo "6/6 启动并检查服务"
systemctl start "$SERVICE_NAME"
sleep 2
systemctl is-active --quiet "$SERVICE_NAME"
UPDATED=0
trap - ERR

echo
echo "更新成功。"
echo "旧程序备份：$ROLLBACK_DIR"
echo "业务数据、评价分数、附件和配置均未被替换。"
echo "请打开结果看板，检查单人导出和“一键导出全部 Excel”。"
