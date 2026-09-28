#!/usr/bin/env python3
"""Exercise growth-history source directly in Chromium's real IndexedDB."""
import functools
import subprocess
import tempfile
import threading

from run_characterization import (
    CharacterizationServer, QuietRequestHandler, REPOSITORY_ROOT, find_chrome,
)


def main(page="growth-history.test.html"):
    handler = functools.partial(QuietRequestHandler, directory=str(REPOSITORY_ROOT))
    server = CharacterizationServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix="harvest-growth-history-") as profile:
            browser = subprocess.Popen([
                find_chrome(), "--headless=new", "--no-first-run", "--no-default-browser-check",
                "--disable-background-networking", "--disable-component-update", "--disable-extensions",
                "--disable-gpu", f"--user-data-dir={profile}",
                f"http://127.0.0.1:{server.server_port}/tests/{page}",
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                server.test_event.wait(timeout=45)
                payload = server.test_payload
            finally:
                browser.terminate()
                try:
                    browser.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    browser.kill()
                    browser.wait(timeout=5)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    if not payload:
        print("予測履歴テスト: ブラウザの結果を取得できませんでした")
        return 2
    for result in payload.get("results", []):
        print(("✓ " if result["status"] == "passed" else "✗ ") + result["message"])
    return 0 if payload.get("status") == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
