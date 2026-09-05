# Building frame packs

A frame pack is a self-contained version of one real Frame request. It isolates Frame design and
implementation from research quality: candidates receive the same brief and the same supporting data,
and should not browse, query a data source, or inspect the source conversation.

## Candidate selection

Start with more conversations than the target pack count, then filter aggressively:

- Keep professional requests that ask for a new Frame.
- Exclude personal, confidential, customer-specific, or private-space material unless the owner has
  explicitly approved its use.
- Exclude requests whose main task is editing an existing Frame.
- Exclude tasks that cannot be made self-contained without disclosing restricted data.
- Prefer a varied mix of dashboards, reports, presentations, explainers, operational tools, and
  interactive experiences.
- Record the selection query and filter criteria outside the committed repository.

Use read-only, approved access for discovery and transcript export. Never put API keys, OAuth tokens,
Slack tokens, signed URLs, raw private conversation URLs, workspace IDs, or database credentials in a
pack.

## Directory contract

```text
packs/<pack-id>/
├── brief.md
├── manifest.json
├── context/
│   ├── INDEX.md
│   ├── data/
│   └── notes/
└── attachments/
```

`brief.md` is sent as the message. Every file under `context/data`, `context/notes`, and `attachments`,
plus `context/INDEX.md`, is attached to the conversation. `manifest.json` is tooling metadata and is
not attached.

All attached basenames must be unique within a pack because the runner flattens attachment paths.

## Construction procedure

1. Export the complete source conversation through an approved read-only interface. Include user
   messages, follow-ups, tool calls, tool results, generated/downloaded files, and the final Frame.
2. Separate user intent from research output:
   - User intent and constraints belong in `brief.md`.
   - Query results, reports, and structured facts belong in `context/data`.
   - Qualitative research belongs in `context/notes`.
   - Original user-provided files belong in `attachments`.
   - The generated Frame and its layout are evidence for pack completeness only. Do not describe or
     imitate that layout in the brief.
3. Download source files programmatically when possible. Do not hand-copy large tool outputs or
   retype tabular data.
4. Preserve fidelity. Store tables as CSV/TSV/JSON, binary documents in their original format, and
   narrative research as concise Markdown. Do not silently round, summarize, or drop rows.
5. Write `context/INDEX.md`. For every file, state what it contains, where it came from, the query or
   extraction method, important columns/units, and any caveats.
6. Write `brief.md` from the user's request and follow-ups. Remove research instructions that are now
   satisfied by the attached files. Add a short instruction to read the supplied material and build the
   Frame directly without additional research.
7. Write `manifest.json` and list every attached file with a description and non-secret provenance.
8. Review the pack without the source conversation. A reviewer should be able to explain the task,
   locate every required fact, and identify the meaning of each file.
9. Run `validate-packs.mjs`, then run one pack against one inexpensive candidate before scaling out.

## Brief rules

The brief must:

- Preserve the requested outcome, audience, copy, interactions, and visual constraints.
- Mention attached files by basename, not by local directory path.
- Tell the candidate not to perform additional research.
- Avoid suggesting a layout derived from a previous generated Frame.
- Avoid mentioning candidate identities, the tournament, expected winners, or prior feedback.

The brief must not contain answers copied from research when the attached source already communicates
them. That creates prompt noise and can bias layout choices.

## Manifest format

```json
{
  "version": 1,
  "packId": "stable-pack-id",
  "source": {
    "kind": "approved-conversation-export",
    "reference": "private operator reference, omitted from committed examples"
  },
  "files": [
    {
      "path": "context/data/metrics.csv",
      "description": "Monthly metrics used by the requested dashboard",
      "provenance": "Read-only export of the query documented in INDEX.md"
    }
  ]
}
```

The source reference may be useful in a private working copy. Remove it before sharing a pack outside
the authorized evaluation group.

## Pack-builder prompt template

Use [templates/pack-builder-prompt.md](./templates/pack-builder-prompt.md) when delegating pack
construction. Give each builder only one source conversation and its downloaded files. A second person
should review each pack before it enters the run.
