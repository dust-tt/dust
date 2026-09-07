#!/usr/bin/env python3
"""Rewrite `op environment read` dotenv into zsh/bash-safe export lines.

JSON secrets (GCP service account keys) are stored as double-quoted dotenv
values. zsh treats `{` / `}` and some backslash escapes differently from bash,
so sourcing the raw dump can fail with `parse error near '}'`. Single-quoted
`export KEY=...` assignments are valid in both shells.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import sys
from pathlib import Path

KEY_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=")


def unescape_bash_double_quoted(inner: str) -> str:
    """Decode the inside of a bash double-quoted dotenv value."""
    out: list[str] = []
    i = 0
    while i < len(inner):
        if inner[i] == "\\" and i + 1 < len(inner):
            nxt = inner[i + 1]
            if nxt in '$`\\"':
                out.append(nxt)
                i += 2
                continue
            if nxt == "\n":
                i += 2
                continue
            out.append("\\")
            out.append(nxt)
            i += 2
            continue
        out.append(inner[i])
        i += 1
    return "".join(out)


def parse_value(rest: str) -> tuple[str, str]:
    """Return (value, remaining). remaining starts at the next assignment."""
    if rest.startswith("'"):
        end = rest.find("'", 1)
        if end == -1:
            raise ValueError("unterminated single-quoted value")
        return rest[1:end], rest[end + 1 :]

    if rest.startswith('"'):
        i = 1
        while i < len(rest):
            if rest[i] == "\\" and i + 1 < len(rest):
                i += 2
                continue
            if rest[i] == '"':
                inner = rest[1:i]
                return unescape_bash_double_quoted(inner), rest[i + 1 :]
            i += 1
        raise ValueError("unterminated double-quoted value")

    if rest.startswith("{"):
        depth = 0
        in_string = False
        escape = False
        for i, ch in enumerate(rest):
            if in_string:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return rest[: i + 1], rest[i + 1 :]
        raise ValueError("unterminated JSON object value")

    nl = rest.find("\n")
    if nl == -1:
        return rest, ""
    return rest[:nl], rest[nl:]


def parse_dotenv(content: str) -> dict[str, str]:
    env: dict[str, str] = {}
    i = 0
    length = len(content)
    while i < length:
        while i < length and content[i] in " \t\r\n":
            i += 1
        if i >= length:
            break
        if content[i] == "#":
            nl = content.find("\n", i)
            i = length if nl == -1 else nl + 1
            continue
        match = KEY_RE.match(content[i:])
        if not match:
            nl = content.find("\n", i)
            i = length if nl == -1 else nl + 1
            continue
        key = match.group(1)
        i += match.end()
        value, rest = parse_value(content[i:])
        env[key] = value
        i = len(content) - len(rest)
    return env


def write_sanitized(env: dict[str, str], dest: Path) -> None:
    lines = [
        "# Auto-generated from `op environment read`. Safe to source in bash and zsh.",
        "",
    ]
    for key, value in env.items():
        lines.append(f"export {key}={shlex.quote(value)}")
    dest.write_text("\n".join(lines) + "\n")
    dest.chmod(0o600)


def write_gcp_json(env: dict[str, str]) -> None:
    raw = env.get("GCP_SERVICE_ACCOUNT")
    if not raw:
        return
    path = Path(os.environ.get("SERVICE_ACCOUNT", "/tmp/dust-dev-sa.json"))
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"GCP_SERVICE_ACCOUNT is not valid JSON ({exc})", file=sys.stderr)
        path.write_text(raw)
    else:
        path.write_text(json.dumps(parsed, indent=2) + "\n")
    path.chmod(0o600)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: sanitize-op-env.py <input.env> <output.env>", file=sys.stderr)
        return 2
    src = Path(argv[1])
    dest = Path(argv[2])
    env = parse_dotenv(src.read_text())
    write_sanitized(env, dest)
    write_gcp_json(env)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
