#!/usr/bin/env python3
"""Serve repository UI previews without touching application data."""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 4173


def main() -> None:
    parser = argparse.ArgumentParser(description="Harvestnavi UI preview server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=DEFAULT_PORT, type=int)
    args = parser.parse_args()

    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT_DIR))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    url = f"http://{args.host}:{args.port}/previews/calculation-settings.html"
    print(f"Harvestnavi UI preview: {url}", flush=True)
    print("Stop with Ctrl+C.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
