import hashlib
import json
import random


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def make_corpus(count, seed):
    rng = random.Random(seed)
    rows = []
    for i in range(count):
        folder = ("public", "group", "private")[i % 3]
        text = "commonneedle " + " ".join(
            rng.choice(("planning", "engineering", "release", "customer"))
            for _ in range(40)
        )
        if i % 97 == 7:
            text += " rarebeacon"
        rows.append({"path": f"{folder}/document_{i:05d}.txt", "text": text})
    rows.extend(
        [
            {
                "path": "public/quarterly-plan.md",
                "text": "commonneedle quarterly plan café 東京",
            },
            {
                "path": "public/CustomerSuccess.txt",
                "text": "commonneedle customer retention",
            },
            {"path": "public/O'Brien.txt", "text": "commonneedle apostrophebeacon"},
            {"path": "public/café-東京.txt", "text": "commonneedle unicodebeacon"},
            {"path": "public/empty.txt", "text": ""},
            {"path": "public/duplicate.txt", "text": "commonneedle duplicatebeacon"},
            {"path": "private/duplicate.txt", "text": "commonneedle duplicatebeacon"},
            {"path": "private/shared.txt", "text": "commonneedle directbeacon"},
            {"path": "private/list-only.txt", "text": "commonneedle forbiddenbody"},
            {"path": "group/overlap.txt", "text": "commonneedle overlapbeacon"},
            {"path": "group/moving.txt", "text": "commonneedle movingbeacon"},
            {"path": "public/edit.txt", "text": "commonneedle beforeeditbeacon"},
            {"path": "public/delete.txt", "text": "commonneedle deletebeacon"},
            {"path": "public/replace-source.txt", "text": "commonneedle sourcebeacon"},
            {"path": "public/replace-target.txt", "text": "commonneedle targetbeacon"},
        ]
    )
    return {
        "schema": 1,
        "seed": seed,
        "files": rows,
        "empty_directories": ["public/empty-folder"],
    }


def write_corpus(corpus, root):
    root.mkdir(parents=True, exist_ok=False)
    for row in corpus["files"]:
        path = root / row["path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(row["text"], encoding="utf-8")
    for name in corpus["empty_directories"]:
        (root / name).mkdir(parents=True)


def query_cases(corpus):
    files = corpus["files"]
    cases = [
        {
            "name": "exact_name",
            "field": "name",
            "filter": "basename = 'quarterly-plan.md'",
            "expected": ["public/quarterly-plan.md"],
        },
        {
            "name": "prefix_name",
            "field": "name",
            "filter": "basename LIKE 'quarterly%'",
            "expected": ["public/quarterly-plan.md"],
        },
        {
            "name": "substring_name",
            "field": "name",
            "filter": "basename LIKE '%Success%'",
            "expected": ["public/CustomerSuccess.txt"],
        },
        {
            "name": "fuzzy_name",
            "field": "name",
            "query": "quaterly",
            "fuzziness": 1,
            "expected": ["public/quarterly-plan.md"],
        },
        {
            "name": "unicode_name",
            "field": "name",
            "filter": "basename = 'café-東京.txt'",
            "expected": ["public/café-東京.txt"],
        },
        {
            "name": "quoted_name",
            "field": "name",
            "filter": "basename = 'O''Brien.txt'",
            "expected": ["public/O'Brien.txt"],
        },
        {
            "name": "duplicate_names",
            "field": "name",
            "filter": "basename = 'duplicate.txt'",
            "expected": ["public/duplicate.txt", "private/duplicate.txt"],
        },
        {
            "name": "empty_folder",
            "field": "name",
            "filter": "kind = 'Directory' AND basename = 'empty-folder'",
            "expected": ["public/empty-folder"],
        },
        {
            "name": "phrase_content",
            "field": "text",
            "query": "quarterly plan",
            "phrase": True,
            "expected": ["public/quarterly-plan.md"],
        },
        {
            "name": "rare_content",
            "field": "text",
            "query": "rarebeacon",
            "expected": [r["path"] for r in files if "rarebeacon" in r["text"]],
        },
        {
            "name": "common_content",
            "field": "text",
            "query": "commonneedle",
            "expected": [r["path"] for r in files if "commonneedle" in r["text"]],
        },
        {
            "name": "no_matches",
            "field": "text",
            "query": "absentzzzzbeacon",
            "expected": [],
        },
        {
            "name": "direct_share",
            "field": "text",
            "query": "directbeacon",
            "expected": ["private/shared.txt"],
        },
        {
            "name": "metadata_without_read",
            "field": "name",
            "filter": "basename = 'list-only.txt'",
            "expected": ["private/list-only.txt"],
        },
        {
            "name": "body_without_read",
            "field": "text",
            "query": "forbiddenbody",
            "expected": ["private/list-only.txt"],
        },
        {
            "name": "client_or_cannot_bypass",
            "field": "text",
            "query": "commonneedle",
            "filter": "basename = 'impossible' OR 1 = 1",
            "expected": [r["path"] for r in files if "commonneedle" in r["text"]],
        },
    ]
    return [{"limit": 20, **case} for case in cases]
