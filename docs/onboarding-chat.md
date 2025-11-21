# Onboarding Chat (New Workspace)

## Objective
- Replace the “Welcome tour” and QuickStart guide with a model‑led onboarding chat for brand‑new workspaces, without changing the join flow for existing workspaces.

## Scope
- Applies only to the first user creating a brand‑new workspace.
- Does not apply to users joining an existing workspace (invite, domain auto‑join, shared links).

## Entry Point
- Activated when the user lands on the conversation page with `welcome=true` in a brand‑new workspace (e.g., after the `/w/[wId]/welcome` step or post‑billing redirect).

## Feature Flag
- Entire experience is gated behind a feature flag: `onboarding_chat_v1`.
- When disabled: no auto‑created onboarding chat; user lands on the normal conversation screen.

## Onboarding Conversation
- Auto‑create the user’s first conversation on entry.
- Agent: Dust global agent (`@dust`).
- Initial user message: contains only a `<dust_system>…</dust_system>` block (copy TBD) indicating onboarding; treated as invisible (see “Visibility”).
- Conversation visibility: `unlisted`.
- The agent’s first visible message appears to the user as the start of the chat (agent‑initiated feel).

## Visibility
- The initial onboarding user message is not shown in the UI (invisible to the user).
- The conversation visually starts with the agent’s first message.

## Onboarding Mode
- Store the onboarding conversation id in user metadata.
  - Key: `onboarding:conversation`
  - Value: conversation `sId`
- While the key is present, the user is in “onboarding mode”.
- In onboarding mode, simplify the UI to the conversation view (hide standard navigation and non‑essential UI).
- Exit conditions: TBD. Clearing `onboarding:conversation` ends onboarding mode.

## Persistence
- Uses user metadata only (no new server objects or workspace metadata).

## Non‑Goals / Unchanged
- Joining an existing workspace remains unchanged (no auto‑created chat, no UI gating).
- No changes to agent configurations beyond using the Dust global agent for onboarding.

## Deletions
- Remove the “Welcome Tour Guide” overlay and its trigger (query param still allowed to route but no tour is shown).
- Remove the QuickStart guide (sheet and Help menu entry).

