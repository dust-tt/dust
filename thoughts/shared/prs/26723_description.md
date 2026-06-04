## Description

Surfaces the credit cost of agent activity in the conversation UI.

Each agent message now carries a `costCredits` value, computed once at the end of the agentic loop as **intelligence credits** (from run usages) + **tool credits** (from final-status actions). The conversion reuses the exact same AWU helpers as Metronome billing, so what we display always matches what we bill.

- **Backend**
  - New nullable `costCredits` column on `agent_messages` (pre-deploy migration).
  - `computeAndStoreAgentMessageCredits` computes and persists the cost from the message's full accumulated `runIds` + final-status actions, gated on the billed statuses (`AGENT_MESSAGE_STATUSES_TO_TRACK`). Called from `updateResourceAndPublishEvent` for terminal events (success / gracefully stopped / cancelled) and from `finalizeInterruptedAgentLoopActivity` for the interrupted path.
  - Extracted shared AWU conversion helpers (`awuFromMicroUsd`, `intelligenceAwuFromRunUsages`, `toolAwuFromActions`) into `lib/metronome/events.ts` as the single source of truth; `buildLlmUsageEvents` now uses `awuFromMicroUsd`.
  - `computeConversationCreditCost` aggregates stored per-message credits across all ranks/versions (incl. retries) and is attached as `totalCostCredits` on the conversation GET response (both the Next handler and its Hono mirror).
  - The computed cost rides on the terminal `agent_message_done` event so the live client updates without a reload.

- **Frontend**
  - New `CreditCostMenuItem` shown in the per-message and per-conversation dropdown menus. It is **hidden unless the workspace is on a credit-priced plan** (`isCreditPricedPlan`) and there is a positive cost to show.
  - `ConversationViewer` patches the streamed `costCredits` into the live message entry and revalidates the conversation so the aggregate total updates live.
  - `useAgentMessageStream` preserves an already-patched `costCredits` so the racing message-level `success` event can't clobber it back to null.
  - Shared `formatCredits` helper moved to `lib/client/credits.ts` (was local to `MembersUsageTable`).

- **API / types**: `costCredits` added to the agent message types and `totalCostCredits` to the conversation type, with matching Swagger schema updates.

## Tests

- `credit_cost.test.ts` covers the conversion helpers and `computeAgentMessageCredits`: per-model grouping + ceil-before-sum, basic (1) vs advanced (3) tool weighting, unknown/external servers treated as advanced, non-final actions ignored, and the null-when-no-billable-usage case.

## Deploy Plan

- Pre-deploy migration `front/migrations/pre-deploy/20260602204836_add_cost_credits_column.sql` adds the nullable `costCredits` column to `agent_messages`. Run it before deploying the app code. The column is additive and nullable, so rollback is safe and existing messages simply report a null cost.
