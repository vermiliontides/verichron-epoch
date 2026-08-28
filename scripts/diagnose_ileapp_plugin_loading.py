#!/usr/bin/env python3
"""
Diagnose why apps/extractors/ileapp_bridge/iLEAPP's PluginLoader discovers
zero plugins even though scripts/artifacts/ contains hundreds of real
plugin .py files (confirmed: 384 files present in a real smoketest run).

Reproduces what ileapp.py does at module-discovery time, one step at a
time, so a silent failure shows up directly instead of as an unexplained
empty list. Does not assume the cause -- prints what actually happens at
each step and lets you read the result.

Usage:
    python3 scripts/diagnose_ileapp_plugin_loading.py
"""

from __future__ import annotations

import pathlib
import sys
import traceback

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
ILEAPP_DIR = REPO_ROOT / "apps" / "extractors" / "ileapp_bridge" / "iLEAPP"

if not ILEAPP_DIR.exists():
    print(f"error: {ILEAPP_DIR} does not exist -- vendored iLEAPP checkout missing.")
    sys.exit(1)

# ileapp.py itself does `import scripts.plugin_loader as plugin_loader`, so
# `scripts` must be importable as a top-level package -- ILEAPP_DIR (not
# ILEAPP_DIR/scripts) needs to be on sys.path. This matches how bridge.py
# invokes iLEAPP (cwd=ileapp_script.parent, i.e. ILEAPP_DIR).
sys.path.insert(0, str(ILEAPP_DIR))

import scripts.plugin_loader as plugin_loader  # noqa: E402

print(f"PLUGINPATH resolves to: {plugin_loader.PLUGINPATH}")
print(f"PLUGINPATH exists: {plugin_loader.PLUGINPATH.exists()}")
py_files = sorted(plugin_loader.PLUGINPATH.glob("*.py")) if plugin_loader.PLUGINPATH.exists() else []
print(f"*.py files found by glob: {len(py_files)}")
print()

# Step 1: load ONE known real plugin file exactly as _load_plugins does,
# and check whether __artifacts_v2__/__artifacts__ actually shows up.
sample = next((p for p in py_files if p.name != "__init__.py"), None)
if sample:
    print(f"--- probing single file via load_module_lazy(): {sample.name} ---")
    try:
        mod = plugin_loader.PluginLoader.load_module_lazy(sample)
        v2 = getattr(mod, "__artifacts_v2__", None)
        v1 = getattr(mod, "__artifacts__", None)
        print(f"  __artifacts_v2__ present: {v2 is not None}" + (f" ({len(v2)} entries)" if v2 is not None else ""))
        print(f"  __artifacts__ present:    {v1 is not None}" + (f" ({len(v1)} entries)" if v1 is not None else ""))
        if v2 is None and v1 is None:
            print("  -> load_module_lazy() did not raise, but neither attribute was found.")
            print(f"     Non-dunder attributes actually present: {[a for a in dir(mod) if not a.startswith('_')][:20]}")
    except Exception:
        print("  load_module_lazy() raised an exception:")
        traceback.print_exc()
    print()

    # Step 1b: same file, but WITHOUT the LazyLoader wrapper -- a normal,
    # eager module load. If this succeeds and finds __artifacts_v2__ while
    # step 1 (lazy) did not, that isolates the LazyLoader path specifically.
    print(f"--- probing same file with an ordinary (non-lazy) load, for comparison ---")
    try:
        import importlib.util as ilu
        spec = ilu.spec_from_file_location(f"eager.{sample.stem}", sample)
        eager_mod = ilu.module_from_spec(spec)
        spec.loader.exec_module(eager_mod)
        v2e = getattr(eager_mod, "__artifacts_v2__", None)
        v1e = getattr(eager_mod, "__artifacts__", None)
        print(f"  __artifacts_v2__ present: {v2e is not None}" + (f" ({len(v2e)} entries)" if v2e is not None else ""))
        print(f"  __artifacts__ present:    {v1e is not None}" + (f" ({len(v1e)} entries)" if v1e is not None else ""))
    except Exception:
        print("  eager load raised an exception:")
        traceback.print_exc()
    print()

# Step 2: run the real PluginLoader exactly as ileapp.py does.
print("--- running PluginLoader() as ileapp.py does ---")
try:
    loader = plugin_loader.PluginLoader()
    print(f"  loader.plugins: {len(loader)} plugin(s) discovered")    
    for p in list(loader.plugins)[:5]:
        print(f"    - {p.name} ({p.module_name}, category={p.category})")
    if len(loader.plugins) > 5:
        print(f"    ... and {len(loader.plugins) - 5} more")
except Exception:
    print("  PluginLoader() raised an exception during discovery:")
    traceback.print_exc()