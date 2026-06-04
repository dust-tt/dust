# Design Doc: User Profile

**Status:** Draft for review · **Owner:** @daph · **Scope:** `front`

## Problem we want to solve

Users repeatedly have to restate stable personal context: who they are, what they work on,
how they prefer to be helped, and recurring constraints or communication preferences.

The proposed v1 is a per-user, per-workspace profile/memory surface, edited in account
settings and injected into the system prompt of the user's real agent conversations so
agents can personalize responses. It is explicitly maintained by the user and by agents,
not auto-groomed from all conversations in the background. **Profile** is the user-facing
name for this memory surface.

This solves: "who I am / how I want to be helped." It does **not** solve working memory,
instruction self-editing, or org-shared knowledge.

## Scoping

### MVP

| Topic          | Decision                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Scope          | Per-workspace, one profile per (user, workspace)                                                       |
| Reach          | All active agents in real conversations, incl. custom, **default-on except Slack**                     |
| Controls       | None in v1 (no builder opt-out, no admin toggle). This is a platform-level user memory layer.           |
| Writes         | Bidirectional from day 0: users and agents update the same profile/memory surface.                      |
| Multi-user     | Inject the triggering poster's profile                                                                 |
| Privacy policy | Dust conversation sharing is user responsibility; Slack-originated runs are excluded by default        |
| UI             | Section in the account settings page (`AccountSettings.tsx`)                                           |

### Longer-term vision

**Decision:** v1 uses one bidirectional profile/memory system.

We should avoid creating two memory systems: one manually edited "Profile" and another
agent-maintained "Memory." The user-facing profile should be the editable surface of the
same underlying memory object that agents can update. If a user can add or correct stable
context, an agent should be able to propose or perform the same class of update through the
same store and same UI surface.

This keeps the product model simple:

- Users have one place to inspect, edit, and delete what Dust knows about them in a
  workspace.
- Agents do not maintain a separate hidden memory layer that can diverge from the profile.
- Support/debugging can point to one source of personalization.
- Future automatic behavior improves the same memory object instead of introducing a second
  persistence mechanism.

Agent writes happen through a tool. The tool follows the existing tool-permission model:
if updating memory is not considered low-stake, the user is asked for permission before the
write. This keeps v1 bidirectional without adding a second "suggestions" system.

Fully auto-built memory remains a harder problem:

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

The likely v2 is a **dream mode**: an overnight/background process that reviews the user's
recent conversations, reinforces useful memories, removes or rewrites stale ones, and
grooms the profile/memory surface into something cleaner than raw accumulated facts. That
should improve the same memory object, not create a second one.

### Phased plan

1. **v1: Bidirectional Profile / Memory**
   - One per-workspace memory surface for stable user context.
   - User-editable in account settings.
   - Agent-writable through a tool that updates the same underlying store.
   - Permission is requested through the existing tool-permission model when the write is
     not low-stake.
   - Default-on for real Dust conversations, disabled for Slack-originated runs.
   - No builder opt-out.
   - Measure adoption, token cost, write quality, and qualitative impact.

2. **v2: Dream Mode**
   - Background reinforcement/grooming of the same memory surface.
   - Reviews recent conversations to improve, consolidate, and prune memories.
   - Requires stale-memory handling, auditability, observability, and strong user controls.

## Tech framing for MVP

### Data model

New `user_profiles` table (`WorkspaceAwareModel`, wrapped by `UserProfileResource`).
Despite the table name, this is the single per-user, per-workspace profile/memory store:

- `workspaceId`, `userId` (both FK + indexed), `content varchar(2048)`, timestamps.
- `source` and `updatedByUserId` so user and agent writes are attributable.
- Unique index `(workspaceId, userId)`.
- 2000 chars enforced server-side.

**Alternatives rejected:** `user_metadata` (no typed columns for the roadmap; viable
fallback if agent-writable memory is dropped). A separate `agent_memories` layer for this
use case is rejected because it would create two memory systems for the same user-facing
problem. Existing agent-keyed memory concepts can still inform the write/grooming workflow,
but the user should inspect and edit one profile/memory surface.
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

### Lifecycle

Delete the row on user deletion, workspace deletion, and **membership revocation** (the
last is a gap that exists for `user_metadata` today, `lib/api/membership.ts:223`).

### Rollout

Behind feature flag `user_profile`, used as the rollout kill switch. Emit StatsD adoption.

### API & UI

- `GET /api/w/[wId]/me/profile`
- `PUT /api/w/[wId]/me/profile`, zod `content: z.string().max(2000)`.
- `DELETE /api/w/[wId]/me/profile`
- Agent writes go through a memory-update tool, reuse the existing tool-permission model,
  and update the same row through `UserProfileResource` with `source` / `updatedByUserId`
  attribution.
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
