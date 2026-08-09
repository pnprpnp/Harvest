#!/usr/bin/env python3
"""Build the deployable index.html from feature-oriented source files."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from source_bundle import BundleConfig, run_bundle


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
VERSION_MANIFEST_PATH = REPOSITORY_ROOT / "version.json"
VERSION_META_PATTERN = re.compile(
    r'<meta\s+name="harvestnavi-version"\s+content="([^"]+)"\s*/?>'
)
CONFIG = BundleConfig(
    repository_root=REPOSITORY_ROOT,
    template_path=REPOSITORY_ROOT / "src" / "index.template.html",
    output_path=REPOSITORY_ROOT / "index.html",
    source_root=REPOSITORY_ROOT / "src",
    label="index.html",
    build_command="python3 tools/build_index.py",
)


def check_app_version_consistency() -> bool:
    """Ensure the update manifest and the HTML declaration identify one release."""
    try:
        manifest = json.loads(VERSION_MANIFEST_PATH.read_text(encoding="utf-8"))
        template = CONFIG.template_path.read_text(encoding="utf-8")
    except (OSError, json.JSONDecodeError) as error:
        print(f"更新番号の確認に失敗しました: {error}")
        return False

    manifest_version = manifest.get("version")
    meta_match = VERSION_META_PATTERN.search(template)
    declared_version = meta_match.group(1) if meta_match else None
    if not isinstance(manifest_version, str) or not manifest_version:
        print("version.json に有効な version がありません。")
        return False
    if not declared_version:
        print("index.template.html に harvestnavi-version の宣言がありません。")
        return False
    if manifest_version != declared_version:
        print(
            "更新番号が一致しません: "
            f"version.json={manifest_version}, "
            f"index.template.html={declared_version}"
        )
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="index.htmlを書き換えず、分割ソースとの一致だけを確認する",
    )
    arguments = parser.parse_args()
    if not check_app_version_consistency():
        return 1
    return run_bundle(CONFIG, check=arguments.check)


if __name__ == "__main__":
    raise SystemExit(main())
