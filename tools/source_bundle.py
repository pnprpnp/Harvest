#!/usr/bin/env python3
"""Shared builder for tracked single-file outputs assembled from split sources."""

from __future__ import annotations

import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path


INCLUDE_PATTERN = re.compile(
    rb"^<!-- build:include ([A-Za-z0-9_./-]+) -->(?:\r?\n)?$"
)


@dataclass(frozen=True)
class BundleConfig:
    repository_root: Path
    template_path: Path
    output_path: Path
    source_root: Path
    label: str
    build_command: str


def render_bundle(config: BundleConfig) -> tuple[bytes, list[Path]]:
    template = config.template_path.read_bytes()
    output_parts: list[bytes] = []
    included_paths: list[Path] = []
    allowed_source_root = config.source_root.resolve()

    for line_number, line in enumerate(template.splitlines(keepends=True), start=1):
        match = INCLUDE_PATTERN.fullmatch(line)
        if not match:
            if b"build:include" in line:
                relative_template = config.template_path.relative_to(config.repository_root)
                raise ValueError(
                    f"{relative_template}:{line_number}: include指定の形式が正しくありません"
                )
            output_parts.append(line)
            continue

        relative_path = Path(match.group(1).decode("ascii"))
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise ValueError(f"許可されていないinclude先です: {relative_path}")

        source_path = (config.repository_root / relative_path).resolve()
        try:
            source_path.relative_to(allowed_source_root)
        except ValueError as error:
            raise ValueError(
                f"include先は{config.source_root.relative_to(config.repository_root)}内にしてください: "
                f"{relative_path}"
            ) from error
        if not source_path.is_file():
            raise FileNotFoundError(f"include先がありません: {relative_path}")
        output_parts.append(source_path.read_bytes())
        included_paths.append(source_path)

    if not included_paths:
        raise ValueError(f"{config.template_path.name}にinclude指定がありません")
    return b"".join(output_parts), included_paths


def first_difference_message(expected: bytes, actual: bytes) -> str:
    limit = min(len(expected), len(actual))
    position = next((index for index in range(limit) if expected[index] != actual[index]), limit)
    line_number = expected[:position].count(b"\n") + 1
    if len(expected) != len(actual) and position == limit:
        return (
            f"最初の差分は{line_number}行目付近です "
            f"(生成: {len(expected)} bytes / 現在: {len(actual)} bytes)"
        )
    return f"最初の差分は{line_number}行目付近です"


def check_bundle(config: BundleConfig, rendered: bytes) -> int:
    if not config.output_path.is_file():
        print(f"{config.label}がありません。{config.build_command} を実行してください。")
        return 1
    current = config.output_path.read_bytes()
    if current == rendered:
        print(f"{config.label}は分割ソースと一致しています。")
        return 0
    print(f"{config.label}が分割ソースと一致しません。")
    print(first_difference_message(rendered, current))
    print(f"{config.build_command} で生成し直してください。")
    return 1


def write_bundle(config: BundleConfig, rendered: bytes) -> None:
    if config.output_path.is_file() and config.output_path.read_bytes() == rendered:
        print(f"{config.label}は最新です。")
        return

    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{config.output_path.name}.",
        suffix=".tmp",
        dir=config.output_path.parent,
    )
    try:
        with os.fdopen(file_descriptor, "wb") as temporary_file:
            temporary_file.write(rendered)
        os.replace(temporary_name, config.output_path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise
    print(f"{config.label}を分割ソースから生成しました。")


def run_bundle(config: BundleConfig, check: bool = False) -> int:
    rendered, included_paths = render_bundle(config)
    print(f"{config.label}: {len(included_paths)}個のソースを確認しました。")
    if check:
        return check_bundle(config, rendered)
    write_bundle(config, rendered)
    return 0
