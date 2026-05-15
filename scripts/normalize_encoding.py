"""ファイルエンコーディングを規約に揃える

規約:
    - 改行コード: CRLF (全ファイル)
    - 文字コード: UTF-8
        - .md は BOM 付き
        - その他 (.py, .ts, .tsx, .json, .yaml, .css, .html, .js, .mjs, .gitignore) は BOM 無し

実行:
    python scripts/normalize_encoding.py        # 一括正規化
    python scripts/normalize_encoding.py --check # 修正されるべきファイル一覧のみ表示
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BOM = b"\xef\xbb\xbf"
ROOT = Path(__file__).parent.parent

# 対象拡張子と BOM 要否
EXT_RULES: dict[str, bool] = {
    ".md": True,
    ".py": False,
    ".ts": False,
    ".tsx": False,
    ".json": False,
    ".yaml": False,
    ".yml": False,
    ".css": False,
    ".html": False,
    ".js": False,
    ".mjs": False,
}

# スキップするディレクトリ
SKIP_DIRS = {".git", "node_modules", "dist", "__pycache__", ".vite", "tmp"}


def iter_target_files() -> list[Path]:
    files: list[Path] = []
    for p in ROOT.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.relative_to(ROOT).parts):
            continue
        if p.suffix.lower() in EXT_RULES or p.name == ".gitignore":
            files.append(p)
    return files


def normalize_one(path: Path, dry_run: bool = False) -> tuple[bool, str]:
    """1ファイル正規化。戻り値: (changed, reason)"""
    data = path.read_bytes()

    has_bom = data.startswith(BOM)
    body = data[3:] if has_bom else data
    want_bom = EXT_RULES.get(path.suffix.lower(), False)

    # 改行を LF に揃えてから CRLF に
    text = body.decode("utf-8", errors="strict")
    normalized = text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n")
    new_body = normalized.encode("utf-8")
    new_data = (BOM if want_bom else b"") + new_body

    if new_data == data:
        return False, ""
    if not dry_run:
        path.write_bytes(new_data)
    reasons = []
    if has_bom != want_bom:
        reasons.append(f'BOM {"add" if want_bom else "remove"}')
    if data.count(b"\r\n") != new_data.count(b"\r\n"):
        reasons.append("CRLF")
    return True, ", ".join(reasons) or "modified"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="変更内容を表示するのみで書き換えない")
    args = parser.parse_args()

    files = iter_target_files()
    changed = []
    for f in files:
        try:
            ok, why = normalize_one(f, dry_run=args.check)
        except UnicodeDecodeError as e:
            print(f"  ! decode error: {f.relative_to(ROOT)} ({e})")
            continue
        if ok:
            changed.append((f, why))

    print(f"Checked {len(files)} files, changed {len(changed)}")
    for f, why in changed:
        rel = f.relative_to(ROOT)
        prefix = "would update" if args.check else "updated"
        print(f"  {prefix}: {rel}  [{why}]")

    return 0


if __name__ == "__main__":
    sys.exit(main())
