# building_agents_and_skills MCP server

Internal MCP server that lets an agent propose changes to skills and agents from a conversation.
Nothing is applied directly: each tool records a `pending` suggestion that editors review (see
`CONTRACTS`, `changes-are-suggestions`).

## Adding a new kind of suggestion

`kind` is a string column discriminating a JSONB `suggestion` payload. Each kind needs a payload
schema, a tool, UI, and an apply path.

### Declare the kind

- Skills: `front/types/suggestions/skill_suggestion.ts`. Add the literal to
  `SKILL_SUGGESTION_KINDS`, a Zod payload schema, and a `{ kind, suggestion }` member of the
  `discriminatedUnion("kind")` behind `parseSkillSuggestionData`.
- Agents: `front/types/suggestions/agent_suggestion.ts`, same pattern (`AGENT_SUGGESTION_KINDS`,
  `AgentSuggestionDataSchema`).
- No DB migration: `kind` is free-form and the payload is JSONB.
- Add one test in `front/lib/resources/skill_suggestion_resource.test.ts` (or
`agent_suggestion_resource.test.ts`): create a suggestion of the new kind through the factory
(`SkillSuggestionFactory` defaults to `kind: "edit"`, pass yours), fetch it back, assert `kind`
and the parsed payload, and call `toJSON()`.
- Run `tsgo`: every `switch (suggestion.kind)` guarded by `assertNeverAndIgnore` now fails
  and will point you to places to fix in next steps.


### Implement the tool

- `metadata.ts`: `<NAME>_TOOL_NAME`, an input schema with `.describe()` on every field, and an
  entry in `BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA`. Instructions-like inputs are HTML, not
  markdown, for uniformity across tools.
- Update the metadata snapshot (`mcp_servers_metadata.test.ts.snap`).
- `tools/<tool_name>.ts`: a pure `(auth, args) => Result<Resource, MCPError>` plus a thin `...Handler`,
- Validation that a manual route already performs (e.g. `PATCH /skills/:sId/editors`) must be
  extracted to `front/lib/api/skills/` and shared with that route, so the apply step can re-run
  it against live state.
- Pass `source: "conversational"` explicitly in every `createSuggestionForAgent` /
  `createSuggestionForSkill` call from a tool (`explicit-suggestion-source` in `CONTRACTS`): the
  column's `sidekick`/legacy default is not a fallback for new callers, and factories used by the
  new tests need the same explicit `source` (see `AgentSuggestionFactory`/`SkillSuggestionFactory`).
- Prune conflicting pending suggestions of the same kind and mark them `outdated`
  (`front/lib/reinforcement/skill_suggestion_pruning.ts`). If the prune-then-insert sequence must
  guarantee a single open pending suggestion per target (`no-direct-deletion`-style contracts),
  serialize it with `executeWithLockResult` (`front/lib/lock.ts`) keyed by the target id — the
  read/outdate/insert steps are not otherwise atomic.
- Output a directive: `:skill_suggestion[]{sId=... kind=<kind> skillId=...}` or
  `:agent_suggestion[]{sId=... kind=<kind> agentId=...}`.
- `tools/index.ts`: register the handler. Add `@cc` contracts for security-relevant invariants
  (see `requires-skill-write`).

### Unit tests for the tool

Extend `tools/index.test.ts` with a `describe(<NAME>_TOOL_NAME)` block reusing `getTool`,
`makeExtra`, `seedSkill`. Cover: happy path (row, payload, directive), pruning of conflicting
rows, non-editor caller, archived target, each validation error.

### UI cards

Directives carry ids only; a remark plugin resolves the suggestion via SWR and switches on `kind`.

- Skill kinds: see `markdown/suggestion/SkillSuggestionDirective.tsx` 
- Agent kinds: `SidekickSuggestionDirective.tsx` and `SidekickSuggestionCard.tsx`.

### Applying on accept

Skills:
Server-side: `PATCH /w/:wId/assistant/skills/:sId/suggestions` with `applyToSkill: true` calls
`applySkillSuggestions` (`front/lib/api/skills/apply_skill_suggestions.ts`) before
`bulkUpdateState`. The route already enforces `approved`, `skill.canWrite(auth)` and `pending`.

- Add a `case "<kind>"` in `editsForSuggestion` returning the `SkillEdits` to apply (or `Err` if
  not applicable yet) and extend `mergeSkillEdits`. `updateSkill` replaces the whole skill, so
  carry over untouched fields.
- Test in `front-api/routes/.../skills/[sId]/suggestions.test.ts` (`PATCH with applyToSkill`).

Agents:
Server-side: `PATCH /w/:wId/assistant/agent_configurations/:aId/suggestions` with
`applyToAgent: true` calls `applyAgentSuggestions`
(`front/lib/api/assistant/apply_agent_suggestions.ts`) before `bulkUpdateState`. The route
enforces `approved`, `agent.canEdit` and `pending`. Only `create` is applied today: it turns the
`pending` placeholder into an active, hidden agent. Sidekick kinds are still patched into the
builder form client-side and are rejected by `applyAgentSuggestions`.

- Add a `case "<kind>"` in `applyAgentSuggestions`.
- Test in `front-api/routes/.../agent_configurations/[aId]/suggestions.test.ts`
  (`PATCH with applyToAgent`).

### Update the conversational-building skill 

- Mention the tool in the `<tools>` section of the `conversational-building` skill prompt
  (`front/lib/resources/skill/code_defined/global/conversational_building.ts`): one line, what it
  does and when to call it. Follow exiting tools pattern.

### Seed example

Add an example of the new kind to the `conversational_building` dev seed
(`front/scripts/seed/conversational_building/`, see its README) so the card can be checked in a
real conversation:

- extend `SkillSuggestionAsset` in `front/scripts/seed/factories/types.ts` with the new kind,
- add a suggestion of that kind in `assets/skill_suggestions.json` (flag it `overwrite` like the
  others so re-running the seed picks up asset changes),
- reference it from an agent message in `assets/conversations.json` through a placeholder that
  `seedConversationalBuilding.ts` resolves to the created suggestion's `sId` in the directive,
- extend `seed.test.ts` to check it and run the test.

### Notes and things to be aware

Skills:
 - Reinforcement also generates suggestions which are displayed in the builder, but they are
   scoped to a subset of kinds. No kinds should not be added to it.

Agents:
 - Sidekick also generates suggestions but they are scoped to only one agent.
   The new suggestions for conversational building should not leak in sidekick and not break it.
