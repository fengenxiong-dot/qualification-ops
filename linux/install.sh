#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root: sudo bash install.sh" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required. Install python3 first." >&2
  exit 1
fi
if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required for Windows data migration. Install unzip first." >&2
  exit 1
fi

PYTHON_VERSION="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
if ! python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'; then
  echo "Python 3.10 or newer is required; found $PYTHON_VERSION." >&2
  exit 1
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${1:-/opt/certification-ops}"
SERVICE_USER="certops"

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

install -d -o "$SERVICE_USER" -g "$SERVICE_USER" "$INSTALL_DIR"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" "$INSTALL_DIR/data/submissions" "$INSTALL_DIR/data/staging" "$INSTALL_DIR/backups" "$INSTALL_DIR/logs"
install -m 0644 "$SOURCE_DIR/server.py" "$INSTALL_DIR/server.py"
rm -rf "$INSTALL_DIR/static" "$INSTALL_DIR/vendor"
cp -a "$SOURCE_DIR/static" "$INSTALL_DIR/static"
cp -a "$SOURCE_DIR/vendor" "$INSTALL_DIR/vendor"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

if [[ ! -f /etc/certification-ops.env ]]; then
  install -m 0640 -o root -g "$SERVICE_USER" "$SOURCE_DIR/server.env.example" /etc/certification-ops.env
fi

if [[ "$INSTALL_DIR" != "/opt/certification-ops" ]]; then
  sed "s|/opt/certification-ops|$INSTALL_DIR|g" "$SOURCE_DIR/certification-ops.service" > /etc/systemd/system/certification-ops.service
  sed "s|/opt/certification-ops|$INSTALL_DIR|g" "$SOURCE_DIR/certification-ops-backup.service" > /etc/systemd/system/certification-ops-backup.service
else
  install -m 0644 "$SOURCE_DIR/certification-ops.service" /etc/systemd/system/certification-ops.service
  install -m 0644 "$SOURCE_DIR/certification-ops-backup.service" /etc/systemd/system/certification-ops-backup.service
fi
install -m 0644 "$SOURCE_DIR/certification-ops-backup.timer" /etc/systemd/system/certification-ops-backup.timer

systemctl daemon-reload
systemctl enable --now certification-ops.service
systemctl enable --now certification-ops-backup.timer

echo "Installed to $INSTALL_DIR"
echo "Configuration: /etc/certification-ops.env"
echo "Admin: http://SERVER_IP:8787/"
echo "Reviewer: http://SERVER_IP:8787/reviewer"
