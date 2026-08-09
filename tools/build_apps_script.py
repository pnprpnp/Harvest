#!/usr/bin/env python3
"""Build the deployable Apps Script file from feature-oriented sources."""

from __future__ import annotations

import argparse
from pathlib import Path

from source_bundle import BundleConfig, run_bundle


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CONFIG = BundleConfig(
    repository_root=REPOSITORY_ROOT,
    template_path=REPOSITORY_ROOT / "apps-script" / "src" / "コード.template.js",
    output_path=REPOSITORY_ROOT / "apps-script" / "コード.js",
    source_root=REPOSITORY_ROOT / "apps-script" / "src",
    label="apps-script/コード.js",
    build_command="python3 tools/build_apps_script.py",
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="コード.jsを書き換えず、分割ソースとの一致だけを確認する",
    )
    arguments = parser.parse_args()
    return run_bundle(CONFIG, check=arguments.check)


if __name__ == "__main__":
    raise SystemExit(main())
