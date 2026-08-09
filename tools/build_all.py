#!/usr/bin/env python3
"""Build or check all tracked single-file outputs."""

from __future__ import annotations

import argparse

from build_apps_script import CONFIG as APPS_SCRIPT_CONFIG
from build_index import CONFIG as INDEX_CONFIG
from source_bundle import run_bundle


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="生成ファイルを書き換えず、分割ソースとの一致だけを確認する",
    )
    arguments = parser.parse_args()
    for config in (INDEX_CONFIG, APPS_SCRIPT_CONFIG):
        result = run_bundle(config, check=arguments.check)
        if result != 0:
            return result
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
