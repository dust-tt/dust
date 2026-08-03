# How to Write a Good Bug Report

A good bug report saves everyone time. The clearer your report, the faster we can
reproduce, understand, and fix the problem. This guide explains how to file an
excellent bug report for [Dust](https://dust.tt) — whether it lands in a Dust
workspace via a triage agent, in our support queue, or in the
[issue tracker](https://github.com/dust-tt/dust/issues).

> **Reporting a security vulnerability?** Do **not** open a public issue or post it
> in a shared workspace. Follow [`SECURITY.md`](../SECURITY.md) and use our
> vulnerability disclosure program at https://dust.tt/home/vulnerability.

## TL;DR — the copy-paste template

````markdown
### Summary
<one sentence: what's broken + the symptom>

### Area / component
<e.g. Agent builder, Slack connector, dust-cli, Browser extension, Frames, API>

### Environment
- Region: US (us-central1) / EU (europe-west1)
- Version (CLI / SDK / extension only): <published version>
- Date/time + timezone observed: <helps correlate with deploys>
- OS / Browser (if relevant): <e.g. macOS 14.5, Chrome 126>

### Where it happens (paste a URL — never secrets)
- Conversation URL (preferred, if in an agent conversation):
- Otherwise, the page URL where the issue occurs:
- Connector / provider (if relevant):

### Steps to reproduce
1.
2.
3.

### Expected behavior

### Actual behavior (paste the EXACT error message / code)
```
<paste error here>
```

### Impact
<who/what is affected, how often, any workaround>

### Screenshots / logs
<attach images, screen recording, console/network errors, server logs>
````

## What's most often missing

Based on past Dust reports, these are the details we most frequently have to ask
for. Including them up front avoids a round-trip and gets your bug fixed sooner:

1. **The exact error message and code.** "It fails" isn't enough. Paste the literal
   string (`invalid_scope`, `status_code=404`, `400 Invalid schema…`, `500`). The
   error text is usually the single most useful line in the report.
2. **Reproduction steps.** Even strong reports often skip these. Without a reliable
   repro, a bug is much harder to fix.
3. **Region.** Many Dust bugs are region-specific (US `us-central1` vs EU
   `europe-west1`). Always say which one — especially for CLI, API, and connector
   issues.
4. **A URL pointing at the problem.** Paste a link, not raw identifiers: the
   **conversation URL** if the issue happens in an agent conversation, otherwise
   the **page URL** where it occurs. This lets us jump straight to the exact place.
   Never paste secrets.
5. **Version** (CLI, SDKs, extension only): the published version.

## Before You Report

### Isolate the bug

Identify the exact problem rather than a vague symptom. "Agents don't work" is not
actionable; "the agent returns a 500 when I attach a PDF larger than 20 MB" is.
Find the smallest sequence of steps that reliably triggers the issue, and confirm
you can reproduce it more than once. If it's intermittent, say so and estimate how
often (e.g. "about 1 in 5 runs").

### Check you're on a supported / latest version

- **Web app (dust.tt):** Hard-refresh to rule out a stale build, and note the
  date/time (with timezone) you saw the issue so we can correlate with deploys.
- **CLI / SDKs / extension:** Update to the latest published version and report the
  exact version number.

### Check if the bug is already known

Search the [issue tracker](https://github.com/dust-tt/dust/issues) (including
closed issues) before opening a new one. If you find a matching report, add your
details there instead of opening a duplicate. Only open a new issue if your problem
is meaningfully different.

### File each issue separately

If you've hit several unrelated bugs, open one issue per bug. Bundled reports are
hard to track and tend to get partially fixed and forgotten.

## Writing the Report

### Title / summary

The title gets the most attention, so make it specific. Include the affected area
and a concrete symptom or error code. A common, effective Dust convention is a
`[Area]` prefix:

- ❌ "Something is broken" · "Connector issue"
- ✅ "[Microsoft/SharePoint] PDFs are findable but return no results in semantic search"
- ✅ "[dust-cli] API-key auth can't reach EU (europe-west1) workspaces"
- ✅ "[Agent builder] Saving a tool with an empty name throws 500"

### Area / component

Which part of Dust is affected? This maps to the top-level directories in the repo:

| Area | Directory | Examples |
| --- | --- | --- |
| Web app (front-end & API) | `front/`, `front-api/`, `front-spa/` | Agent builder, conversations, Frames, settings, REST API |
| Data source connectors | `connectors/` | Slack, Microsoft/Teams/SharePoint, Notion, Google Drive, GitHub, Confluence, Intercom, Zendesk, Front, Freshservice |
| Core service | `core/` | Document storage/search, data sources, runs, OAuth providers |
| Design system | `sparkle/` | Shared UI components |
| Browser extension | `extension/` | Chrome/Firefox extension |
| Command-line tool | `cli/` | `dust` CLI |
| SDKs | `sdks/` | TypeScript client, API usage |
| Visualization | `viz/` | Rendered charts / Frames output |
| Code sandbox | `sandbox/` | Agent code execution |
| Marketing / docs | `marketing/` | dust.tt pages, docs.dust.tt |

If you're not sure, give your best guess — we'll relabel as needed. When relevant,
also specify the **connector/provider**, and for agent issues the **model**
(e.g. Claude, GPT) and relevant **agent configuration or tool**.

### Steps to reproduce

Numbered, click-by-click instructions someone unfamiliar with the feature could
follow. Re-read them as if you've never used Dust before — a missing step is the
most common reason a bug can't be reproduced. Start from a known state.

```
1. Open the agent builder
2. Add a "Search" tool
3. Leave the name field empty
4. Click "Save"
```

### Expected behavior

What you expected to happen.

### Actual behavior

What actually happened, with the **exact** error message and any error code. The
gap between expected and actual *is* the bug. Wrap errors and logs in triple
backticks so they render as code:

````
```
Error requesting event stream: status_code=404
```
````

### Impact

Who/what is affected, how badly, and how often. Note any workaround. (Dust reports
conventionally include an **Impact** section — it helps us prioritize. For
customer-facing issues, add a **Customer reference**.)

Distinguish **severity** (how badly it breaks the product) from **priority** (how
urgently it needs fixing) — they're independent.

### Screenshots & logs

- Screenshots or a short screen recording for UI bugs.
- Browser console errors (DevTools → Console) and failed network requests
  (Network tab) for front-end issues.
- Server/CLI logs or stack traces in a code block.

> **Redact sensitive data.** Remove API keys, OAuth tokens, cookies, personal data,
> and credentials from logs, screenshots, and URLs before posting. Never paste
> secrets into a public issue or shared workspace.

### Preview before submitting

Use the **Preview** tab to confirm formatting (code blocks, lists, images) renders
correctly before submitting.

## Following Up

- Watch the report for follow-up questions — a quick reply often unblocks the fix.
- When a fix ships, verify on the latest build (hard-refresh the web app, or update
  the CLI/SDK/extension) and confirm it's resolved.
- If it's fixed, say so it can be closed with confidence. If not, reopen or
  comment with the new details.
