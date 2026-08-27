#!/usr/bin/env python3
"""Compatibility wrapper for the iLEAPP bridge using the repo's Postgres extractor contract."""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from runtime_env import fatal_if_missing_venv

try:
    from .main import run_pipeline as run_ileapp_main
except ImportError:
    from main import run_pipeline as run_ileapp_main


def run_pipeline(artifact_path: str, output_dir: str, db_url: str | None = None, clean_staging: bool = False, run_id: str | None = None) -> bool:
    out_path = Path(output_dir)
    if clean_staging and out_path.exists():
        print(f"[*] Cleaning previous staging directory: {out_path}")
        shutil.rmtree(out_path)

    if not db_url:
        raise ValueError("A Postgres db_url is required for the iLEAPP extractor pipeline.")

    try:
        run_ileapp_main(artifact_path, str(out_path), db_url, run_id=run_id)
        return True
    except Exception as exc:
        print(f"[-] Pipeline halted: {exc}", file=sys.stderr)
        return False


if __name__ == "__main__":
    fatal_if_missing_venv()
    parser = argparse.ArgumentParser(description="Verichron iLEAPP Postgres ingestion pipeline")
    parser.add_argument("--input", "-i", required=True, help="Path to target forensic artifact")
    parser.add_argument("--output", "-o", default="./ileapp_raw_output", help="Staging directory")
    parser.add_argument("--db-url", default=None, help="Postgres connection string")
    parser.add_argument("--clean", action="store_true", help="Clean staging directory before running")
    parser.add_argument("--run-id", default=None, help="Optional run identifier")

    args = parser.parse_args()
    if not args.db_url:
        print("[-] --db-url is required for the iLEAPP pipeline.", file=sys.stderr)
        sys.exit(1)
    success = run_pipeline(args.input, args.output, args.db_url, args.clean, args.run_id)
    sys.exit(0 if success else 1)
