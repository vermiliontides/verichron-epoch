#!/usr/bin/env python3
"""
Verichron Epoch - iLEAPP Extraction Bridge
Wraps iLEAPP execution with pre-flight validation and robust error handling.
"""

import importlib.util
import subprocess
import sys
from pathlib import Path

from runtime_env import fatal_if_missing_venv


def _module_available(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def run_ileapp_extraction(artifact_path: str, output_dir: str) -> dict:
    """Validate the backup and invoke iLEAPP in a way that is safe for automation."""
    target_path = Path(artifact_path).resolve()
    out_path = Path(output_dir).resolve()

    if not target_path.exists():
        print(f"[-] Target forensic artifact not found: {target_path}", file=sys.stderr)
        return {"status": "error", "error": "Target path does not exist."}

    has_manifest = list(target_path.glob("**/Manifest.db")) or (target_path / "Manifest.db").exists()
    has_plist = list(target_path.glob("**/Info.plist")) or (target_path / "Info.plist").exists()

    if not has_manifest and not has_plist:
        print(f"[-] Validation Error: '{target_path.name}' is not a valid iOS backup or extraction directory.", file=sys.stderr)
        print(f"[-] Missing required forensic markers (Manifest.db or Info.plist). Check your input path.", file=sys.stderr)
        return {"status": "error", "output_directory": str(out_path), "error": "Invalid iOS backup structure: missing Manifest.db or Info.plist."}

    if not _module_available("ileapp"):
        local_module = Path(__file__).resolve().parent / "iLEAPP"
        if local_module.exists() and any(local_module.iterdir()):
            sys.path.insert(0, str(local_module))
        if not _module_available("ileapp"):
            msg = "iLEAPP is not installed or the bundled iLEAPP checkout is missing. Install the dependency and retry."
            print(f"[-] {msg}", file=sys.stderr)
            return {"status": "error", "output_directory": str(out_path), "error": msg}

    print(f"[*] Executing iLEAPP extraction on: {target_path}")
    print(f"[*] Output destination: {out_path}")
    out_path.mkdir(parents=True, exist_ok=True)

    try:
        cmd = [
            sys.executable,
            "-m",
            "ileapp",
            "-i",
            str(target_path),
            "-o",
            str(out_path),
            "-p",
            "none",
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        print("[+] iLEAPP execution completed successfully.")
        return {"status": "success", "output_directory": str(out_path), "stdout": result.stdout}
    except subprocess.CalledProcessError as exc:
        print(f"[-] iLEAPP subprocess failed with exit code {exc.returncode}:", file=sys.stderr)
        print(exc.stderr, file=sys.stderr)
        return {"status": "error", "output_directory": str(out_path), "error": exc.stderr}
    except Exception as exc:
        print(f"[-] Unexpected error during iLEAPP execution: {exc}", file=sys.stderr)
        return {"status": "error", "output_directory": str(out_path), "error": str(exc)}


if __name__ == "__main__":
    fatal_if_missing_venv()
    if len(sys.argv) < 3:
        print("Usage: python bridge.py <path_to_backup> <output_dir>")
        sys.exit(1)

    res = run_ileapp_extraction(sys.argv[1], sys.argv[2])
    sys.exit(0 if res["status"] == "success" else 1)
