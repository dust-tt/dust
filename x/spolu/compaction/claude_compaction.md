# Claude Code Compaction — Deep Dive

Source: `claude-code/src/services/compact/`

## Overview

Claude Code has a multi-layered context management system with three compaction strategies:

1. **Autocompact** — full conversation summarization when token count nears the context window limit
2. **Microcompact** — selective clearing of old tool results (two sub-strategies: cached and time-based)
3. **Session Memory Compact** — uses a pre-extracted session memory instead of calling the API

---

## 1. Trigger Logic

### Autocompact Trigger

**File:** `autoCompact.ts`

The system monitors token usage after every assistant turn. Autocompact fires when:

```
tokenCount >= effectiveContextWindow - AUTOCOMPACT_BUFFER_TOKENS
```

**Constants:**
- `AUTOCOMPACT_BUFFER_TOKENS = 13,000` — main trigger buffer
- `WARNING_THRESHOLD_BUFFER_TOKENS = 20,000` — UI warning level
- `ERROR_THRESHOLD_BUFFER_TOKENS = 20,000` — UI error level
- `MANUAL_COMPACT_BUFFER_TOKENS = 3,000` — blocking limit for manual `/compact`
- `MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20,000` — reserved for summary output (p99.99 = 17,387 tokens)

**Effective context window calculation:**
```
effectiveContextWindow = contextWindowForModel - min(maxOutputTokens, 20_000)
```

For a 200K model: `effectiveContextWindow ≈ 180,000`, autocompact threshold ≈ `167,000` tokens.
For a 1M model: `effectiveContextWindow ≈ 980,000`, autocompact threshold ≈ `967,000` tokens.

**Environment overrides:**
- `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` — percentage of effective window (e.g. `50` = compact at 50%)
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW` — cap the context window size used for threshold calculation
- `DISABLE_COMPACT` — disables all compaction
- `DISABLE_AUTO_COMPACT` — disables auto-compact only (manual `/compact` still works)

**Circuit breaker:** After 3 consecutive autocompact failures (`MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3`), the system stops retrying for the rest of the session. This prevents hammering the API when context is irrecoverably over the limit.

**Disabled for:**
- `querySource === 'session_memory'` or `'compact'` (recursion guard)
- `querySource === 'marble_origami'` (context-collapse agent)
- When context-collapse feature is enabled (context-collapse owns headroom management)
- GrowthBook gate `tengu_cobalt_raccoon` (reactive-only mode)

### Microcompact Triggers

**File:** `microCompact.ts`

#### Cached Microcompact (API cache editing)
Runs on every main-thread turn when the model supports cache editing. Uses count-based thresholds from GrowthBook config to decide when to delete old tool results via `cache_edits` API, preserving the cached prefix.

#### Time-Based Microcompact
Fires when the gap since the last assistant message exceeds a threshold (default: 60 minutes). Rationale: the server cache has expired anyway, so content-clearing old tool results costs nothing extra.

**Config (GrowthBook `tengu_slate_heron`):**
- `enabled: false` (default)
- `gapThresholdMinutes: 60`
- `keepRecent: 5` (keep last 5 tool results, minimum 1)

**Compactable tools** (only these tools' results are eligible for clearing):
- `Read`, `Bash`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `Edit`, `Write`

When time-based MC fires, old tool result content is replaced with:
```
[Old tool result content cleared]
```

### Session Memory Compact Trigger

**File:** `sessionMemoryCompact.ts`

Tried _before_ full compaction in `autoCompactIfNeeded`. If session memory exists and is non-empty, it can be used instead of making an API call:

**Default config (GrowthBook `tengu_sm_compact_config`):**
- `minTokens: 10,000` — minimum tokens to preserve
- `minTextBlockMessages: 5` — minimum user/assistant exchanges to keep
- `maxTokens: 40,000` — hard cap on preserved messages

The system expands backwards from the last summarized message, keeping messages until both `minTokens` and `minTextBlockMessages` are met, with a hard cap at `maxTokens`.

---

## 2. Compaction Prompt

**File:** `prompt.ts`

### System-Level Preamble (prepended to all compact prompts)

```
CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use Read, Bash, Grep, Glob, Edit, Write, or ANY other tool.
- You already have all the context you need in the conversation above.
- Tool calls will be REJECTED and will waste your only turn — you will fail the task.
- Your entire response must be plain text: an <analysis> block followed by a <summary> block.
```

This preamble exists because the compact request is sent as a forked agent that inherits the parent's full tool set (for cache-key match), and newer models sometimes attempt tool calls despite instructions.

### Trailer (appended to all compact prompts)

```
REMINDER: Do NOT call any tools. Respond with plain text only —
an <analysis> block followed by a <summary> block.
Tool calls will be rejected and you will fail the task.
```

### Full Compact Prompt (`BASE_COMPACT_PROMPT`)

```
Your task is to create a detailed summary of the conversation so far, paying close
attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and
architectural decisions that would be essential for continuing development work
without losing context.
```

Before the summary, the model is asked to produce an `<analysis>` block as a drafting scratchpad:

```
Before providing your final summary, wrap your analysis in <analysis> tags to
organize your thoughts and ensure you've covered all necessary points. In your
analysis process:

1. Chronologically analyze each message and section of the conversation.
   For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received,
     especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness.
```

The model must then produce a `<summary>` block with 9 sections:

1. **Primary Request and Intent** — All explicit user requests and intents
2. **Key Technical Concepts** — Technologies, frameworks discussed
3. **Files and Code Sections** — Files examined/modified/created with code snippets and why
4. **Errors and fixes** — Errors encountered, how fixed, user feedback
5. **Problem Solving** — Problems solved, ongoing troubleshooting
6. **All user messages** — Every non-tool-result user message (critical for understanding feedback)
7. **Pending Tasks** — Explicitly requested pending work
8. **Current Work** — Precise description of what was being worked on immediately before compaction, with file names and code snippets
9. **Optional Next Step** — Next step directly in line with user's most recent request, with direct quotes to prevent task drift

The prompt also notes that users can provide custom summarization instructions via CLAUDE.md `## Compact Instructions` sections.

### Partial Compact Prompts

Two variants for selective compaction:

- **`PARTIAL_COMPACT_PROMPT`** (direction `'from'`): Summarizes recent messages after a pivot point. Earlier messages are kept intact. Same 9 sections but scoped to "recent messages."
- **`PARTIAL_COMPACT_UP_TO_PROMPT`** (direction `'up_to'`): Summarizes earlier messages before a pivot point. Newer messages follow after. Section 8 becomes "Work Completed" and section 9 becomes "Context for Continuing Work."

---

## 3. How Compaction Executes

**File:** `compact.ts`

### Step-by-step flow:

1. **Pre-compact hooks** — Executes `PreCompact` hooks (can inject custom instructions, display messages)
2. **Strip images/documents** — Replaces image blocks with `[image]` and document blocks with `[document]` to avoid prompt-too-long on the compact request itself
3. **Strip re-injected attachments** — Removes `skill_discovery` and `skill_listing` attachments (they'll be re-injected post-compact)
4. **Stream summary** — Sends the conversation + compact prompt to the model:
   - **Primary path:** Forked agent (`runForkedAgent`) that reuses the main conversation's prompt cache (cache-key sharing). Runs with `maxTurns: 1`.
   - **Fallback path:** Direct `queryModelWithStreaming` if fork fails. Uses `COMPACT_MAX_OUTPUT_TOKENS = 20,000`.
   - **PTL retry:** If the compact request itself hits prompt-too-long, drops oldest API-round groups and retries (up to `MAX_PTL_RETRIES = 3`)
5. **Format summary** — `formatCompactSummary()` strips the `<analysis>` scratchpad and replaces `<summary>` tags with `Summary:` header
6. **Clear caches** — Clears `readFileState`, `loadedNestedMemoryPaths`
7. **Generate attachments** (in parallel):
   - Re-read up to 5 most recent files (50K token budget, 5K per file)
   - Plan file reference
   - Plan mode instructions (if in plan mode)
   - Skill guidelines (25K budget, 5K per skill)
   - Deferred tools delta (full set — since message history is gone)
   - Agent listing delta
   - MCP instructions delta
8. **Session-start hooks** — Re-runs session start hooks
9. **Create boundary marker** — System message with compaction metadata
10. **Create summary message** — User message with formatted summary
11. **Re-append session metadata** — Keeps title/tags in the 16KB tail window for `--resume`
12. **Write transcript segment** — Saves pre-compaction messages to transcript file (KAIROS mode)
13. **Post-compact hooks** — Executes `PostCompact` hooks

---

## 4. Presentation to the Model

After compaction, the conversation history is entirely replaced with a new message sequence:

### Message Order (from `buildPostCompactMessages`):

```
1. Compact boundary marker (system message)
2. Summary message (user message)
3. Preserved recent messages (if partial compact)
4. Attachment messages (files, plan, skills, tools, agents, MCP)
5. Hook result messages (session-start hooks)
```

### Compact Boundary Marker

A system message with `subtype: 'compact_boundary'`:

```typescript
{
  type: 'system',
  subtype: 'compact_boundary',
  content: 'Conversation compacted',
  compactMetadata: {
    trigger: 'manual' | 'auto',
    preTokens: number,              // token count before compaction
    userContext?: string,            // user feedback for partial compact
    messagesSummarized?: number,
    preCompactDiscoveredTools?: string[],  // deferred tools loaded pre-compact
    preservedSegment?: {             // for relinking preserved messages
      headUuid, anchorUuid, tailUuid
    }
  },
  logicalParentUuid?: UUID          // links to last pre-compact message
}
```

### Summary Message

A user message presented to the model:

```
This session is being continued from a previous conversation that ran out of
context. The summary below covers the earlier portion of the conversation.

Summary:
1. Primary Request and Intent:
   [...]
2. Key Technical Concepts:
   [...]
[... sections 3-9 ...]

If you need specific details from before compaction (like exact code snippets,
error messages, or content you generated), read the full transcript at: <path>

Recent messages are preserved verbatim.  [if applicable]
```

**For autocompact** (suppressFollowUpQuestions = true), an additional instruction is appended:

```
Continue the conversation from where it left off without asking the user any
further questions. Resume directly — do not acknowledge the summary, do not recap
what was happening, do not preface with "I'll continue" or similar. Pick up the
last task as if the break never happened.
```

**For proactive/autonomous mode**, an additional instruction:

```
You are running in autonomous/proactive mode. This is NOT a first wake-up — you
were already working autonomously before compaction. Continue your work loop: pick
up where you left off based on the summary above. Do not greet the user or ask
what to work on.
```

The summary message has two important flags:
- `isCompactSummary: true` — marks it as a compact summary
- `isVisibleInTranscriptOnly: true` — not shown to the user in the UI, only in the transcript

---

## 5. Post-Compact Cleanup

**File:** `postCompactCleanup.ts`

Caches invalidated after compaction:
- Microcompact state
- Context-collapse state
- User context cache
- System prompt sections
- Classifier approvals
- Speculative checks
- Beta tracing state
- Session messages cache

---

## 6. Special Handling

### Images and Documents
Replaced with `[image]` / `[document]` text markers before sending to the compact model. This prevents the compact API call itself from hitting prompt-too-long (images are large).

### Tool Use / Tool Result Pairing
The system ensures tool_use and tool_result blocks are never split across the compact boundary. `adjustIndexToPreserveAPIInvariants()` in `sessionMemoryCompact.ts` adjusts start indices backwards if any tool_results in the kept range need tool_uses that would be dropped.

### Prompt-Too-Long on Compact Request
If the compact request itself exceeds the context window:
1. Groups messages by API round
2. Drops oldest groups until the token gap is covered (or 20% of groups as fallback)
3. Prepends a synthetic marker: `[earlier conversation truncated for compaction retry]`
4. Retries up to 3 times

### File Restoration Post-Compact
Up to 5 most recently read files are re-injected as attachment messages:
- `POST_COMPACT_MAX_FILES_TO_RESTORE = 5`
- `POST_COMPACT_TOKEN_BUDGET = 50,000`
- `POST_COMPACT_MAX_TOKENS_PER_FILE = 5,000`

Files are truncated to the per-file cap. The `FILE_UNCHANGED_STUB` marker is used for files that haven't changed.

### Skill Re-injection
- `POST_COMPACT_MAX_TOKENS_PER_SKILL = 5,000`
- `POST_COMPACT_SKILLS_TOKEN_BUDGET = 25,000`

---

## 7. Token Budget Summary (200K context model)

| Component | Tokens |
|---|---|
| Model context window | 200,000 |
| Reserved for summary output | -20,000 |
| **Effective context window** | **180,000** |
| Autocompact buffer | -13,000 |
| **Autocompact threshold** | **167,000** |
| Warning threshold | 147,000 (threshold - 20K) |
| Error threshold | 147,000 (threshold - 20K) |
| Blocking limit | 177,000 (effective - 3K) |
| Post-compact file budget | 50,000 |
| Post-compact skill budget | 25,000 |
