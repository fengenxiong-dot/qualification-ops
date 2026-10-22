from __future__ import annotations

import argparse
import shutil
import sqlite3
import tempfile
import zipfile
from pathlib import Path

from backup import create_backup


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def safe_extract(archive: zipfile.ZipFile, target: Path) -> None:
    root = target.resolve()
    for member in archive.infolist():
        destination = (target / member.filename).resolve()
        if root != destination and root not in destination.parents:
            raise ValueError(f"Unsafe backup entry: {member.filename}")
    archive.extractall(target)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Restore certification data while the service is stopped.")
    parser.add_argument("backup", type=Path)
    parser.add_argument("--confirm", action="store_true")
    args = parser.parse_args()
    backup = args.backup.resolve()
    if not args.confirm:
        raise SystemExit("Restore cancelled. Run again with --confirm after stopping the service.")
    if not backup.is_file() or backup.suffix.lower() != ".zip":
        raise SystemExit("Backup file is invalid.")
    if (DATA / "certification.db").exists():
        safety = create_backup(ROOT / "backups", retention=30)
        print(f"Safety backup created: {safety}")
    with tempfile.TemporaryDirectory(prefix="cert-restore-") as temp_name:
        temp = Path(temp_name)
        with zipfile.ZipFile(backup) as archive:
            safe_extract(archive, temp)
        restored_db = temp / "data" / "certification.db"
        if not restored_db.exists():
            raise SystemExit("Backup does not contain the database.")
        with sqlite3.connect(restored_db) as conn:
            if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise SystemExit("Backup database integrity check failed.")
        DATA.mkdir(exist_ok=True)
        shutil.copy2(restored_db, DATA / "certification.db")
        restored_files = temp / "data" / "submissions"
        if restored_files.exists():
            target_files = DATA / "submissions"
            if target_files.exists():
                shutil.rmtree(target_files)
            shutil.copytree(restored_files, target_files)
    print(f"Restored: {backup}")
