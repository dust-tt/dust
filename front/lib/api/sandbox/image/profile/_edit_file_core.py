#!/usr/bin/env python3
"""edit_file: Replace text in files with LLM error correction.

Usage: edit_file [--replace-all] <old_text> <new_text> <path1> [path2]...

Features:
  - Quote normalization: curly quotes in file matched by straight quotes
  - Desanitization: API-sanitized tags matched to originals
  - Trailing whitespace stripping (except .md/.mdx)
  - Smart delete: empty new_text removes old_text and its trailing newline
  - replace-all: replaces all occurrences instead of requiring uniqueness
  - Unified diff output after each edit
"""

import difflib
import json
import mmap
import os
import re
import sys
import tempfile

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
    "\n\nH:": "\n\nHuman:",
    "\n\nA:": "\n\nAssistant:",
}

BINARY_CHECK_BYTES = 8192


def is_binary_file(path):
    """Check if file is binary by reading the first 8KB for null bytes."""
    try:
        with open(path, "rb") as f:
            chunk = f.read(BINARY_CHECK_BYTES)
        return b"\x00" in chunk
    except OSError:
        return False


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
    orig_lines = original.splitlines(keepends=True)
    mod_lines = modified.splitlines(keepends=True)
    return "".join(difflib.unified_diff(
        orig_lines, mod_lines,
        fromfile=file_path, tofile=file_path,
        n=context_lines,
    ))


def edit_one_file(file_path, old_text, new_text, replace_all, is_markdown):
    if not os.path.isfile(file_path):
        return 1, f"Error: file not found: {file_path}"

    if os.path.getsize(file_path) == 0:
        return 1, f"Error: file is empty: {file_path}"

    if is_binary_file(file_path):
        return 1, f"Error: binary file detected: {file_path} (use write_file for binary files)"

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            file_content = f.read()
    except UnicodeDecodeError:
        return 1, f"Error: binary file detected: {file_path}"

    if not is_markdown:
        new_text = strip_trailing_whitespace(new_text)

    actual_old, original_old, match_method = find_match(file_content, old_text)

    if actual_old is None:
        return 1, f"Error: old_text not found in {file_path}"

    occurrences = count_occurrences(file_content, actual_old)

    if not replace_all and occurrences > 1:
        return 1, f"Error: old_text matches {occurrences} times in {file_path}, must be unique (use --replace-all to replace all)"

    effective_new = new_text
    if match_method == "quote_normalized":
        effective_new = preserve_quote_style(original_old, actual_old, new_text)
    elif match_method == "desanitized":
        _, applied = desanitize(original_old)
        for sanitized, original in applied:
            effective_new = effective_new.replace(sanitized, original)

    if effective_new == "":
        modified = smart_delete(file_content, actual_old, replace_all)
    else:
        modified = apply_edit(file_content, actual_old, effective_new, replace_all)

    if modified == file_content:
        return 1, f"Error: edit produced no changes in {file_path}"

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
        return 1, f"Error: failed to write {file_path}: {e}"

    diff_output = make_diff(file_path, file_content, modified)
    if diff_output:
        print(diff_output, file=sys.stderr)

    msg = f"Edited {file_path}"
    if match_method == "quote_normalized":
        msg += " (matched via quote normalization)"
    elif match_method == "desanitized":
        msg += " (matched via desanitization)"

    return 0, msg


def print_help():
    print("""edit_file - Replace text in files with LLM error correction

Usage: edit_file [--replace-all] <old_text> <new_text> <path1> [path2]...

Options:
  --replace-all   Replace all occurrences instead of requiring uniqueness

Arguments:
  old_text    Text to find and replace (required)
  new_text    Replacement text (can be empty for deletion)
  path1...    One or more files to edit (required)

Matching:
  1. Exact match (tried first)
  2. Quote normalization: curly quotes in file matched by straight quotes
  3. Desanitization: API-sanitized tags matched to originals

Behavior:
  - Trailing whitespace is stripped from new_text (except .md/.mdx files)
  - Empty new_text removes old_text and its trailing newline (smart delete)
  - Shows a unified diff snippet after each edit

Output: "Edited <path>" for each successful edit, diff on stderr

Errors: Fails per-file if old_text not found or matches multiple times

Examples:
  edit_file "hello" "world" file.txt              # Replace in one file
  edit_file "foo" "bar" a.txt b.txt c.txt         # Replace in multiple files
  edit_file "debug" "" config.js                  # Remove text (smart delete)
  edit_file --replace-all "old" "new" src/*.py    # Replace all occurrences""")


def main():
    args = sys.argv[1:]

    if "--help" in args or "-h" in args:
        print_help()
        sys.exit(0)

    if not args:
        print("Error: old_text, new_text, and at least one path are required", file=sys.stderr)
        print("Usage: edit_file [--replace-all] <old_text> <new_text> <path1> [path2]...", file=sys.stderr)
        print("Run 'edit_file --help' for more information.", file=sys.stderr)
        sys.exit(1)

    replace_all = False
    while args and args[0].startswith("--"):
        if args[0] == "--replace-all":
            replace_all = True
            args.pop(0)
        else:
            break

    if len(args) < 3:
        print("Error: old_text, new_text, and at least one path are required", file=sys.stderr)
        print("Usage: edit_file [--replace-all] <old_text> <new_text> <path1> [path2]...", file=sys.stderr)
        print("Run 'edit_file --help' for more information.", file=sys.stderr)
        sys.exit(1)

    old_text = args[0]
    new_text = args[1]
    paths = args[2:]

    failed = False
    for file_path in paths:
        is_markdown = bool(re.search(r"\.(md|mdx)$", file_path, re.IGNORECASE))
        exit_code, message = edit_one_file(file_path, old_text, new_text, replace_all, is_markdown)
        if exit_code != 0:
            print(message, file=sys.stderr)
            failed = True
        else:
            print(message)

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
