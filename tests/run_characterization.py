#!/usr/bin/env python3
"""Run Harvestnavi's browser characterization tests with headless Chrome."""

from __future__ import annotations

import functools
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


REPOSITORY_ROOT = pathlib.Path(__file__).resolve().parents[1]
CHROME_CANDIDATES = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
)


class QuietRequestHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return

    def do_POST(self) -> None:
        if urlsplit(self.path).path != "/__harvestnavi_characterization_result__":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > 1_000_000:
            self.send_error(400)
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_error(400)
            return
        self.server.test_payload = payload
        self.server.test_event.set()
        self.send_response(204)
        self.end_headers()


class CharacterizationServer(ThreadingHTTPServer):
    def server_bind(self) -> None:
        self.test_event = threading.Event()
        self.test_payload: dict[str, object] | None = None
        super().server_bind()


def find_chrome() -> str:
    configured = os.environ.get("CHROME_BIN", "").strip()
    candidates = ([configured] if configured else []) + list(CHROME_CANDIDATES)
    for candidate in candidates:
        if candidate and pathlib.Path(candidate).is_file():
            return candidate
    for executable in ("google-chrome", "chromium", "chromium-browser"):
        found = shutil.which(executable)
        if found:
            return found
    raise RuntimeError("Google Chrome または Chromium が見つかりません。CHROME_BIN を指定してください。")


def check_generated_index() -> bool:
    result = subprocess.run(
        [sys.executable, str(REPOSITORY_ROOT / "tools" / "build_index.py"), "--check"],
        cwd=REPOSITORY_ROOT,
        check=False,
    )
    if result.returncode == 0:
        return True
    print(
        "エラー: 分割ソースとindex.htmlが一致しないため、ブラウザテストを開始しません。",
        file=sys.stderr,
    )
    return False


def main() -> int:
    if not check_generated_index():
        return 2
    try:
        chrome = find_chrome()
    except RuntimeError as error:
        print(f"エラー: {error}", file=sys.stderr)
        return 2

    handler = functools.partial(QuietRequestHandler, directory=str(REPOSITORY_ROOT))
    server = CharacterizationServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}/tests/characterization.html"

    browser_error = ""
    payload: dict[str, object] | None = None
    try:
        with tempfile.TemporaryDirectory(prefix="harvestnavi-test-") as profile:
            browser = subprocess.Popen(
                [
                    chrome,
                    "--headless=new",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-background-networking",
                    "--disable-component-update",
                    "--disable-default-apps",
                    "--disable-extensions",
                    "--disable-gpu",
                    "--hide-scrollbars",
                    f"--user-data-dir={profile}",
                    url,
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
            )
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                if server.test_event.wait(timeout=0.25):
                    payload = server.test_payload
                    break
                if browser.poll() is not None:
                    break
            if browser.poll() is None:
                browser.terminate()
                try:
                    browser.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    browser.kill()
                    browser.wait(timeout=5)
            if browser.stderr:
                browser_error = browser.stderr.read().strip()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    if not payload:
        print("エラー: ブラウザテストの結果を60秒以内に取得できませんでした。", file=sys.stderr)
        if browser_error:
            print(browser_error, file=sys.stderr)
        return 2

    test_results = payload.get("results") if isinstance(payload.get("results"), list) else []
    for result in test_results:
        if not isinstance(result, dict):
            continue
        status = str(result.get("status", ""))
        message = str(result.get("message", ""))
        mark = "✓" if status == "passed" else "✗"
        print(f"{mark} {message}")

    if payload.get("status") != "passed":
        return 1

    print(f"\n全{len(test_results)}件の特性テストに成功しました。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
