from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATABASE = DATA / "certification.db"


def create_backup(output_dir: Path, retention: int = 14) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = output_dir / f"certification-backup-{stamp}.zip"
    with tempfile.TemporaryDirectory(prefix="cert-backup-") as temp_name:
        temp = Path(temp_name)
        snapshot = temp / "certification.db"
        source = sqlite3.connect(DATABASE)
        destination = sqlite3.connect(snapshot)
        try:
            source.backup(destination)
        finally:
            destination.close()
            source.close()
        metadata = {
            "createdAt": datetime.now().astimezone().isoformat(timespec="seconds"),
            "database": "data/certification.db",
            "includesAttachments": (DATA / "submissions").exists(),
        }
        (temp / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            archive.write(snapshot, "data/certification.db")
            archive.write(temp / "metadata.json", "metadata.json")
            submissions = DATA / "submissions"
            if submissions.exists():
                for path in submissions.rglob("*"):
                    if path.is_file():
                        archive.write(path, path.relative_to(ROOT).as_posix())
    backups = sorted(output_dir.glob("certification-backup-*.zip"), reverse=True)
    for old in backups[max(1, retention):]:
        old.unlink()
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "backups")
    parser.add_argument("--retention", type=int, default=14)
    args = parser.parse_args()
    if not DATABASE.exists():
        raise SystemExit(f"Database does not exist: {DATABASE}")
    print(create_backup(args.output.resolve(), args.retention))
