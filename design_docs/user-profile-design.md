# Design Doc: User Profile

**Status:** Draft for review · **Owner:** @daph · **Scope:** `front`

## Problem we want to solve

Users repeatedly have to restate stable personal context: who they are, what they work on,
how they prefer to be helped, and recurring constraints or communication preferences.

The proposed v1 is a per-user, per-workspace free-text field, edited in account settings
and injected into the system prompt of the user's real agent conversations so agents can
personalize responses. It is manually authored, not auto-learned. It is called **Profile**,
not "Memory," to avoid clashing with the existing Agent Memory feature.

This solves: "who I am / how I want to be helped." It does **not** solve working memory,
instruction self-editing, or org-shared knowledge.

## Scoping

### MVP

| Topic          | Decision                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Scope          | Per-workspace, one profile per (user, workspace)                                                       |
| Reach          | All active agents in real conversations, incl. custom, **default-on except Slack**                     |
| Controls       | None in v1 (no builder opt-out, no admin toggle). This is a platform-level user personalization layer. |
| Multi-user     | Inject the triggering poster's profile                                                                 |
| Privacy policy | Dust conversation sharing is user responsibility; Slack-originated runs are excluded by default        |
| UI             | Section in the account settings page (`AccountSettings.tsx`)                                           |

### Longer-term vision

Should we ship manual Profile now, or wait for a more ambitious auto-built memory layer?

**Recommendation:** ship manual Profile first.

Manual Profile is the smallest useful product surface for the problem we are actually
solving in v1: stable user-provided context such as role, communication preferences,
recurring constraints, and "how I want Dust to help me." It is explicit, user-controlled,
easy to explain in the UI, easy to delete, and easy to debug when an answer feels overly
personalized. It also lets us validate whether a single cross-agent, per-workspace profile
is valuable before building the much harder automatic layer.

Auto-built memory is not simply a better implementation of the same feature. It changes the
problem:

- **Memory quality:** the system must decide what is worth remembering, avoid false or
  over-specific facts, and avoid turning one-off context into permanent preference.
- **Staleness:** memories become wrong over time. Without strong review/edit/delete flows,
  stale memories silently degrade answers.
- **Explainability:** users and support need to understand why an agent answered a certain
  way. "Because your profile says X" is inspectable; "because a background workflow inferred
  X from old conversations" is harder to trust.
- **Write policy:** deciding who or what can update memory is a product question, not just
  an implementation detail. Silent agent writes create surprising behavior; builder-owned
  instructions and user-owned preferences can conflict.
- **Security:** automatic memory increases the prompt-injection surface because adversarial
  content can try to get stored, not just influence one answer.
- **UX:** useful automatic memory needs review, correction, deletion, and possibly audit
  surfaces. Without those, it risks becoming the "messy memories" problem users already
  report in other products.

The better v2 is probably not "agents silently write profile." It is likely
**auto-suggested profile edits**: Dust proposes additions or changes based on repeated
signals, and the user accepts, edits, or rejects them. That preserves user control while
testing whether automatic extraction can produce useful profile content.

### Phased plan

1. **v1: Manual Profile**
   - User-authored, per-workspace profile.
   - Default-on for real Dust conversations, disabled for Slack-originated runs.
   - No builder opt-out.
   - Measure adoption, token cost, and qualitative impact.

2. **v1.5: Profile Suggestions**
   - Dust can suggest profile edits based on repeated patterns.
   - Suggestions are never written silently.
   - User accepts, edits, or rejects each suggestion.
   - This tests whether automatic extraction is useful without taking on full memory risk.

3. **v2: Auto-Built Memory Decision**
   - Only pursue if v1/v1.5 show strong value.
   - Requires clear write policy, stale-memory handling, edit/delete UX, and observability.
   - May use `agent_memories` or a separate memory layer depending on scope.

4. **Future: Agent-Writable Profile / Memory**
   - Not part of v1.
   - Requires source tracking, updated-by tracking, auditability, and user-visible controls.

## Tech framing for MVP

### Data model

New `user_profiles` table (`WorkspaceAwareModel`, wrapped by `UserProfileResource`):

- `workspaceId`, `userId` (both FK + indexed), `content varchar(2048)`, timestamps.
- Unique index `(workspaceId, userId)`.
- 2000 chars enforced server-side.
- Future automatic/suggested writes may require `source` and `updatedByUserId`.

**Alternatives rejected:** `user_metadata` (no typed columns for the roadmap; viable
fallback if automatic/suggested profile writes are dropped). `agent_memories` (agent-keyed + accumulation model;
it is the right home for the _later_ auto-learned / agent-writable layers, not this).
`profile.md` in a Computer (shared computer is multi-person so wrong privacy scope, only
reaches computer-enabled agents, pull-based read is unreliable; revisit as a future
convergence, see Dependencies).

### Injection

Built in `temporal/agent_loop/lib/run_model.ts` (next to `userContext`) and passed to
`constructPromptMultiActions` (`lib/api/assistant/generation.ts`), the single chokepoint
for agent-loop turns. New `buildUserProfileContext(auth)` loads the row and wraps it:

```
<user_profile description="Background the user provided. Apply where helpful; the agent's
instructions take precedence on conflict.">…</user_profile>
```

The profile content is user-provided data and must be escaped or serialized before being
inserted in the XML-like wrapper, so profile text cannot break the tag structure or pose as
system instructions.

Injected on each model call in the agent loop. The profile content is stable for the
run; if needed, the row can be loaded once and passed through the loop data, but v1 does
not need extra complexity unless metrics show the DB read matters.

**Caching:** the profile must sit in the uncached `ephemeralContext` tier. The 3-tier
structured prompt is only emitted for global agents today; custom agents use the flat form,
which `normalizePrompt` puts entirely in the 5-min-cached `sharedContext`
(`lib/api/llm/types/options.ts:81`). So for custom agents we must emit a structured prompt
(profile in `ephemeralContext`, rest in `sharedContext`) or we fragment the shared cache
per user. Coordinate with Flavien David (cache architecture).

**Gate** `shouldInjectUserProfile`, inject only when **all** hold:

1. `auth.user()` present.
2. agent `status === "active"` (excludes builder "try" previews, which run draft agents).
3. agent is not `SIDEKICK` / `REINFORCEMENT`.
4. origin is not Slack (`slack`, `slack_workflow`). Slack surfaces are shared by
   default and users do not control the visibility semantics the same way they do
   in Dust conversations.

This is a deliberate departure: custom agents get no user context today
(`globalAgentInjectsUserContext`), and Agent Memory is builder-opt-in. We accept it.
There is intentionally no builder opt-out in v1: profile is treated as user-level
context, not as an agent-builder-controlled capability.

### Security & privacy

**Leak:** the profile is the poster's own text, but a profile-shaped reply visible to
others can expose it. Policy: in Dust conversations, sharing is the user's responsibility.
The product-level mitigation is to disable injection by default for Slack-originated runs,
where visibility is channel-driven and less explicitly controlled by the Dust user, plus
**UI transparency copy** warning that the profile shapes replies.

**Endpoint:** scope to `auth.user()`'s own row; validate `wId`; reject foreign workspaces
(no IDOR).

**Accepted risks (v1):** default-on into custom agents (prompt-injection /
builder-surprise surface, accepted as product direction); profile visible in LLM traces
(no redaction yet); no write rate limit beyond the char cap.

### Rollout

Behind feature flag `user_profile`, used as the rollout kill switch. Emit StatsD adoption.

### API & UI

- `GET /api/w/[wId]/me/profile`
- `PUT /api/w/[wId]/me/profile`, zod `content: z.string().max(2000)`.
- `DELETE /api/w/[wId]/me/profile`
- `AccountSettings.tsx`: `TextArea` + char counter; SWR `useUserProfile` / `useUpdateUserProfile`;
  transparency help text (see Security).

### Dependencies

- **Copilot per-user metadata** (coordinate, overlap): already plans to inject
  `user_metadata` into prompts. Same pattern, different store. Align on one injection path.
- **Shared Computer** (Henry, starting soon): agents from background/Frame runs may have no
  user → already skipped by the gate; also the enabler for a future file-based profile.
- **`useFramesV2`** (shipped): lives in `generation.ts`; expect merge overlap.
- **Agent Cockpit Model B:** if agent state leaves the conversation, the injection point
  moves; profile is per-user so it ports either way.
