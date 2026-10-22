#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$APP_DIR/certification-ops.pid"

stop_by_pid() {
  local pid="$1"
  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 30); do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 0.3
  done
  echo "进程未在超时内退出，尝试强制结束。" >&2
  kill -KILL "$pid" 2>/dev/null || true
}

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$PID" ]]; then
    stop_by_pid "$PID"
  fi
  rm -f "$PID_FILE"
  echo "服务已停止。"
  exit 0
fi

# 没有 PID 文件时，仅在确认是本目录的进程时才兜底停止。
if pgrep -f "$APP_DIR/server.py" >/dev/null 2>&1; then
  echo "未找到 PID 文件，但检测到本目录进程，正在停止……" >&2
  pkill -TERM -f "$APP_DIR/server.py" 2>/dev/null || true
  sleep 1
  pkill -KILL -f "$APP_DIR/server.py" 2>/dev/null || true
  echo "服务已停止。"
  exit 0
fi

echo "服务未在运行。"
