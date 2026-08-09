#!/usr/bin/env python3
"""Build the deployable index.html from feature-oriented source files."""

from __future__ import annotations

import argparse
import os
import re
import tempfile
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = REPOSITORY_ROOT / "src" / "index.template.html"
OUTPUT_PATH = REPOSITORY_ROOT / "index.html"
INCLUDE_PATTERN = re.compile(
    rb"^<!-- build:include ([A-Za-z0-9_./-]+) -->(?:\r?\n)?$"
)


def render_index() -> tuple[bytes, list[Path]]:
    template = TEMPLATE_PATH.read_bytes()
    output_parts: list[bytes] = []
    included_paths: list[Path] = []

    for line_number, line in enumerate(template.splitlines(keepends=True), start=1):
        match = INCLUDE_PATTERN.fullmatch(line)
        if not match:
            if b"build:include" in line:
                raise ValueError(
                    f"{TEMPLATE_PATH.relative_to(REPOSITORY_ROOT)}:{line_number}: "
                    "include指定の形式が正しくありません"
                )
            output_parts.append(line)
            continue

        relative_path = Path(match.group(1).decode("ascii"))
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise ValueError(f"許可されていないinclude先です: {relative_path}")
        if not relative_path.parts or relative_path.parts[0] != "src":
            raise ValueError(f"include先はsrc内にしてください: {relative_path}")

        source_path = (REPOSITORY_ROOT / relative_path).resolve()
        source_path.relative_to((REPOSITORY_ROOT / "src").resolve())
        if not source_path.is_file():
            raise FileNotFoundError(f"include先がありません: {relative_path}")
        output_parts.append(source_path.read_bytes())
        included_paths.append(source_path)

    if not included_paths:
        raise ValueError("index.template.htmlにinclude指定がありません")
    return b"".join(output_parts), included_paths


def first_difference_message(expected: bytes, actual: bytes) -> str:
    limit = min(len(expected), len(actual))
    position = next((index for index in range(limit) if expected[index] != actual[index]), limit)
    line_number = expected[:position].count(b"\n") + 1
    if len(expected) != len(actual) and position == limit:
        return (
            f"最初の差分は{line_number}行目付近です "
            f"(生成: {len(expected)} bytes / index.html: {len(actual)} bytes)"
        )
    return f"最初の差分は{line_number}行目付近です"


def check_index(rendered: bytes) -> int:
    if not OUTPUT_PATH.is_file():
        print("index.htmlがありません。python3 tools/build_index.py を実行してください。")
        return 1
    current = OUTPUT_PATH.read_bytes()
    if current == rendered:
        print("index.htmlは分割ソースと一致しています。")
        return 0
    print("index.htmlが分割ソースと一致しません。")
    print(first_difference_message(rendered, current))
    print("python3 tools/build_index.py で生成し直してください。")
    return 1


def write_index(rendered: bytes) -> None:
    if OUTPUT_PATH.is_file() and OUTPUT_PATH.read_bytes() == rendered:
        print("index.htmlは最新です。")
        return

    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=".index.html.", suffix=".tmp", dir=REPOSITORY_ROOT
    )
    try:
        with os.fdopen(file_descriptor, "wb") as temporary_file:
            temporary_file.write(rendered)
        os.replace(temporary_name, OUTPUT_PATH)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise
    print("index.htmlを分割ソースから生成しました。")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="index.htmlを書き換えず、分割ソースとの一致だけを確認する",
    )
    arguments = parser.parse_args()
    rendered, included_paths = render_index()
    print(f"{len(included_paths)}個のソースを確認しました。")
    if arguments.check:
        return check_index(rendered)
    write_index(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
