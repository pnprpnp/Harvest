#!/usr/bin/env python3
"""Verify safety snapshots against real Chromium IndexedDB and storage quotas."""
from run_growth_history import main

if __name__ == "__main__":
    raise SystemExit(main("growth-safety-storage.test.html"))
