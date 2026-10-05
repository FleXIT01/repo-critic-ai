#!/usr/bin/env python3
"""
start.py — repo-critic-ai launcher
=====================================
Automatically installs npm dependencies on first run, then starts the tool.

Usage:
  python start.py                          Start web UI (http://localhost:3000)
  python start.py web                      Start web UI
  python start.py web --port 8080          Start web UI on a custom port
  python start.py analyze owner/repo       Analyse a repository (CLI)
  python start.py analyze owner/repo --json       Output raw JSON
  python start.py analyze owner/repo --no-llm     Disable LLM calls
  python start.py help                     Show this help text
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


# ── prerequisites ─────────────────────────────────────────────────────────────

def _find(name: str) -> str | None:
    """Find an executable, trying .cmd suffix on Windows."""
    found = shutil.which(name)
    if found:
        return found
    if sys.platform == "win32":
        return shutil.which(name + ".cmd")
    return None


def check_node() -> None:
    node = _find("node")
    if not node:
        print("ERROR: Node.js is not installed.")
        print("  → Download v22+ from https://nodejs.org/")
        sys.exit(1)

    result = subprocess.run([node, "--version"], capture_output=True, text=True)
    version_str = result.stdout.strip().lstrip("v")
    try:
        major = int(version_str.split(".")[0])
        if major < 22:
            print(f"WARNING: Node.js v{version_str} detected — v22+ is recommended.")
    except (ValueError, IndexError):
        pass


def ensure_deps() -> None:
    if (ROOT / "node_modules").exists():
        return
    print("First run — installing npm dependencies...")
    npm = _find("npm")
    if not npm:
        print("ERROR: npm not found. Install Node.js from https://nodejs.org/")
        sys.exit(1)
    subprocess.run([npm, "install", "--prefix", str(ROOT)], check=True)
    print()


# ── run helper ────────────────────────────────────────────────────────────────

def run(*args: str) -> None:
    """Delegate to `npm run dev -- <args>` which runs `tsx src/index.ts <args>`."""
    npm = _find("npm")
    if not npm:
        print("ERROR: npm not found.")
        sys.exit(1)

    cmd = [npm, "run", "dev", "--"] + list(args)
    try:
        subprocess.run(cmd, cwd=ROOT, check=True)
    except KeyboardInterrupt:
        print("\nStopped.")
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode)


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    check_node()
    ensure_deps()

    argv = sys.argv[1:]

    # ── web (default) ────────────────────────────────────────────────────────
    if not argv or argv[0] in ("web", "--web", "-w"):
        port = "3000"
        i = 0
        while i < len(argv):
            if argv[i] in ("--port", "-p") and i + 1 < len(argv):
                port = argv[i + 1]
            i += 1
        print(f"Starting web interface → http://localhost:{port}")
        run("web", "--port", port)

    # ── analyze ──────────────────────────────────────────────────────────────
    elif argv[0] in ("analyze", "--analyze", "-a"):
        if len(argv) < 2:
            print("Usage: python start.py analyze <owner/repo> [options]")
            print("       python start.py analyze https://github.com/owner/repo")
            sys.exit(1)
        run(*argv)

    # ── help ─────────────────────────────────────────────────────────────────
    elif argv[0] in ("help", "--help", "-h"):
        print(__doc__)

    # ── pass-through ─────────────────────────────────────────────────────────
    else:
        run(*argv)


if __name__ == "__main__":
    main()
