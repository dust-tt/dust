# Session Summary: Webtools Edge + Run Agent + UI/Citations/Flags

This document summarizes all work and design decisions made across our iteration, to reset context cleanly.

## 1) Initial Analysis and Documentation
- Located internal MCP servers for:
  - `web_search_&_browse` (aka “webtools”) at `front/lib/actions/mcp_internal_actions/servers/webtools.ts`.
  - `run_agent` at `front/lib/actions/mcp_internal_actions/servers/run_agent/*`.
- Wrote a technical summary: `docs/mcp/internal-servers-webtools-and-run_agent.md` covering purpose, implementation, inputs/outputs, and schemas.

## 2) New Internal Server: `webtools_edge`
- Added a new server that mirrors `web_search_&_browse` initially, then evolved:
  - File: `front/lib/actions/mcp_internal_actions/servers/webtools_edge.ts`.
  - Registered in `INTERNAL_MCP_SERVERS` with feature flag `webtools_edge` and availability `auto` (preview), then wired into the server registry.
  - Guards and UI support extended to treat `webtools_edge` as a websearch family server.

## 3) Browse Tool Behavior (Edge)
- Finalized inputs:
  - `urls: string[]` (required)
  - `summaryAgent: AGENT` (required, mimeType INTERNAL)
  - Removed `format`, `screenshotMode`, and `links`.
- Behavior:
  - Scrapes all URLs with `browseUrls(..., "markdown")`.
  - Concurrently (concurrency 8) per URL: summarize, create file, upload, emit tool outputs.
  - Summary snippet is computed by running a configured summary agent in a child conversation via Dust API streaming.
  - Degrades gracefully per URL: on summary failure, emits a text error block and continues processing other URLs.
- Tool outputs per URL:
  - FILE resource (with snippet) marked `hidden: true` (see §7) and uploaded to conversation DS.
  - WEBSEARCH_RESULT resource to carry a citation reference (placeholder text: “Full web page content available as file <id>”).
  - No inline page content.

## 4) Summary Agent Integration
- The browse tool’s `summaryAgent` input uses INTERNAL mime type `AGENT`.
- Injection pattern mirrors `run_agent`:
  - For dust-task (when on `webtools_edge`), we configure the action with `childAgentId = <dust-browser-summary sId>`.
  - `augmentInputsWithConfiguration` auto-injects `summaryAgent` from `childAgentId`.
- Summary agent resolved with `_getBrowserSummaryAgent(auth, { settings })`.

## 5) Citations
- `webtools_edge` is treated as websearch for citation allocation (`isMCPInternalWebsearch`), so step contexts allocate citations.
- For each URL, we emit a `WEBSEARCH_RESULT` with a new `reference` drawn from `getRefs().slice(citationsOffset, citationsOffset + websearchResultCount)`.
- Placeholder `text` avoids snippet duplication; files hold the real summary.

## 6) Concurrency
- Two layers:
  - Scraping: `browseUrls(urls, 8, ...)`.
  - Per-URL processing: `concurrentExecutor(results, iterator, { concurrency: 8 })` for summary + file + citation.

## 7) Hidden Files (UI vs Tools)
- Goal: hide browse-generated files from generic UI lists while keeping them available to tools (e.g., `conversation_files` list + `cat`).
- Schema changes:
  - `ToolGeneratedFileSchema` now includes optional `hidden?: boolean`.
  - `ActionGeneratedFileType` now includes optional `hidden?: boolean`.
- Aggregation changes:
  - We keep files in `generatedFiles` but annotate `hidden` by inspecting the ToolGeneratedFile resource.
  - Persistence & light message mapping preserved `hidden` so it reaches the UI.
- UI filters `hidden` in generic lists:
  - Conversation bottom: `AgentMessage.tsx` filters out files with `hidden`.
  - Generic MCP action details: `MCPActionDetails.tsx` filters hidden files.
  - Run-agent details: `MCPRunAgentActionDetails.tsx` filters hidden ToolGeneratedFile from toolOutput.
  - Tables query details also filters hidden (future-proof).
- Browse tool details (`MCPBrowseActionDetails`) continues to render per-action ToolGeneratedFile resources (not aggregated) so files are visible in the action context.
- Tools unaffected:
  - Files are uploaded to the conversation JIT data source and included in `generatedFiles` (with `hidden`).
  - `conversation_files` server builds attachments from aggregated `generatedFiles`, so `list` and `cat` still see them.

## 8) Feature Flags and Agents Wiring
- Feature flag: `webtools_edge` (stage: `on_demand`).
- Auto-availability created corresponding system/global MCP views.
- Selection rules:
  - `dust-deep` (and `dust-deep-2`): keep regular `web_search_&_browse`.
  - `dust-task`: if flag enabled and view exists, use `webtools_edge`.
- When `dust-task` uses `webtools_edge`, we set `childAgentId` of its browse tool to the summary agent (`dust-browser-summary`) via `_getBrowserSummaryAgent`.

## 9) MCP Tool Timeouts
- Default timeout: `DEFAULT_MCP_REQUEST_TIMEOUT_MS = 3 minutes`.
- `INTERNAL_MCP_SERVERS[name].timeoutMs` controls per-server default (e.g., `run_agent` uses 10 minutes).
- Execution uses `toolConfiguration.timeoutMs ?? DEFAULT_MCP_REQUEST_TIMEOUT_MS`.
- We did not introduce a special timeout for `webtools_edge`; current timeout is 3 minutes unless configured per-view/tool.

## 10) UI: Browse Details
- `MCPBrowseActionDetails` was updated to:
  - Display a “Files” section from ToolGeneratedFile resources.
  - Work with the classic format and the new file-only format.
  - Earlier link-based browse results were removed along with the `links` parameter.

## 11) API and Type Adjustments
- Feature flags public endpoint doesn’t include `webtools_edge` in client type; we filtered it in `front/pages/api/v1/w/[wId]/feature_flags.ts` to satisfy typing while using internal flag logic elsewhere.
- Multiple `tsc --noEmit` runs validated type-safety after each change.

## 12) Model Rendering & Safety
- The model “sees” tool outputs, not aggregated `generatedFiles`.
- `rewriteContentForModel` converts ToolGeneratedFile outputs to attachment XML inside function result text — unaffected by `hidden`.
- `hidden` only affects generic UI file lists; model prompt and `conversation_files` tools are unaffected.

## 13) Filepaths of Key Changes
- New server: `front/lib/actions/mcp_internal_actions/servers/webtools_edge.ts`
- Server registry: `front/lib/actions/mcp_internal_actions/servers/index.ts`
- Server constants / flags: `front/lib/actions/mcp_internal_actions/constants.ts`, `front/types/shared/feature_flags.ts`
- Global agents wiring:
  - `front/lib/api/assistant/global_agents/global_agents.ts` (choosing edge vs classic)
  - `front/lib/api/assistant/global_agents/configurations/dust-deep.ts` (dust-task config + summary agent via childAgentId)
- Browse details UI: `front/components/actions/mcp/details/MCPBrowseActionDetails.tsx`
- Hidden propagation + filters:
  - Schemas: `front/lib/actions/mcp_internal_actions/output_schemas.ts`, `front/lib/actions/types/index.ts`
  - Aggregation: `front/lib/actions/mcp_execution.ts`
  - Persistence & light mapping: `front/lib/resources/agent_step_content_resource.ts`, `front/lib/api/assistant/citations.ts`
  - UI filters: `AgentMessage.tsx`, `MCPActionDetails.tsx`, `MCPRunAgentActionDetails.tsx`, `MCPTablesQueryActionDetails.tsx`

## 14) Open Questions / Next Steps
- If we want to also hide these files from the conversation files popover, we can filter `hidden` there as well. Currently kept visible to ensure `cat` workflows.
- Consider exposing a simple configuration toggle on the browse tool to opt-in/out of auto-file creation.
- Optionally add a per-view timeout override for `webtools_edge` if we see timeouts on long pages.

## 15) Verification Commands
- Type checks (run from `front/`):
  - `nvm use && npx tsc --noEmit`
- No runtime changes included here (server remains in-memory MCP for internal actions).
