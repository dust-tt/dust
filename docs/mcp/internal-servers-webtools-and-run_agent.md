# Internal MCP Servers: web_search_&_browse (webtools) and run_agent

This document summarizes two internal MCP servers used by Dust agents: the web_search_&_browse server (implemented in `webtools.ts`) and the run_agent server. It covers what they do, how they’re implemented, inputs/outputs, and notable behaviors.

## web_search_&_browse (aka “webtools”)

- Key file: `front/lib/actions/mcp_internal_actions/servers/webtools.ts`
- Server info source: `front/lib/actions/mcp_internal_actions/constants.ts` (named via `DEFAULT_WEBSEARCH_ACTION_NAME`)
- Utilities used:
  - Web search: `front/lib/utils/websearch.ts` (SerpAPI default)
  - Web browse: `front/lib/utils/webbrowse.ts` (Firecrawl)
  - Citations: `front/lib/api/assistant/citations.ts` (`getRefs`)
  - Tokenization: `front/lib/tokenization`

### Purpose

- Provide two tools for browsing and searching the web:
  - `websearch`: Perform a Google search and return top results with references.
  - `webbrowser`: Fetch and return page content (markdown or HTML), optional screenshots, and outgoing links.

### Server metadata

- Name: `web_search_&_browse`
- ID: 5
- Availability: `auto`
- allowMultipleInstances: false
- Retry policy: `{ default: "retry_on_interrupt" }`
- Timeout: default (no explicit override)
- Icon: `ActionGlobeAltIcon`
- Description: “Agent can search (Google) and retrieve information from specific websites.”

### Tools and parameters

1) Tool: `websearch`
   - Description: “A tool that performs a Google web search based on a string query.”
   - Params (Zod schema):
     - `query: string`
       - Tip: Use `site:` when user requests restricting to a domain.
     - `page?: number`
       - 1-indexed page to paginate deeper into results.
   - Behavior:
     - Uses SerpAPI by default (`utils/websearch.ts`) with managed key.
     - Number of results is computed per step context (`websearchResultCount`).
     - Generates citation references using `getRefs()` with a step-specific offset.
   - Output (MCP CallToolResult content):
     - One `resource` per result with mimeType `WEBSEARCH_RESULT` containing:
       - `title, text (snippet), uri (link), reference`
     - One trailing `resource` with mimeType `WEBSEARCH_QUERY`: `text` = original query, `uri` = "".
   - Errors: Returns a text error via `makeMCPToolTextError` if the search fails.

2) Tool: `webbrowser`
   - Description: “A tool to browse websites, you can provide a list of urls to browse all at once.”
   - Params (Zod schema):
     - `urls: string[]` (required)
     - `format?: "markdown" | "html"` (default `markdown`)
     - `screenshotMode?: "none" | "viewport" | "fullPage"` (default `none`)
     - `links?: boolean` (if true, returns outgoing links)
   - Behavior:
     - Calls `browseUrls(urls, 8, format, { screenshotMode, links })` (Firecrawl under the hood).
     - Successful scrape returns `markdown` or `rawHtml`, optional `screenshots` and `links`, plus metadata (`title`, `description`, `status`).
     - Computes token count (`gpt-4o` tokenizer) and truncates content to ~32k tokens max (`BROWSE_MAX_TOKENS_LIMIT`), appending a truncation note.
     - Screenshots handling:
       - Inline base64 PNGs are attached as MCP `image` items.
       - HTTP URLs are attached as `resource` with `mimeType: image/png` and `uri` set.
       - If screenshots requested but absent, emits a diagnostic `BROWSE_RESULT` resource.
     - Optionally emits a separate `BROWSE_RESULT` resource listing outgoing links (first 50).
   - Output (MCP CallToolResult content):
     - One or more `resource` items with mimeType `BROWSE_RESULT`:
       - Fields: `requestedUrl, uri (final url), text, title?, description?, responseCode, errorMessage?`, and `html?` if `format=html`.
     - Zero or more `image` items (`mimeType: image/png`) for inline screenshots.
   - Errors: Each failed URL yields a `BROWSE_RESULT` resource with an error message and HTTP status.

### Environment / credentials

- Web search (SerpAPI): `DUST_MANAGED_SERP_API_KEY` (via `dustManagedCredentials()`)
- Web browse (Firecrawl): `DUST_MANAGED_FIRECRAWL_API_KEY` (required by `webbrowse.ts`)

---

## run_agent

- Key folder: `front/lib/actions/mcp_internal_actions/servers/run_agent/`
  - `index.ts` (server implementation)
  - `conversation.ts` (create or reuse conversation, attachments)
  - `types.ts` (resume state and blocked input types)
- Server registry: `front/lib/actions/mcp_internal_actions/servers/index.ts`
- Output schemas: `front/lib/actions/mcp_internal_actions/output_schemas.ts`
- Related: `front/lib/actions/mcp_internal_actions/input_schemas.ts` (agent URI schema)

### Purpose

- Exposes “agent as a tool”: a parent agent can invoke a configured child agent.
- Supports two modes:
  - Handover into an existing conversation (same conversation): child agent directly continues in the thread.
  - New “child conversation”: creates an unlisted conversation with `depth = parent.depth + 1`.
- Streams child agent generation, emits progress notifications, handles approvals/auth blocking events, and returns the child’s final content, citations, and generated files.

### Server metadata

- Name: `run_agent`
- ID: 1008
- Availability: `auto`
- allowMultipleInstances: false
- Retry policy: `{ default: "retry_on_interrupt" }`
- Timeout: `MAX_MCP_REQUEST_TIMEOUT_MS` (10 minutes)
- Icon: `ActionRobotIcon`
- Description: “Run a child agent (agent as tool).”

### Tool and parameters

- Tool name: dynamic, `run_${childAgentName}`.
- Tool description: `Run agent ${childAgentName} (${childAgentDescription})`.
- Inputs (Zod schemas; see `run_agent/index.ts`):
  - `query: string` — Prompt for the child agent.
  - `childAgent: { uri: string; mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT }`
    - `uri` must match: `agent://dust/w/<workspaceSid>/agents/<agentSid>`
    - Parsed to get the `childAgentId`.
  - `toolsetsToAdd?: string[] | null`
    - Must match `^mcp_server_view_\w+$` (via `getResourcePrefix("mcp_server_view")`).
    - Injected as `selectedMCPServerViewIds` in the child conversation context.
  - `fileOrContentFragmentIds?: string[] | null`
    - Plain identifiers `^[_\w]+$` referring to either a fileId or a contentFragmentId attached in the parent conversation.
    - The server converts matching attachments into `contentFragments` when creating the child conversation.
  - `conversationId?: string | null`
    - If set to the parent conversation id, this is a “handover”: the child agent runs in the same conversation.
    - Otherwise (or if not set), a new child conversation is created.

### Behavior and flow

1) Child agent metadata discovery
   - Uses a “leaky” fetch to get the child agent’s `name` and `description` for tool rendering, even if the agent is private.
   - Actual execution permission is enforced at runtime when creating/using the conversation.
   - If the child agent is unavailable (e.g., archived), the server exposes a placeholder tool `run_agent_tool_not_available` that returns an error.

2) Pre-execution notifications (optional)
   - If `_meta.progressToken` is present, sends `notifications/progress` with a `store_resource` payload containing:
     - `RUN_AGENT_QUERY` resource (the query and `childAgentId`).
     - If handover, a `RUN_AGENT_HANDOVER` resource capturing the parent’s instructions.

3) Conversation resolution
   - Resume: if the step has a resume state (`conversationId`, `userMessageId`) it reuses that.
   - Handover: posts a `:mention[...]` message into the given `conversationId` and returns early (no stream), indicating delegation.
   - New conversation: creates an “unlisted” conversation titled `run_agent <parent> > <child>`, with “origin: run_agent” so it doesn’t appear in the user’s history.

4) Streaming and notifications
   - Streams `streamAgentAnswerEvents` from the Dust API and processes events:
     - `generation_tokens` with `classification`:
       - `chain_of_thought`: accumulates thinking tokens and sends `run_agent_chain_of_thought` progress notifications.
       - `tokens`: accumulates response text and sends `run_agent_generation_tokens` progress notifications.
     - `agent_message_success`: captures citations (`refs`) and generated files from actions.
     - Blocking:
       - `tool_approve_execution`: collected; if `isLastBlockingEventForStep`, returns a special MCP error requiring resume.
       - `tool_error` with `mcp_server_personal_authentication_required`: collected similarly and may also trigger the resume error.

5) Final output assembly
   - Rewrites `:cite[...]` blocks from the child output to use fresh references (`getRefs`), allowing up to `RUN_AGENT_ACTION_NUM_RESULTS = 64` citations.
   - Returns an MCP success with content:
     - One `resource` with mimeType `RUN_AGENT_RESULT` including:
       - `conversationId`, `uri` (child convo URL), `text`, optional `chainOfThought`, and optional `refs` mapping.
     - One `resource` per generated file with mimeType `FILE` including file metadata.

### Blocking / resume protocol

- When blocked, the tool returns `isError: true` with a single `text` item containing JSON of the shape:
  ```json
  {
    "__dust_blocked_awaiting_input": {
      "blockingEvents": [...],
      "state": { "conversationId": "...", "userMessageId": "..." }
    }
  }
  ```
- Types are defined in `run_agent/types.ts`:
  - `ToolBlockedAwaitingInputError`, `RunAgentBlockingEvent` (approve execution or personal auth required), and helpers to serialize/deserialize.

### Environment / auth

- Uses a system API key plus `getHeaderFromUserEmail(...)` so the child agent runs with the initiating user’s identity where needed (for personal actions), but within the workspace’s auth context.

---

## How they’re registered

- Central registry: `front/lib/actions/mcp_internal_actions/servers/index.ts`
  - `getInternalMCPServer(...)` switches on the internal server name and instantiates the corresponding server.
  - `web_search_&_browse` → `webtoolsServer(agentLoopContext)`
  - `run_agent` → `runAgentServer(auth, agentLoopContext)`

## Output schemas (selected)

- Defined in `front/lib/actions/mcp_internal_actions/output_schemas.ts`:
  - Web search:
    - `WEBSEARCH_QUERY`: `text, uri:""`
    - `WEBSEARCH_RESULT`: `title, text, uri, reference`
  - Browse:
    - `BROWSE_RESULT`: `requestedUrl, uri, text, html?, title?, description?, responseCode, errorMessage?`
  - Run agent:
    - `RUN_AGENT_QUERY`: `text, childAgentId, uri:""`
    - `RUN_AGENT_RESULT`: `conversationId, text, chainOfThought?, uri, refs?`
    - `RUN_AGENT_HANDOVER`: `text, uri`
    - plus `FILE` items for generated files

## Notes and edge cases

- Web browse truncation: content is truncated to ~32k tokens, with a clear truncation notice.
- Web browse screenshots: inline base64 is attached as MCP `image`; remote URLs as `resource` with `image/png` mime type.
- run_agent “leaky” name/description: allows rendering the tool in a parent agent even if the child is private, but execution is still permission-checked. If the child is archived, a placeholder tool is exposed instead.
- Citations: both servers rely on step-level citation management (`getRefs` and action counts), ensuring unique references per step.

