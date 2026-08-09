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
STORAGE_GATEWAY_PATH = REPOSITORY_ROOT / "src" / "scripts" / "browser-storage.js"
CSS_ROOT = REPOSITORY_ROOT / "src" / "styles"
REDUCED_MOTION_CSS_PATH = CSS_ROOT / "unified" / "inputs-and-responsive.css"
REDUCED_MOTION_PRIORITY_RULE = (
    "*,*::before,*::after{scroll-behavior:auto !important;"
    "transition-duration:.01ms !important;animation-duration:.01ms !important;"
    "animation-iteration-count:1 !important;}"
)
VERSION_META_PATTERN = re.compile(
    r'<meta\s+name="harvestnavi-version"\s+content="([^"]+)"\s*/?>'
)
DIRECT_STORAGE_ACCESS_PATTERN = re.compile(
    r"\b(?:localStorage|sessionStorage)\s*\.\s*"
    r"(?:getItem|setItem|removeItem|clear)\s*\("
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


def check_browser_storage_access() -> bool:
    """Keep browser storage operations behind the shared gateway."""
    violations: list[str] = []
    scripts_root = REPOSITORY_ROOT / "src" / "scripts"
    for script_path in sorted(scripts_root.rglob("*.js")):
        if script_path == STORAGE_GATEWAY_PATH:
            continue
        source = script_path.read_text(encoding="utf-8")
        for match in DIRECT_STORAGE_ACCESS_PATTERN.finditer(source):
            line_number = source.count("\n", 0, match.start()) + 1
            violations.append(f"{script_path.relative_to(REPOSITORY_ROOT)}:{line_number}")

    if not violations:
        return True
    print("ブラウザー内保存を共通窓口を通さず操作している箇所があります:")
    for violation in violations:
        print(f"  {violation}")
    return False


def check_css_priority_overrides() -> bool:
    """Allow priority overrides only for the reduced-motion accessibility rule."""
    violations: list[str] = []
    found_reduced_motion_rule = False
    for css_path in sorted(CSS_ROOT.rglob("*.css")):
        source = css_path.read_text(encoding="utf-8")
        for line_number, line in enumerate(source.splitlines(), start=1):
            if "!important" not in line:
                continue
            if (
                css_path == REDUCED_MOTION_CSS_PATH
                and line.strip() == REDUCED_MOTION_PRIORITY_RULE
            ):
                found_reduced_motion_rule = True
                continue
            violations.append(f"{css_path.relative_to(REPOSITORY_ROOT)}:{line_number}")

    if not found_reduced_motion_rule:
        print("動きを抑えるアクセシビリティ用CSSが見つかりません。")
        return False
    if not violations:
        return True
    print("アクセシビリティ用途以外の !important があります:")
    for violation in violations:
        print(f"  {violation}")
    return False


def check_index_source_invariants() -> bool:
    """Validate source rules shared by the individual and all-output builds."""
    return (
        check_app_version_consistency()
        and check_browser_storage_access()
        and check_css_priority_overrides()
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="index.htmlを書き換えず、分割ソースとの一致だけを確認する",
    )
    arguments = parser.parse_args()
    if not check_index_source_invariants():
        return 1
    return run_bundle(CONFIG, check=arguments.check)


if __name__ == "__main__":
    raise SystemExit(main())
