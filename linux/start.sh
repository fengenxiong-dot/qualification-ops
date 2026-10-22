#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$APP_DIR/server.env"
PID_FILE="$APP_DIR/certification-ops.pid"

if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  set +a
fi

: "${CERT_DATA_DIR:=$APP_DIR/data}"
: "${CERT_LOG_DIR:=$APP_DIR/logs}"
: "${CERT_HOST:=0.0.0.0}"
: "${CERT_PORT:=8787}"
: "${CERT_BASE_URL:=http://127.0.0.1:${CERT_PORT}}"
: "${CERT_DINGTALK_MODE:=mock}"
: "${CERT_MAX_FILE_MB:=300}"
: "${CERT_PARSE_TIMEOUT_SECONDS:=60}"
: "${CERT_PYTHON_BIN:=/usr/bin/python3}"

export CERT_DATA_DIR CERT_LOG_DIR CERT_HOST CERT_PORT CERT_BASE_URL
export CERT_DINGTALK_MODE CERT_MAX_FILE_MB CERT_PARSE_TIMEOUT_SECONDS
export PYTHONPATH="$APP_DIR/vendor${PYTHONPATH:+:$PYTHONPATH}"

mkdir -p "$CERT_DATA_DIR" "$CERT_LOG_DIR"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "服务已在运行 (PID $OLD_PID)。如需重启，请先执行 ./stop.sh。" >&2
    exit 1
  fi
  rm -f "$PID_FILE"
fi

if ! command -v "$CERT_PYTHON_BIN" >/dev/null 2>&1; then
  echo "找不到 Python：$CERT_PYTHON_BIN，请先安装 python3（3.10+）。" >&2
  exit 1
fi

nohup "$CERT_PYTHON_BIN" "$APP_DIR/server.py" >"$CERT_LOG_DIR/console.log" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"

sleep 2
if ! kill -0 "$PID" 2>/dev/null; then
  echo "服务启动失败，请查看日志：$CERT_LOG_DIR/console.log" >&2
  rm -f "$PID_FILE"
  exit 1
fi

echo "任职资格认证系统已启动 (PID $PID)"
echo "数据目录：$CERT_DATA_DIR"
echo "访问地址：$CERT_BASE_URL"
echo "停止服务：cd $(dirname "$0") && ./stop.sh"
