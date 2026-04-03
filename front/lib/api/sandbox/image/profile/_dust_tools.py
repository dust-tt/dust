#!/usr/bin/env python3
"""Dust sandbox profile tools.

Single Python module providing all file/search tools for the sandbox environment.
Provider-specific behavior is selected via the DUST_PROFILE environment variable
(anthropic, openai, gemini). Defaults to anthropic.

Usage: python3 _dust_tools.py <tool_name> [args...]
"""

import difflib
import heapq
import itertools
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import PurePosixPath

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_OUTPUT_BYTES = 48_000  # 2KB headroom for TS-level truncation
MAX_OUTPUT_LINES = 1_500   # Headroom for formatExecOutput's 2000-line cap
MAX_DIFF_BYTES = 16_000
MAX_DIFF_LINES = 400
BINARY_CHECK_BYTES = 8192
DEFAULT_READ_LIMIT = 2000
DEFAULT_LIST_LIMIT = 200
DEFAULT_GREP_MAX_RESULTS = 200
DEFAULT_LIST_DIR_DEPTH = 2
MAX_LIST_DIR_DEPTH = 5
HELP_FLAGS = frozenset({"--help", "-h"})

PROFILES = ("anthropic", "openai", "gemini")

_PROFILE = "anthropic"


def get_profile():
    return _PROFILE


# ---------------------------------------------------------------------------
# Shared Utilities
# ---------------------------------------------------------------------------

def is_binary(path):
    """Check if file is binary by scanning the first 8KB for null bytes."""
    try:
        with open(path, "rb") as f:
            chunk = f.read(BINARY_CHECK_BYTES)
        return b"\x00" in chunk
    except OSError:
        return False


def count_lines_fast(path):
    """Count total lines in a file using buffered reading (no full load)."""
    count = 0
    last_byte = None
    try:
        with open(path, "rb") as f:
            buf = f.read(65536)
            while buf:
                count += buf.count(b"\n")
                last_byte = buf[-1:]
                buf = f.read(65536)
    except OSError:
        return 0
    if last_byte is not None and last_byte != b"\n":
        count += 1
    return count


def stream_lines(path, start_line, max_count):
    """Yield up to max_count lines starting at start_line (1-indexed).

    Uses itertools.islice over readline() -- never loads the full file.
    """
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        # Skip to start_line (1-indexed, so skip start_line - 1 lines)
        skipped = itertools.islice(f, start_line - 1, None)
        for line in itertools.islice(skipped, max_count):
            yield line


def safe_output(text, max_bytes=MAX_OUTPUT_BYTES, max_lines=MAX_OUTPUT_LINES):
    """Truncate text at a line boundary to fit within byte and line budgets."""
    lines = text.splitlines()
    if (
        len(lines) <= max_lines
        and len(text.encode("utf-8", errors="replace")) <= max_bytes
    ):
        return text, False

    result_lines = []
    current_bytes = 0
    was_truncated = False
    for index, line in enumerate(lines):
        if index >= max_lines:
            was_truncated = True
            break
        line_bytes = len((line + "\n").encode("utf-8", errors="replace"))
        if current_bytes + line_bytes > max_bytes:
            was_truncated = True
            break
        result_lines.append(line)
        current_bytes += line_bytes

    return "\n".join(result_lines), was_truncated


def paginate(items, offset, limit):
    """Paginate a list. Returns (page, total, has_more)."""
    total = len(items)
    page = items[offset:offset + limit]
    has_more = (offset + limit) < total
    return page, total, has_more


def sorted_output(items):
    """Sort items alphabetically for deterministic output."""
    return sorted(items)


def wants_help(args):
    return len(args) == 1 and args[0] in HELP_FLAGS


def count_output_lines(text):
    if not text:
        return 0
    return len(text.splitlines())


def parse_int_arg(raw_value, label, minimum=None, maximum=None):
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        error(f"invalid value for {label}: {raw_value!r} (expected integer)")

    if minimum is not None and value < minimum:
        error(f"invalid value for {label}: {value} (must be >= {minimum})")
    if maximum is not None and value > maximum:
        error(f"invalid value for {label}: {value} (must be <= {maximum})")
    return value


def next_offset_for_page(offset, shown):
    return offset + max(shown, 1)


def format_pagination_footer(shown, offset, noun):
    next_offset = next_offset_for_page(offset, shown)
    return f"[{shown} {noun} shown. More results available. Next offset: {next_offset}]"


def print_paginated_output(page, offset, has_more, noun):
    output_text = "\n".join(page)
    output_text, was_truncated = safe_output(output_text)
    shown = count_output_lines(output_text)

    if output_text:
        print(output_text)

    if has_more or was_truncated:
        print(f"\n{format_pagination_footer(shown, offset, noun)}")


def collect_stream_page(items, offset, limit):
    """Collect a page from an iterator without exhausting the full stream."""
    page = []
    skipped = 0

    for item in items:
        if skipped < offset:
            skipped += 1
            continue
        if len(page) >= limit:
            return page, True
        page.append(item)

    return page, False


def error(msg):
    """Print error to stderr and exit with code 1."""
    print(f"Error: {msg}", file=sys.stderr)
    sys.exit(1)


def error_with_usage(msg, usage):
    """Print error with usage hint to stderr and exit."""
    print(f"Error: {msg}", file=sys.stderr)
    print(f"Usage: {usage}", file=sys.stderr)
    print("Run with --help for more information.", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# read_file
# ---------------------------------------------------------------------------

READ_FILE_USAGE_ANTHROPIC = "read_file <path> [offset] [limit]"
READ_FILE_USAGE_GEMINI = "read_file <path> [start] [end]"

READ_FILE_HELP_ANTHROPIC = """\
read_file - Read file with line numbers

Usage: read_file <path> [offset] [limit]

Arguments:
  path    File to read (required)
  offset  First line to read, 1-indexed (default: 1)
  limit   Maximum number of lines to return (default: 2000)

Output format:
  Header:  [File: path | Lines: offset-(offset+N-1) of totalLines]
  Body:    Numbered lines (format: '  N\\tcontent')

Examples:
  read_file file.txt              # Read first 2000 lines
  read_file file.txt 100          # Read from line 100, up to 2000 lines
  read_file file.txt 100 50       # Read 50 lines starting at line 100"""

READ_FILE_HELP_GEMINI = """\
read_file - Read file with line numbers

Usage: read_file <path> [start] [end]

Arguments:
  path   File to read (required)
  start  First line to read, 1-indexed (default: 1)
  end    Last line to read, inclusive (default: start + 1999)

Output format:
  Header:  [File: path | Lines: start-end of totalLines]
  Body:    Numbered lines (format: '  N\\tcontent')

Examples:
  read_file file.txt              # Read first 2000 lines
  read_file file.txt 100          # Read from line 100 to line 2099
  read_file file.txt 100 150      # Read lines 100-150 (inclusive)"""


def cmd_read_file(args):
    profile = get_profile()

    if wants_help(args):
        if profile == "gemini":
            print(READ_FILE_HELP_GEMINI)
        else:
            print(READ_FILE_HELP_ANTHROPIC)
        return

    usage = READ_FILE_USAGE_GEMINI if profile == "gemini" else READ_FILE_USAGE_ANTHROPIC

    if not args:
        error_with_usage("path is required", usage)

    path = args[0]

    if not os.path.isfile(path):
        error(f"file not found: {path}")

    if is_binary(path):
        error(f"binary file detected: {path} (use shell to inspect binary files)")

    total_lines = count_lines_fast(path)

    # Parse provider-specific pagination
    if profile == "gemini":
        start = (
            parse_int_arg(args[1], "start", minimum=1) if len(args) > 1 else 1
        )
        end = (
            parse_int_arg(args[2], "end", minimum=1)
            if len(args) > 2
            else start + DEFAULT_READ_LIMIT - 1
        )
        if start < 1:
            start = 1
        if end < start:
            error(f"end ({end}) must be >= start ({start})")
        limit = end - start + 1
        offset = start
    else:
        # anthropic / openai: offset + limit
        offset = (
            parse_int_arg(args[1], "offset", minimum=1) if len(args) > 1 else 1
        )
        limit = (
            parse_int_arg(args[2], "limit", minimum=1)
            if len(args) > 2
            else DEFAULT_READ_LIMIT
        )
        if offset < 1:
            offset = 1

    # Enforce byte budget: estimate ~120 bytes/line average, cap limit
    max_lines_for_budget = MAX_OUTPUT_BYTES // 120
    if limit > max_lines_for_budget:
        limit = max_lines_for_budget

    # Collect lines with streaming
    output_lines = []
    line_num = offset
    byte_count = 0
    for line in stream_lines(path, offset, limit):
        stripped = line.rstrip("\n").rstrip("\r")
        formatted = f"     {line_num}\t{stripped}"
        line_bytes = len(formatted.encode("utf-8", errors="replace")) + 1  # +1 for newline
        if byte_count + line_bytes > MAX_OUTPUT_BYTES and output_lines:
            break
        output_lines.append(formatted)
        byte_count += line_bytes
        line_num += 1

    actual_end = offset + len(output_lines) - 1 if output_lines else offset

    # Build header
    if profile == "gemini":
        header = f"[File: {path} | Lines: {offset}-{actual_end} of {total_lines}]"
    else:
        header = f"[File: {path} | Lines: {offset}-{actual_end} of {total_lines}]"

    print(header)
    for line in output_lines:
        print(line)


# ---------------------------------------------------------------------------
# write_file
# ---------------------------------------------------------------------------

WRITE_FILE_USAGE = "write_file <path> <content>"

WRITE_FILE_HELP = """\
write_file - Write content to file (atomic, creates parent directories)

Usage: write_file <path> <content>

Arguments:
  path     File path to write to (required)
  content  Content to write (can be empty)

Output: "Wrote <path> (<bytes> bytes)" on success

Examples:
  write_file file.txt "Hello, world!"     # Write to file
  write_file nested/dir/file.txt "data"   # Creates parent dirs
  write_file config.json '{"key": "val"}' # Write JSON"""


def cmd_write_file(args):
    if wants_help(args):
        print(WRITE_FILE_HELP)
        return

    if not args:
        error_with_usage("path is required", WRITE_FILE_USAGE)

    file_path = args[0]
    content = args[1] if len(args) > 1 else ""

    dir_name = os.path.dirname(os.path.abspath(file_path))
    if not os.path.isdir(dir_name):
        os.makedirs(dir_name, exist_ok=True)

    # Atomic write: temp file + rename
    import tempfile
    fd, tmp_path = tempfile.mkstemp(dir=dir_name, prefix=".write_file_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp_path, file_path)
    except Exception as e:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        error(f"failed to write {file_path}: {e}")

    byte_count = len(content.encode("utf-8"))
    print(f"Wrote {file_path} ({byte_count} bytes)")


# ---------------------------------------------------------------------------
# glob
# ---------------------------------------------------------------------------

GLOB_USAGE = 'glob <pattern> [--path PATH] [--offset N] [--limit N]'

GLOB_HELP = """\
glob - Find files by glob pattern

Usage: glob <pattern> [--path PATH] [--offset N] [--limit N]

Arguments:
  pattern    Glob pattern, e.g., "*.py", "**/*.ts" (required)

Options:
  --path     Directory to search (default: .)
  --offset   Skip first N results for pagination (default: 0)
  --limit    Max results to return (default: 200)

Output: Sorted file paths, one per line. Pagination hint when more results exist.

Examples:
  glob "*.txt"                       # Find .txt files in current dir
  glob "**/*.py"                     # Find all Python files recursively
  glob "*.{js,ts}" --path src/       # Find JS/TS files in src/
  glob "test_*.py" --offset 200      # Page 2 of results"""


def parse_named_args(args, flags):
    """Parse named --flag value arguments. Returns (positional, named_dict)."""
    positional = []
    named = {}
    i = 0
    while i < len(args):
        if args[i] == "--":
            positional.extend(args[i + 1 :])
            break
        if args[i].startswith("--") and args[i][2:] in flags:
            key = args[i][2:]
            if i + 1 < len(args):
                named[key] = args[i + 1]
                i += 2
            else:
                error(f"--{key} requires a value")
        else:
            positional.append(args[i])
            i += 1
    return positional, named


def _expand_braces(pattern):
    start = pattern.find("{")
    if start == -1:
        return [pattern]

    depth = 0
    end = None
    for index in range(start, len(pattern)):
        if pattern[index] == "{":
            depth += 1
        elif pattern[index] == "}":
            depth -= 1
            if depth == 0:
                end = index
                break

    if end is None:
        return [pattern]

    body = pattern[start + 1 : end]
    parts = []
    current = []
    depth = 0
    for ch in body:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch == "," and depth == 0:
            parts.append("".join(current))
            current = []
            continue
        current.append(ch)
    parts.append("".join(current))

    expanded = []
    prefix = pattern[:start]
    suffix = pattern[end + 1 :]
    for part in parts:
        expanded.extend(_expand_braces(prefix + part + suffix))
    return expanded


def compile_glob_patterns(pattern):
    compiled = []
    seen = set()
    for expanded in _expand_braces(pattern):
        candidates = [expanded]
        if expanded.startswith("**/"):
            candidates.append(expanded[3:])
        for candidate in candidates:
            if candidate and candidate not in seen:
                seen.add(candidate)
                compiled.append(candidate)
    return compiled


def path_matches_glob(rel_path, patterns):
    pure_path = PurePosixPath(rel_path)
    return any(pure_path.match(pattern) for pattern in patterns)


def iter_glob_matches(pattern, search_path):
    compiled_patterns = compile_glob_patterns(pattern)
    heap = []

    def push_path(path):
        is_symlink = os.path.islink(path)
        is_dir = os.path.isdir(path) and not is_symlink
        heapq.heappush(heap, (path, path, is_dir))

    if os.path.isdir(search_path):
        try:
            with os.scandir(search_path) as entries:
                for entry in entries:
                    push_path(os.path.join(search_path, entry.name))
        except OSError:
            return
    elif os.path.isfile(search_path) or os.path.islink(search_path):
        push_path(search_path)
    else:
        return

    while heap:
        _, current_path, is_dir = heapq.heappop(heap)
        if is_dir:
            try:
                with os.scandir(current_path) as entries:
                    for entry in entries:
                        push_path(os.path.join(current_path, entry.name))
            except OSError:
                pass
            continue

        if os.path.isdir(search_path):
            rel_path = os.path.relpath(current_path, search_path)
        else:
            rel_path = os.path.basename(current_path)
        rel_path = rel_path.replace(os.sep, "/")

        if path_matches_glob(rel_path, compiled_patterns):
            yield current_path


def cmd_glob(args):
    if wants_help(args):
        print(GLOB_HELP)
        return

    positional, named = parse_named_args(args, {"path", "offset", "limit"})

    if not positional:
        error_with_usage("pattern is required", GLOB_USAGE)

    pattern = positional[0]
    # Support both: glob "*.py" /some/path  AND  glob "*.py" --path /some/path
    search_path = named.get("path", positional[1] if len(positional) > 1 else ".")
    offset = parse_int_arg(named.get("offset", "0"), "--offset", minimum=0)
    limit = parse_int_arg(
        named.get("limit", str(DEFAULT_LIST_LIMIT)), "--limit", minimum=1
    )

    page, has_more = collect_stream_page(
        iter_glob_matches(pattern, search_path), offset, limit
    )
    print_paginated_output(page, offset, has_more, "entries")


# ---------------------------------------------------------------------------
# list_dir
# ---------------------------------------------------------------------------

LIST_DIR_USAGE = "list_dir [path] [--depth N] [--offset N] [--limit N]"

LIST_DIR_HELP = """\
list_dir - List directory contents with type indicators

Usage: list_dir [path] [--depth N] [--offset N] [--limit N]

Arguments:
  path      Directory to list (default: .)

Options:
  --depth   Max depth to recurse (default: 2, max: 5)
  --offset  Skip first N results for pagination (default: 0)
  --limit   Max results to return (default: 200)

Output: Sorted paths with type suffixes (/ for dirs, @ for symlinks).
        Pagination hint when more results exist.

Examples:
  list_dir                           # List current dir, depth 2
  list_dir /home/agent               # List specific directory
  list_dir . --depth 1               # No recursion
  list_dir src/ --depth 3 --limit 50 # Custom depth and limit"""


def cmd_list_dir(args):
    if wants_help(args):
        print(LIST_DIR_HELP)
        return

    positional, named = parse_named_args(args, {"depth", "offset", "limit"})

    dir_path = positional[0] if positional else "."
    depth = min(
        parse_int_arg(named.get("depth", str(DEFAULT_LIST_DIR_DEPTH)), "--depth", minimum=0),
        MAX_LIST_DIR_DEPTH,
    )
    offset = parse_int_arg(named.get("offset", "0"), "--offset", minimum=0)
    limit = parse_int_arg(
        named.get("limit", str(DEFAULT_LIST_LIMIT)), "--limit", minimum=1
    )

    if not os.path.isdir(dir_path):
        error(f"directory not found: {dir_path}")

    def iter_entries():
        heap = []

        def push_children(parent_path, entry_depth):
            try:
                with os.scandir(parent_path) as entries:
                    for entry in entries:
                        full = os.path.join(parent_path, entry.name)
                        is_symlink = entry.is_symlink()
                        try:
                            is_dir = entry.is_dir(follow_symlinks=False)
                        except OSError:
                            is_dir = False
                        suffix = "@" if is_symlink else "/" if is_dir else ""
                        display_path = full + suffix
                        heapq.heappush(
                            heap,
                            (display_path, full, is_dir, is_symlink, entry_depth),
                        )
            except OSError:
                return

        push_children(dir_path, 1)
        while heap:
            display_path, full, is_dir, is_symlink, entry_depth = heapq.heappop(heap)
            yield display_path
            if is_dir and not is_symlink and entry_depth < depth:
                push_children(full, entry_depth + 1)

    page, has_more = collect_stream_page(iter_entries(), offset, limit)
    print_paginated_output(page, offset, has_more, "entries")


# ---------------------------------------------------------------------------
# grep_files
# ---------------------------------------------------------------------------

GREP_USAGE_BASE = "grep_files <pattern> [--glob GLOB] [--path PATH] [--max-results N] [--max-per-file N] [--context N] [--offset N]"
GREP_USAGE_ANTHROPIC = GREP_USAGE_BASE + " [--output-mode content|files|count] [--case-insensitive] [--max-line-length N]"

GREP_HELP_BASE = """\
grep_files - Search files for regex pattern using ripgrep

Usage: {usage}

Arguments:
  pattern           Regex pattern to search for (required)

Options:
  --glob            File glob filter, e.g., "*.py"
  --path            Directory to search (default: .)
  --max-results     Max total matches to return (default: 200)
  --max-per-file    Max matches per file (passed to rg --max-count)
  --context         Lines before/after each match (default: 0)
  --offset          Skip first N result lines for pagination (default: 0)"""

GREP_HELP_ANTHROPIC_EXTRA = """
  --output-mode     Output mode: content (default), files, count
  --case-insensitive  Case-insensitive search
  --max-line-length Max chars per output line (clips long lines, default: 500)"""

GREP_HELP_EXAMPLES = """
Examples:
  grep_files "TODO"                            # Search all files
  grep_files "import" --glob "*.py"            # Search Python files
  grep_files "error" --path /var/log --context 3
  grep_files "func" --max-results 50 --offset 50"""


def cmd_grep_files(args):
    profile = get_profile()

    if wants_help(args):
        usage = GREP_USAGE_ANTHROPIC if profile == "anthropic" else GREP_USAGE_BASE
        help_text = GREP_HELP_BASE.format(usage=usage)
        if profile == "anthropic":
            help_text += GREP_HELP_ANTHROPIC_EXTRA
        help_text += GREP_HELP_EXAMPLES
        print(help_text)
        return

    all_flags = {"glob", "path", "max-results", "max-per-file", "context", "offset"}
    anthropic_flags = {"output-mode", "max-line-length"}
    bool_flags = set()

    if profile == "anthropic":
        all_flags |= anthropic_flags
        bool_flags.add("case-insensitive")

    # Parse: separate boolean flags from value flags
    positional = []
    named = {}
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "--":
            positional.extend(args[i + 1 :])
            break
        if not positional:
            if arg == "--case-insensitive" and "case-insensitive" in bool_flags:
                named["case-insensitive"] = "true"
                i += 1
                continue
            if arg.startswith("--"):
                key = arg[2:]
                if key in all_flags:
                    if i + 1 < len(args):
                        named[key] = args[i + 1]
                        i += 2
                        continue
                    error(f"--{key} requires a value")
            positional.append(arg)
            i += 1
            continue
        if arg == "--case-insensitive" and "case-insensitive" in bool_flags:
            named["case-insensitive"] = "true"
            i += 1
        elif arg.startswith("--"):
            key = arg[2:]
            if key in all_flags:
                if i + 1 < len(args):
                    named[key] = args[i + 1]
                    i += 2
                else:
                    error(f"--{key} requires a value")
            else:
                error(f"unknown flag: {arg}")
        else:
            positional.append(arg)
            i += 1

    usage = GREP_USAGE_ANTHROPIC if profile == "anthropic" else GREP_USAGE_BASE
    if not positional:
        error_with_usage("pattern is required", usage)

    pattern = positional[0]
    search_path = named.get("path", ".")
    max_results = parse_int_arg(
        named.get("max-results", str(DEFAULT_GREP_MAX_RESULTS)),
        "--max-results",
        minimum=1,
    )
    max_per_file = (
        parse_int_arg(named["max-per-file"], "--max-per-file", minimum=1)
        if "max-per-file" in named
        else None
    )
    context_lines = parse_int_arg(named.get("context", "0"), "--context", minimum=0)
    offset = parse_int_arg(named.get("offset", "0"), "--offset", minimum=0)
    file_glob = named.get("glob")

    # Anthropic-specific
    output_mode = named.get("output-mode", "content") if profile == "anthropic" else "content"
    case_insensitive = named.get("case-insensitive") == "true"
    max_line_length = (
        parse_int_arg(named.get("max-line-length", "500"), "--max-line-length", minimum=1)
        if profile == "anthropic"
        else None
    )

    if output_mode not in {"content", "files", "count"}:
        error(
            "invalid value for --output-mode: "
            f"{output_mode!r} (expected content, files, or count)"
        )

    # Build rg command
    rg_args = ["rg", "--color=never"]

    if output_mode == "files":
        rg_args.append("--files-with-matches")
    elif output_mode == "count":
        rg_args.append("--count")
    else:
        rg_args.append("-n")  # line numbers

    if case_insensitive:
        rg_args.append("-i")

    if file_glob:
        rg_args.extend(["--glob", file_glob])

    if max_per_file:
        rg_args.extend(["--max-count", max_per_file])

    if context_lines > 0:
        rg_args.extend(["-C", str(context_lines)])

    if max_line_length and output_mode == "content":
        rg_args.extend(["--max-columns", str(max_line_length)])

    rg_args.append("--sort=path")  # Sorted by file path for determinism
    rg_args.extend(["-e", pattern])
    rg_args.append(search_path)

    try:
        proc = subprocess.Popen(
            rg_args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
    except FileNotFoundError:
        error("rg not installed")

    page = []
    skipped = 0
    has_more = False
    stderr_text = ""

    try:
        assert proc.stdout is not None
        for raw_line in proc.stdout:
            line = raw_line.rstrip("\n").rstrip("\r")
            if skipped < offset:
                skipped += 1
                continue
            if len(page) >= max_results:
                has_more = True
                break
            page.append(line)
    finally:
        if proc.stdout is not None:
            proc.stdout.close()

    if has_more and proc.poll() is None:
        proc.terminate()

    try:
        _, stderr_text = proc.communicate(timeout=1 if has_more else None)
    except subprocess.TimeoutExpired:
        proc.kill()
        _, stderr_text = proc.communicate()

    if proc.returncode == 2:
        error(stderr_text.strip() if stderr_text else "grep failed")

    if page:
        print_paginated_output(page, offset, has_more, "results")
    elif proc.returncode == 1:
        print("No matches found.")


# ---------------------------------------------------------------------------
# edit_file (shared core logic from _edit_file_core.py)
# ---------------------------------------------------------------------------

CURLY_TO_STRAIGHT = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
}

OPENING_CONTEXT = frozenset(" \t\n\r([{\u2014\u2013")

DESANITIZATIONS = {
    "<fnr>": "<function_results>",
    "<n>": "<name>",
    "</n>": "</name>",
    "<o>": "<output>",
    "</o>": "</output>",
    "<e>": "<error>",
    "</e>": "</error>",
    "<s>": "<system>",
    "</s>": "</system>",
    "<r>": "<result>",
    "</r>": "</result>",
}


def normalize_quotes(s):
    for curly, straight in CURLY_TO_STRAIGHT.items():
        s = s.replace(curly, straight)
    return s


def _is_opening_context(chars, index):
    if index == 0:
        return True
    return chars[index - 1] in OPENING_CONTEXT


def apply_curly_double_quotes(s):
    chars = list(s)
    result = []
    for i, ch in enumerate(chars):
        if ch == '"':
            result.append("\u201c" if _is_opening_context(chars, i) else "\u201d")
        else:
            result.append(ch)
    return "".join(result)


def apply_curly_single_quotes(s):
    chars = list(s)
    result = []
    for i, ch in enumerate(chars):
        if ch == "'":
            prev = chars[i - 1] if i > 0 else None
            nxt = chars[i + 1] if i < len(chars) - 1 else None
            if prev and prev.isalpha() and nxt and nxt.isalpha():
                result.append("\u2019")
            else:
                result.append("\u2018" if _is_opening_context(chars, i) else "\u2019")
        else:
            result.append(ch)
    return "".join(result)


def preserve_quote_style(old_string, actual_old_string, new_string):
    if old_string == actual_old_string:
        return new_string
    has_double = "\u201c" in actual_old_string or "\u201d" in actual_old_string
    has_single = "\u2018" in actual_old_string or "\u2019" in actual_old_string
    if not has_double and not has_single:
        return new_string
    result = new_string
    if has_double:
        result = apply_curly_double_quotes(result)
    if has_single:
        result = apply_curly_single_quotes(result)
    return result


def desanitize(s):
    applied = []
    result = s
    for sanitized, original in DESANITIZATIONS.items():
        if sanitized in result:
            result = result.replace(sanitized, original)
            applied.append((sanitized, original))
    return result, applied


def strip_trailing_whitespace(s):
    return re.sub(r"[ \t]+$", "", s, flags=re.MULTILINE)


def find_match(file_content, old_text):
    if old_text in file_content:
        return old_text, old_text, "exact"

    normalized_search = normalize_quotes(old_text)
    normalized_file = normalize_quotes(file_content)
    idx = normalized_file.find(normalized_search)
    if idx != -1:
        actual = file_content[idx : idx + len(old_text)]
        return actual, old_text, "quote_normalized"

    desanitized, applied = desanitize(old_text)
    if applied and desanitized in file_content:
        return desanitized, old_text, "desanitized"

    return None, old_text, "not_found"


def count_occurrences(file_content, search_text):
    count = 0
    start = 0
    while True:
        idx = file_content.find(search_text, start)
        if idx == -1:
            return count
        count += 1
        start = idx + 1


def apply_edit(content, old_text, new_text, replace_all):
    if replace_all:
        return content.replace(old_text, new_text)
    return content.replace(old_text, new_text, 1)


def smart_delete(content, old_text, replace_all):
    if old_text.endswith("\n"):
        return apply_edit(content, old_text, "", replace_all)
    candidate = old_text + "\n"
    if candidate in content:
        return apply_edit(content, candidate, "", replace_all)
    return apply_edit(content, old_text, "", replace_all)


def make_diff(file_path, original, modified, context_lines=4):
    original_missing_newline = bool(original) and not original.endswith("\n")
    modified_missing_newline = bool(modified) and not modified.endswith("\n")

    orig_lines = [
        line if line.endswith("\n") else line + "\n"
        for line in original.splitlines(keepends=True)
    ]
    mod_lines = [
        line if line.endswith("\n") else line + "\n"
        for line in modified.splitlines(keepends=True)
    ]
    diff_output = "".join(
        difflib.unified_diff(
            orig_lines,
            mod_lines,
            fromfile=file_path,
            tofile=file_path,
            n=context_lines,
        )
    )

    notes = []
    if original_missing_newline:
        notes.append("[No trailing newline in original file]")
    if modified_missing_newline:
        notes.append("[No trailing newline in updated file]")

    if notes:
        if diff_output and not diff_output.endswith("\n"):
            diff_output += "\n"
        diff_output += "\n".join(notes) + "\n"

    return diff_output


def truncate_diff_output(diff_output):
    diff_output, was_truncated = safe_output(
        diff_output,
        max_bytes=MAX_DIFF_BYTES,
        max_lines=MAX_DIFF_LINES,
    )
    if not was_truncated:
        return diff_output
    if diff_output and not diff_output.endswith("\n"):
        diff_output += "\n"
    shown = count_output_lines(diff_output)
    diff_output += (
        f"[Diff truncated after {shown} lines. "
        f"Byte budget: {MAX_DIFF_BYTES}, line budget: {MAX_DIFF_LINES}]\n"
    )
    return diff_output


def edit_one_file(file_path, old_text, new_text, replace_all, is_markdown, dry_run=False):
    """Core edit logic. Returns (exit_code, message, diff_output)."""
    if not os.path.isfile(file_path):
        return 1, f"Error: file not found: {file_path}", ""

    if os.path.getsize(file_path) == 0:
        return 1, f"Error: file is empty: {file_path}", ""

    if is_binary(file_path):
        return 1, f"Error: binary file detected: {file_path} (use write_file for binary files)", ""

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            file_content = f.read()
    except UnicodeDecodeError:
        return 1, f"Error: binary file detected: {file_path}", ""

    if not is_markdown:
        new_text = strip_trailing_whitespace(new_text)

    actual_old, original_old, match_method = find_match(file_content, old_text)

    if actual_old is None:
        return 1, f"Error: old_text not found in {file_path}", ""

    occurrences = count_occurrences(file_content, actual_old)

    if not replace_all and occurrences > 1:
        return 1, f"Error: old_text matches {occurrences} times in {file_path}, must be unique (use --replace-all to replace all)", ""

    effective_new = new_text
    if match_method == "quote_normalized":
        effective_new = preserve_quote_style(original_old, actual_old, new_text)

    if effective_new == "":
        modified = smart_delete(file_content, actual_old, replace_all)
    else:
        modified = apply_edit(file_content, actual_old, effective_new, replace_all)

    if modified == file_content:
        return 1, f"Error: edit produced no changes in {file_path}", ""

    diff_output = truncate_diff_output(make_diff(file_path, file_content, modified))

    if dry_run:
        msg = f"Preview for {file_path}"
        if match_method == "quote_normalized":
            msg += " (matched via quote normalization)"
        elif match_method == "desanitized":
            msg += " (matched via desanitization)"
        return 0, msg, diff_output

    # Atomic write via temp file in same directory
    dir_name = os.path.dirname(os.path.abspath(file_path))
    fd, tmp_path = tempfile.mkstemp(dir=dir_name, prefix=".edit_file_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(modified)
        os.replace(tmp_path, file_path)
    except Exception as e:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        return 1, f"Error: failed to write {file_path}: {e}", ""

    msg = f"Edited {file_path}"
    if match_method == "quote_normalized":
        msg += " (matched via quote normalization)"
    elif match_method == "desanitized":
        msg += " (matched via desanitization)"

    return 0, msg, diff_output


EDIT_FILE_USAGE_ANTHROPIC = "edit_file [--replace-all] [--edits-json JSON] <old_text> <new_text> <path>"
EDIT_FILE_USAGE_MULTI = "edit_file [--replace-all] <old_text> <new_text> <path1> [path2]..."

EDIT_FILE_HELP_ANTHROPIC = """\
edit_file - Replace text in a file with LLM error correction

Usage: edit_file [--replace-all] <old_text> <new_text> <path>
       edit_file --edits-json '[{"old": "...", "new": "..."}]' <path>

Options:
  --replace-all   Replace all occurrences instead of requiring uniqueness
  --edits-json    JSON array of edits applied sequentially to a single file

Arguments:
  old_text    Text to find and replace (required, unless --edits-json)
  new_text    Replacement text (can be empty for deletion)
  path        File to edit (required, single file only)

Matching:
  1. Exact match (tried first)
  2. Quote normalization: curly quotes in file matched by straight quotes
  3. Desanitization: API-sanitized tags matched to originals

Output: "Edited <path>" for each successful edit, diff on stderr"""

EDIT_FILE_HELP_GEMINI = """\
edit_file - Replace text in files, returns unified diff

Usage: edit_file [--replace-all] [--dry-run] <old_text> <new_text> <path1> [path2]...

Options:
  --replace-all   Replace all occurrences instead of requiring uniqueness
  --dry-run       Preview changes as unified diff without writing

Arguments:
  old_text    Text to find and replace (required)
  new_text    Replacement text (can be empty for deletion)
  path1...    One or more files to edit (required)

Output: "Edited <path>" per success, unified diff on stderr (or stdout with --dry-run)"""

EDIT_FILE_HELP_OPENAI = """\
edit_file - Replace text in files with LLM error correction

Usage: edit_file [--replace-all] <old_text> <new_text> <path1> [path2]...

Options:
  --replace-all   Replace all occurrences instead of requiring uniqueness

Arguments:
  old_text    Text to find and replace (required)
  new_text    Replacement text (can be empty for deletion)
  path1...    One or more files to edit (required)

Output: "Edited <path>" per success, unified diff on stderr"""


def _edit_file_standard(args, profile):
    """Standard edit_file: old_text new_text path(s). Used by openai/gemini."""
    dry_run = False
    replace_all = False
    remaining = list(args)
    while remaining and remaining[0].startswith("--"):
        if remaining[0] == "--":
            remaining.pop(0)
            break
        if remaining[0] == "--replace-all":
            replace_all = True
            remaining.pop(0)
        elif remaining[0] == "--dry-run" and profile == "gemini":
            dry_run = True
            remaining.pop(0)
        else:
            break

    usage = EDIT_FILE_USAGE_ANTHROPIC if profile == "anthropic" else EDIT_FILE_USAGE_MULTI
    if len(remaining) < 3:
        error_with_usage("old_text, new_text, and at least one path are required", usage)

    old_text = remaining[0]
    new_text = remaining[1]
    paths = remaining[2:]

    if profile == "anthropic" and len(paths) > 1:
        error("edit_file supports one file at a time (use --edits-json for multiple edits)")

    failed = False
    for file_path in paths:
        is_markdown = bool(re.search(r"\.(md|mdx)$", file_path, re.IGNORECASE))
        exit_code, message, diff_output = edit_one_file(
            file_path, old_text, new_text, replace_all, is_markdown, dry_run=dry_run
        )
        if exit_code != 0:
            print(message, file=sys.stderr)
            failed = True
        else:
            print(message)
            if diff_output:
                if dry_run:
                    print(diff_output)
                else:
                    print(diff_output, file=sys.stderr)

    if failed:
        sys.exit(1)


def _edit_file_edits_json(edits_json, path_arg):
    """Anthropic --edits-json mode: multiple edits on a single file."""
    try:
        edits = json.loads(edits_json)
    except json.JSONDecodeError as e:
        error(f"invalid JSON: {e}")

    if not isinstance(edits, list):
        error("--edits-json must be a JSON array")

    is_markdown = bool(re.search(r"\.(md|mdx)$", path_arg, re.IGNORECASE))

    for i, edit in enumerate(edits):
        if not isinstance(edit, dict) or "old" not in edit or "new" not in edit:
            error(f"edit #{i + 1}: must have 'old' and 'new' fields")

        replace_all = edit.get("replace_all", False)
        exit_code, message, diff_output = edit_one_file(
            path_arg, edit["old"], edit["new"], replace_all, is_markdown
        )
        if exit_code != 0:
            print(message, file=sys.stderr)
            print(f"Stopped at edit #{i + 1} of {len(edits)}", file=sys.stderr)
            sys.exit(1)
        else:
            print(message)
            if diff_output:
                print(diff_output, file=sys.stderr)


def cmd_edit_file(args):
    profile = get_profile()

    if wants_help(args):
        if profile == "anthropic":
            print(EDIT_FILE_HELP_ANTHROPIC)
        elif profile == "gemini":
            print(EDIT_FILE_HELP_GEMINI)
        else:
            print(EDIT_FILE_HELP_OPENAI)
        return

    if not args:
        usage = EDIT_FILE_USAGE_ANTHROPIC if profile == "anthropic" else EDIT_FILE_USAGE_MULTI
        error_with_usage("arguments required", usage)

    if profile == "anthropic":
        remaining = list(args)
        while remaining:
            current = remaining[0]
            if current == "--":
                break
            if current == "--replace-all":
                remaining.pop(0)
                continue
            if current == "--edits-json":
                remaining.pop(0)
                if not remaining:
                    error("--edits-json requires a JSON value followed by a path")
                edits_json = remaining.pop(0)
                if len(remaining) != 1:
                    error("--edits-json requires exactly one path argument after the JSON")
                _edit_file_edits_json(edits_json, remaining[0])
                return
            break

    _edit_file_standard(args, profile)


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

TOOLS = {
    "read_file": cmd_read_file,
    "write_file": cmd_write_file,
    "edit_file": cmd_edit_file,
    "glob": cmd_glob,
    "list_dir": cmd_list_dir,
    "grep_files": cmd_grep_files,
}


def main():
    global _PROFILE
    args = sys.argv[1:]

    if args and args[0] == "--profile" and len(args) > 1:
        _PROFILE = args[1] if args[1] in PROFILES else "anthropic"
        args = args[2:]

    if not args:
        print(f"Usage: {sys.argv[0]} [--profile NAME] <tool> [args...]", file=sys.stderr)
        print(f"Available tools: {', '.join(sorted(TOOLS.keys()))}", file=sys.stderr)
        sys.exit(1)

    tool_name = args[0]
    tool_args = args[1:]

    handler = TOOLS.get(tool_name)
    if not handler:
        print(f"Error: unknown tool: {tool_name}", file=sys.stderr)
        print(f"Available tools: {', '.join(sorted(TOOLS.keys()))}", file=sys.stderr)
        sys.exit(1)

    try:
        handler(tool_args)
    except BrokenPipeError:
        sys.exit(0)
    except SystemExit:
        raise
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
