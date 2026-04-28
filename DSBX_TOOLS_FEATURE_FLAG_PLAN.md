# Plan — Splitting `dsbx tools` behind a second feature flag

## Goal

Today a single feature flag (`sandbox_tools`) gates **everything**: the Sandbox
skill, the bash tool, the egress policy, the `dsbx` CLI surface, and the
HTTP endpoints that back it. We want to release in two stages:

1. **Stage 1 (broader release):** Sandbox-as-an-external-tool — bash, egress
   policy, file attachments, the Sandbox skill itself. Keeps the existing
   `sandbox_tools` flag.
2. **Stage 2 (later release):** `dsbx tools` — programmatic access to other
   MCP tools from inside the sandbox. Behind a new, narrower flag.

Until Stage 2 ships, agents in workspaces that have `sandbox_tools` will see
the Sandbox skill and bash tool, but the `dsbx tools` subcommand will be
non-functional and not advertised in the prompt.

## Proposed flag

- **Name:** `sandbox_dsbx_tools` (alternatives: `dsbx_tools`,
  `sandbox_programmatic_tools`).
- **Stage:** `dust_only` initially — same posture `sandbox_tools` has today
  before its broader rollout.
- **Definition:** add to `front/types/shared/feature_flags.ts` next to
  `sandbox_tools` (currently lines 205-209).

```ts
sandbox_dsbx_tools: {
  description:
    "Programmatic access to MCP tools from inside the sandbox via the dsbx CLI",
  stage: "dust_only",
},
```

### Semantics of the two flags

To avoid the muddled "both flags required" wording, treat them as gating
different layers:

- **`sandbox_tools`** gates the **caller** — the Sandbox skill, sandbox
  lifecycle, bash tool, egress policy, file attachments. Without it, no
  sandbox exists, so nothing can issue `dsbx` calls.
- **`sandbox_dsbx_tools`** gates the **API surface** that the caller would
  hit — the `/sandbox/tools` listing endpoint, the `call_tool` endpoint, and
  the prompt/manifest entries that advertise the capability. Without it,
  even a workspace that has `sandbox_tools` cannot use `dsbx tools` (the
  endpoints reject, and the model isn't told the capability exists).

In practice `sandbox_tools` only is reachable; `sandbox_dsbx_tools` only is
dead state (no sandbox to call from). The API-surface gates only need to
check `sandbox_dsbx_tools` — `sandbox_tools` is already enforced one layer
up at the skill / sandbox lifecycle. Each call site uses the same idiom
the rest of the codebase uses:

```ts
const flags = await getFeatureFlags(auth);
if (!flags.includes("sandbox_dsbx_tools")) { /* … */ }
```

## What moves from `sandbox_tools` → `sandbox_dsbx_tools`

These are the existing surfaces that must check the *new* flag instead of (or
in addition to) the old one.

### 1. Sandbox skill instructions

**File:** `front/lib/resources/skill/code_defined/sandbox.ts:23-24`

Today the `SANDBOX_INSTRUCTIONS` constant unconditionally tells the model:
> "You can use the `dsbx` command line tool to list and run tools
> programmatically in the sandbox. Use it with `dsbx tools …`. Run
> `dsbx tools --help` for more information."

**Change:** make `SANDBOX_INSTRUCTIONS` a function that takes
`hasDsbxTools: boolean` and only appends those two lines when true. The skill
itself stays gated on `sandbox_tools` only — we still want the bash tool
available without `dsbx tools`.

Plumbing: `fetchInstructions` reads the flags via `getFeatureFlags(auth)`
and threads `flags.includes("sandbox_dsbx_tools")` into
`buildSandboxInstructions`.

### 2. Sandbox tool manifest (prompt) — `dsbx` entry

**File:** `front/lib/api/sandbox/image/registry.ts:190`

Even with the prose lines stripped, the generated tool manifest registered
in the image registry still includes:

```ts
.registerTool({ name: "dsbx", description: "Dust CLI", runtime: "system" })
```

This manifest is rendered into the sandbox skill's system prompt
(`buildSandboxInstructions` → `createToolManifest` → `toolManifestToYAML`)
and would continue to advertise `dsbx` to the model regardless of the
instruction string.

**Change:** filter `dsbx` out of the manifest when `sandbox_dsbx_tools` is
off. Two possible shapes:

- Pass `hasDsbxTools` into `getToolsForProvider` / `createToolManifest` and
  drop the `dsbx` entry there, **or**
- Filter in `buildSandboxInstructions` after `createToolManifest` returns,
  before YAML serialization.

Prefer the former so `describe_toolset` (next item) gets the same filtering
without duplication. Keep the binary installed on disk — `dsbx forward`
(the egress proxy systemd unit) still needs it.

### 3. `describe_toolset` MCP tool

**File:** `front/lib/api/actions/servers/sandbox/tools/index.ts:90-107`

This sandbox MCP tool returns the same manifest to the agent on demand, so
filtering in step 2 needs to apply here too. If we filter at
`createToolManifest`/`getToolsForProvider`, this tool gets it for free.
Otherwise, add the same filter here. Tests must cover both call sites.

### 4. `POST /spaces/{spaceId}/mcp_server_views/{svId}/call_tool`

**File:** `front/pages/api/v1/w/[wId]/spaces/[spaceId]/mcp_server_views/[svId]/call_tool.ts:175-184`

Currently rejects with **400** when `sandbox_tools` is absent. **Change to
check `flags.includes("sandbox_dsbx_tools")`** and return **403** to match
the semantically-correct response and stay aligned with the new
`/sandbox/tools` gate. Note: this is a small response-shape change for an
existing endpoint, but `dsbx` only surfaces the error message to the model
so blast radius is contained.

### 5. `GET /api/v1/w/{wId}/sandbox/tools`

**File:** `front/pages/api/v1/w/[wId]/sandbox/tools.ts`

Currently **not** gated at all (only the `sbt-` token is required). This was
flagged as a gap during the earlier audit. **Change:** check
`flags.includes("sandbox_dsbx_tools")` and return **403** if false. Closes
the gap where a leaked `sbt-` could enumerate the catalog after a workspace
has the feature disabled.

### 6. (Optional) `dust-deep` sub-agent guidelines

**File:** `front/lib/api/assistant/global_agents/configurations/dust/deep-dive.ts:168-184`

This is a sub-agent instruction note ("Sub-agents do NOT have access to the
Sandbox") gated on `sandbox_tools`. It is about the **sandbox** as a whole,
not `dsbx tools` specifically — leave it on `sandbox_tools`. No change.

### 7. (Optional) Tool descriptions / MCP internal constants

**File:** `front/lib/actions/mcp_internal_actions/constants.ts:1065`

Gates a sandbox-related internal MCP constant on `sandbox_tools`. Same logic —
leave on `sandbox_tools` unless the gated content is specifically about
programmatic tool access. (Verify when implementing.)

## What stays on `sandbox_tools`

These surfaces are about the sandbox itself, not programmatic tool access,
and stay gated by the existing flag:

- `front/lib/resources/skill/code_defined/sandbox.ts:140-144` — skill
  availability.
- `front/lib/actions/mcp_execution.ts:165` — sandbox MCP execution context
  setup.
- `front/lib/api/assistant/global_agents/global_agents.ts:1218` — `hasSandbox`
  capability passed to global agent configs.
- `front/lib/api/actions/servers/skill_management/tools/index.ts:55` — skill
  resolution.
- `front/components/skill_builder/SkillBuilder.tsx:234`,
  `front/components/skills/SkillInfoTab.tsx:95,141` —
  `SkillBuilderFilesSection` (file attachments UI).
- `front/lib/api/skills/detection/{files,github}/import_skills.ts` —
  file attachments in imported skills.
- `front/pages/api/w/[wId]/skills/index.ts:357`,
  `front/pages/api/w/[wId]/skills/[sId]/index.ts:271` — file attachments
  validation in skill mutations.
- `front/pages/api/w/[wId]/sandbox/egress-policy.ts:50` — egress policy
  endpoint.
- `front/components/pages/workspace/developers/EgressPolicyPage.tsx:28` —
  egress policy admin page.
- `front/components/navigation/config.ts:326` — egress policy nav entry.
- `front/lib/resources/skill/code_defined/go_deep.ts:27` &
  `dust/deep-dive.ts:168-184` — sub-agent / sandbox interaction note.

## Things outside the flag (unchanged)

These are baked into the sandbox image regardless and have no `sandbox_tools`
gating today; the new flag does not change that:

- The `dsbx` binary itself, downloaded at image build from public GitHub
  releases — `front/lib/api/sandbox/image/registry.ts:183-189`. Stays on
  disk so `dsbx forward` (egress proxy systemd unit) keeps working.
- `dsbx forward` —
  `front/lib/api/sandbox/egress.ts:176`.
- `DUST_SANDBOX_TOKEN` / `DUST_API_URL` env injection at bash exec time —
  `front/lib/api/actions/servers/sandbox/tools/index.ts:239-242`. We keep
  this as **harmless compatibility**: the token's only consumer is the
  `dsbx`-driven endpoints (`/sandbox/tools`, `call_tool`), which both reject
  when the flag is off. Other sandbox MCP tools like `add_egress_domain` run
  in-process inside `front` and never see the token. No behavior change is
  needed; reverse this only if minting itself becomes observable/costly.

So with the new flag off but `sandbox_tools` on:
- `dsbx tools` runs in the shell, but the `GET /sandbox/tools` and
  `call_tool` endpoints both return **403**.
- The model is not told `dsbx tools` exists — instruction lines stripped,
  manifest entry filtered, `describe_toolset` output filtered.
- `bash`, `add_egress_domain`, etc. continue to work normally.

## Implementation steps

1. **Add the flag definition** in `front/types/shared/feature_flags.ts`
   (one entry, `dust_only`).
2. **Refactor `sandbox.ts`:** turn `SANDBOX_INSTRUCTIONS` into a function
   that conditionally appends the two `dsbx tools` lines based on
   `flags.includes("sandbox_dsbx_tools")`. Update `buildSandboxInstructions`
   to thread the boolean through.
3. **Filter `dsbx` from the tool manifest** when the flag is off.
   Preferred: keep `createToolManifest` pure and filter the `ToolEntry[]`
   before calling it, likely through a small helper or an option on
   `getToolsForProvider`. Remember both the provider-specific path and the
   `getSandboxImage(...).value.tools` fallback path in `sandbox.ts`, so
   `describe_toolset`
   (`front/lib/api/actions/servers/sandbox/tools/index.ts:90-107`)
   gets the same filtering with no duplication. Keep the binary on disk.
4. **Switch the `call_tool` endpoint** gate from `sandbox_tools` to an
   inline `flags.includes("sandbox_dsbx_tools")` check and change the
   disabled response from **400 to 403** for semantic alignment.
5. **Add a flag gate on `GET /sandbox/tools`** with the same inline check,
   also returning **403** when off.
6. **Tests:**
   - `front/lib/actions/mcp_execution.test.ts` — keep on `sandbox_tools`.
   - **Instruction filtering test:** assert `buildSandboxInstructions`
     contains the two `dsbx tools` lines iff `sandbox_dsbx_tools` is on.
   - **Manifest filtering test:** assert `dsbx` is absent from
     `createToolManifest` / `toolManifestToYAML` output when the flag is
     off, present when on.
   - **`describe_toolset` test:** assert the MCP tool's text output
     mirrors the manifest filtering.
   - **Endpoint tests:** positive + negative on each of `/sandbox/tools`
     and `call_tool`, with the new flag toggled. Assert 403 in the
     negative case.
   - Egress-policy tests should not change.
7. **Sweep all `dsbx tools` / "dsbx " mentions in prompt or instruction
   strings** to confirm the only ones in `front/` come from `sandbox.ts`
   (the prose) and `image/registry.ts:190` (the manifest entry). The
   other `dsbx` references in `egress.ts` and `image/registry.ts:183-187`
   are runtime/install plumbing, not prompts.
8. **Document** the two-flag matrix in the PR description:
   - `sandbox_tools` only → bash, egress, file attachments. No `dsbx tools`.
   - `sandbox_tools` + `sandbox_dsbx_tools` → full feature, today's behavior.
   - `sandbox_dsbx_tools` only → no effect (no sandbox to call from).
9. **Audit logging** (follow-up, not a blocker): add an audit event for
   `call_tool` so the admin surface for the new flag has visibility.
10. **Type-check & format:** `nvm use && cd front && NODE_OPTIONS="--max-old-space-size=8192" npx tsgo --noEmit`,
    then `npm run format:changed`.

## Rollout sequence

1. Land this flag with default `dust_only` and Dust workspace enabled —
   parity with today.
2. Promote `sandbox_tools` to broader stage (`on_demand` / GA) once Stage 1
   is ready. `sandbox_dsbx_tools` stays `dust_only`.
3. When Stage 2 is ready, promote `sandbox_dsbx_tools`.
4. Eventually (once Stage 2 is GA and stable) the two flags can be merged
   back into one or `sandbox_dsbx_tools` retired.

## Open questions

- **Flag name** — `sandbox_dsbx_tools` is descriptive but leaks the binary
  name. Alternatives: `sandbox_programmatic_tools`, `sandbox_tool_calls`.
- **Should the new flag also gate file attachments?** Currently file
  attachments are tied to `sandbox_tools`. The audit suggested decoupling
  them. If they should ship with Stage 1 sandbox, leave as-is. If they're
  closer to "programmatic agent capability" they could move to the new
  flag — needs product input.
- **Should we also revoke `sbt-` tokens minted while the new flag is off?**
  Currently a token is minted on every bash invocation regardless. With the
  new flag off, the token is harmless (no endpoints accept it for tool
  calls), so no change needed. Revisit only if minting itself becomes
  observable / costly.
