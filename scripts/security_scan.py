#!/usr/bin/env python3
"""WU-09: offline, dependency-free *guardrail*, not a substitute for SAST or pentesting.

Reports high-confidence dangerous APIs / accidentally tracked local data.
No shell execution, data exports, dependency updates, or network requests.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess

BLOCKED_PATTERNS = (
    ("dynamic-code-execution", re.compile(r"\b(?:eval|Function)\s*\(|\bnew\s+Function\s*\(")),
    ("unsafe-html-sink", re.compile(r"\bdangerouslySetInnerHTML\b|(?:\.innerHTML\s*=|\bdocument\.write\s*\()")),
    ("unsafe-python-deserialization", re.compile(r"\b(?:pickle\.loads?|yaml\.unsafe_load|marshal\.loads?)\s*\(")),
    ("unbounded-archive-extraction", re.compile(r"\b(?:extractall|unpack_archive)\s*\(")),
    ("shell-execution", re.compile(r"\bshell\s*=\s*True\b")),
)
# Avoid printing potential secrets themselves into CI or developer reports.
SECRET_ASSIGNMENT = re.compile(r"\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*['\"][^'\"\n]{12,}['\"]", re.I)
LOCAL_ONLY_PATHS = ("data/raw/", "public/data/")
PRIVATE_SUFFIXES = {".pem", ".p12", ".pfx", ".key"}
PRIVATE_FILENAMES = {".env", "id_rsa", "id_ed25519", "credentials.json"}


def tracked_paths(root: Path) -> tuple[list[str], bool]:
    """Use Git's staged/tracked file inventory; fallback is only a local source scan."""
    result = subprocess.run(["git", "-C", str(root), "ls-files", "-z", "--cached"],
                            capture_output=True, check=False)
    if result.returncode == 0:
        return [name.decode("utf-8", errors="replace").replace("\\", "/")
                for name in result.stdout.split(b"\0") if name], True
    paths = []
    for directory in ("src", "scripts"):
        folder = root / directory
        if folder.is_dir():
            paths.extend(p.relative_to(root).as_posix() for p in folder.rglob("*") if p.is_file())
    return paths, False


def scan(root: Path, paths: list[str], *, git_inventory: bool) -> list[dict[str, object]]:
    findings: list[dict[str, object]] = []
    for rel in sorted(set(paths)):
        basename = Path(rel).name.lower()
        if (any(rel.startswith(prefix) for prefix in LOCAL_ONLY_PATHS) or Path(rel).suffix.lower() in PRIVATE_SUFFIXES
                or basename in PRIVATE_FILENAMES or (basename.startswith('.env.') and basename != '.env.example')):
            if git_inventory:
                findings.append({"rule": "private-artifact-tracked", "file": rel})
            continue
        if not (rel.startswith("src/") or rel.startswith("scripts/")):
            continue
        if rel == "scripts/security_scan.py" or Path(rel).suffix not in {".py", ".ts", ".tsx", ".js", ".mjs"}:
            continue
        file = root / rel
        if not file.is_file() or file.stat().st_size > 1024 * 1024:
            continue
        for number, line in enumerate(file.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            stripped = line.lstrip()
            if stripped.startswith(("//", "#", "*")):
                continue
            if SECRET_ASSIGNMENT.search(line):
                findings.append({"rule": "possible-hardcoded-secret", "file": rel, "line": number})
            for name, regex in BLOCKED_PATTERNS:
                if regex.search(line):
                    findings.append({"rule": name, "file": rel, "line": number})
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Offline WU-09 source and tracked-artifact security guardrail")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    options = parser.parse_args()
    root = options.root.resolve()
    paths, git_inventory = tracked_paths(root)
    findings = scan(root, paths, git_inventory=git_inventory)
    print(json.dumps({"status": "pass" if not findings else "fail", "scope": "git-tracked" if git_inventory else "source-only-fallback",
                      "filesExamined": len(paths), "findings": findings}, indent=2))
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
