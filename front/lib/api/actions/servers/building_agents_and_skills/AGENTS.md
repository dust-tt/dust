# building_agents_and_skills MCP server

Internal MCP server that lets an agent propose changes to skills and agents from a conversation.
Nothing is applied directly: `suggest` records `pending` suggestions, in a batch that editors review
(see `CONTRACTS`, `changes-are-suggestions`).

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


### Accept the kind in `suggest`

All changes go through the single `suggest` tool, which records them as one batch.

- `metadata.ts`: add the field to the change schema it belongs to (`EditAgentSuggestionSchema`,
  `EditSkillSuggestionSchema`, or a creation schema), with `.describe()`. Instructions-like inputs
  are HTML, not markdown, for uniformity across fields.
- Update the metadata snapshot (`mcp_servers_metadata.test.ts.snap`).
- `tools/suggest.ts`: validate the field in the matching `plan…` function (`planAgentEdit`,
  `planSkillEdit`, …) and turn it into a `{ kind, suggestion }` row.
- Validation that a manual route already performs (e.g. `PATCH /skills/:sId/editors`) must be
  extracted to `front/lib/api/skills/` and shared with that route, so the apply step can re-run
  it against live state.
- Pass `source: "conversational"` explicitly in every `createSuggestionForAgent` /
  `createSuggestionForSkill` call (`explicit-suggestion-source` in `CONTRACTS`): the column's
  `sidekick`/legacy default is not a fallback for new callers, and factories used by the new tests
  need the same explicit `source` (see `AgentSuggestionFactory`/`SkillSuggestionFactory`).
- Prune the pending suggestions the new one supersedes (`pruneSupersededSkillSuggestions` in
  `skill_suggestion_changes.ts`, backed by `front/lib/reinforcement/skill_suggestion_pruning.ts`).
- Add `@cc` contracts for security-relevant invariants (see `requires-skill-write`).

### Unit tests for the tool

Extend the `describe(SUGGEST_TOOL_NAME)` block of `tools/index.test.ts`, reusing `getTool`,
`makeExtra`, `seedSkill`. Cover: happy path (rows, payload, batch directive), pruning of
superseded rows, non-editor caller, archived target, each validation error.

### UI cards

`suggest` outputs a `:batch_edit[]{sId=...}` directive (`formatBatchSuggestionDirective` in
`directives.ts`), rendered by `markdown/suggestion/BatchSuggestionDirective.tsx`. It carries the
batch id only; the card resolves the suggestions via SWR and switches on `kind`:

- Agent kinds: `AgentSuggestionDetails.tsx`.
- Skill kinds: `skill_builder/SkillSuggestionCard.tsx`.

Sidekick suggestions have their own directive and cards (`SidekickSuggestionDirective.tsx`,
`SidekickSuggestionCard.tsx`).

### Applying on accept

`PATCH /w/:wId/assistant/suggestion_batches/:bId` with `state: "approved"` calls
`applyBatchSuggestions` (`front/lib/api/assistant/apply_batch_suggestions.ts`): it plans the batch
into steps, checks every step's permissions, resolves every step against the current state of its
target, and only then writes them. The per-agent and per-skill `PATCH …/suggestions` routes only
set suggestion states.

Skills:
- Add a `case "<kind>"` in `editsForSuggestion` (`front/lib/editor/merge_skill_suggestion_edits.ts`)
  returning the `SkillEdits` to apply, and extend `mergeSkillEdits`.
- Resolve it in `resolveSkillEdits` (`front/lib/api/skills/apply_skill_suggestions.ts`): a field of
  `updateSkill` (versioned, carry over untouched fields), or its own write like availability and
  editors.
- Check the permissions of the kind in `SKILL_SUGGESTION_KIND_REQUIRED_VERBS`
  (`front/lib/api/skills/suggestion_authorization.ts`).

Agents:
- Add a `case "<kind>"` in `fieldEditsForSuggestion`
  (`front/lib/editor/merge_agent_suggestion_changes.ts`) and extend `AgentEdits`.
- Resolve it in `resolveAgentEdits` (`front/lib/api/assistant/apply_agent_suggestions.ts`): a
  definition field saved as a new version (`resolveAgentFieldEdits`), or applied in place like the
  scope.
- Check the permissions of the kind in `AGENT_SUGGESTION_KIND_ACCEPTED_VERBS`
  (`front/lib/api/assistant/agent_suggestion_authorization.ts`).

Test both in `front/lib/api/assistant/apply_batch_suggestions.test.ts`.

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
