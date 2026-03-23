# Metronome Billing Integration — Design Doc

## Context

Dust is migrating from Stripe Billing to Metronome to support credit-based pricing. Metronome sits on top of Stripe (payments remain in Stripe). The backend sends granular usage events to Metronome; all pricing logic, rate cards, custom plans, and limits are configured in Metronome by GTM/Ops — not by engineers in the codebase.

**Current state:** Commitment signed ($30k). Metering infrastructure implemented (events flowing to Metronome). Customer provisioning ready. Sandbox configured with metrics, products, rate card, and package.

**Target:** Metronome live when the new pricing ships (~early April).

## Architecture Overview

```
                    ┌─────────────┐
                    │  Metronome  │
                    │             │
   usage events ──▶ │  Billable   │──▶ One-off Stripe invoices
   (all workspaces) │  Metrics    │
                    │  Rate Cards │
                    │  Contracts  │
                    │  Packages   │
                    └──────┬──────┘
                           │ webhooks
                           ▼
                    ┌─────────────┐
                    │    Dust     │
                    │   Backend   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Stripe    │
                    │  (payments  │
                    │    only)    │
                    └─────────────┘
```

**Key concepts:**

- **Metronome creates one-off Stripe invoices**, not subscriptions. Stripe becomes a payment processor only.
- **Stripe Checkout stays** as the entry point for payment method capture. Customer + contract provisioned from the `checkout.session.completed` webhook.
- **Two independent concerns:**

| Concern | Scope | Gating |
|---------|-------|--------|
| **Metering** — emitting usage events to Metronome | All workspaces | `METRONOME_ENABLED` env var |
| **Billing** — using Metronome for invoicing, credits, limits | Per plan | `metronomePackageAlias` on `PlanModel` |

## Key Design Decisions

### Pricing logic split

| Concern | Where it lives | Changed by |
|---------|---------------|------------|
| Per-model token rates (provider cost) | `token_pricing.ts` (code) | Engineers (when providers change pricing) |
| Markup percentage (e.g., 30%) | Rate card in Metronome | GTM/Ops |
| Per-tool-category pricing | Rate card in Metronome | GTM/Ops |
| Per-seat-type pricing | Rate card in Metronome | GTM/Ops |
| Custom enterprise discounts | Contract overrides in Metronome | Sales/Ops |
| New model added | Update `token_pricing.ts` only | Engineers |

### Programmatic vs user usage split

All metrics and products are split into programmatic and user variants. This allows:
- Different markup per type (e.g., 30% on programmatic, 0% on user)
- Billing only programmatic usage on current plans (matching existing behavior)
- Billing all usage when new credit-based pricing ships

### Plan-based billing mode (not feature flags)

Metronome billing is determined by the workspace's plan via `metronomePackageAlias` column on `PlanModel`:
- `null` → Stripe billing (all existing plans)
- `"pro-plan"` → Metronome billing via Pro Plan package

```typescript
function isMetronomeBilled(plan: PlanType): boolean {
  return plan.metronomePackageAlias != null;
}
```

Each Dust plan maps 1:1 to a Metronome package. Packages are immutable templates containing rate card + seat subscriptions.

### Seat types

Two seat types for now: **Pro** ($29/mo) and **Max** ($99/mo). Managed via Metronome's native seat-based subscriptions with `seat_group_key: "user_id"`. Usage events include `user_id` for per-seat credit attribution. Programmatic usage (no user) draws from workspace-level credits.

### Agentic Work Units (AWU) classification

Every message is classified as **basic** or **advanced** based on the models and tools used:

- **Basic**: Standard models (Claude Sonnet, GPT-5 Mini, Gemini Flash, Mistral, DeepSeek), no expensive tools, not part of multi-agent chain
- **Advanced**: Frontier/reasoning models (Claude Opus, GPT-5, o1/o3/o4, Gemini Pro), OR expensive tools (deep research, file/image generation, multi-agent orchestration)

Classification is computed in code (`classifyMessageTier` in `events.ts`) and sent as `message_tier` property on all events. Metronome can use it to:
- Apply different credit costs per tier (basic = 1 credit, advanced = 5 credits)
- Enforce daily quotas per tier (100 basic/day, 50 advanced/month per seat)
- Filter billing metrics by tier

Sub-agent messages are tagged with `is_sub_agent_message: "true"` (detected via `agenticMessageType` on `UserMessageModel`). This allows metering at parent message level only — deep-dives spawning 100 sub-agents don't charge 100 credits.

**AWU credit weights per tool category** (from Pricing Push):

| Tool Category | Credits | Examples |
|---|---|---|
| RAG / Data retrieval | 1 | search, table query, include data |
| Write / Visuals | 2 | file generation, image, slideshow |
| Orchestrators | 5 | run_agent, agent_router |
| Web search | TBD | web_search_&_browse |
| Connectors | TBD | salesforce, slack, etc. |

### Custom credit type (Dust Credits)

To be created in Metronome (via UI/support): a non-fiat "Dust Credits" pricing unit. The rate card defines `credit_type_conversions` to set the USD value per credit (target: ~$0.03–$0.05/credit). Customers see and purchase credits; invoices show USD.

## Events Emitted to Metronome

All events emitted for all workspaces when `METRONOME_ENABLED=true`.

### `llm_usage` — per model per agent message

| Property | Type | Description |
|----------|------|-------------|
| `workspace_id` | string | Workspace sId |
| `user_id` | string (optional) | User sId, null for programmatic |
| `agent_message_id` | string | Agent message sId |
| `provider_id` | string | e.g., `anthropic`, `openai` |
| `model_id` | string | e.g., `claude-sonnet-4-6` |
| `prompt_tokens` | number | Input tokens |
| `completion_tokens` | number | Output tokens |
| `cached_tokens` | number | Cache read tokens |
| `cache_creation_tokens` | number | Cache write tokens |
| `cost_micro_usd` | number | Provider cost (no markup), from `token_pricing.ts` |
| `is_programmatic_usage` | string | `"true"` or `"false"` |
| `message_tier` | string | `"basic"` or `"advanced"` (AWU classification) |
| `is_sub_agent_message` | string | `"true"` if spawned by another agent |
| `origin` | string | e.g., `web`, `slack`, `api`, `zapier` |

### `tool_use` — per MCP action per agent message

| Property | Type | Description |
|----------|------|-------------|
| `workspace_id` | string | Workspace sId |
| `user_id` | string (optional) | User sId, null for programmatic |
| `agent_message_id` | string | Agent message sId |
| `tool_name` | string | e.g., `websearch`, `search` |
| `internal_mcp_server_name` | string | e.g., `web_search_&_browse`, empty for external |
| `mcp_server_id` | string | Server sId |
| `tool_category` | string | Pricing tier (see below) |
| `status` | string | `succeeded`, `errored`, `denied`, etc. |
| `execution_duration_ms` | number | Wall-clock execution time |
| `is_programmatic_usage` | string | `"true"` or `"false"` |
| `message_tier` | string | `"basic"` or `"advanced"` (AWU classification) |
| `is_sub_agent_message` | string | `"true"` if spawned by another agent |
| `origin` | string | e.g., `web`, `slack`, `api` |

**Tool categories** (8 values, mapped from `internal_mcp_server_name` in `events.ts`):
- `retrieval` — search, query_tables_v2, data_warehouses, data_sources_file_system, include_data, conversation_files
- `deep_research` — web_search_&_browse, http_client
- `reasoning` — (reserved for future reasoning server)
- `connectors` — confluence, github, slack, salesforce, notion, google_drive, jira, hubspot, etc.
- `generation` — file_generation, image_generation, sound_studio, slideshow, etc.
- `agents` — run_agent, agent_router, agent_sidekick_*, agent_management, run_dust_app
- `actions` — external MCP servers (default for unknown)
- `platform` — extract_data, common_utilities, toolsets, skill_management, etc.

### `seats` — gauge, daily snapshot (analytics only)

| Property | Type | Description |
|----------|------|-------------|
| `workspace_id` | string | Workspace sId |
| `seat_count` | number | Total active members |

Not used for billing (seats are tracked via Metronome's seat-based subscriptions). Kept for analytics and migration sanity checks.

### `mau` — gauge, daily snapshot (analytics only)

| Property | Type | Description |
|----------|------|-------------|
| `workspace_id` | string | Workspace sId |
| `mau_count` | number | Users with 1+ message in rolling 30-day window |

## Metronome Configuration (Sandbox)

Full setup script: `front/docs/metronome-sandbox-setup.sh`

### Billable Metrics

| Metric | Aggregation | Filter |
|--------|-------------|--------|
| LLM Provider Cost (Programmatic) | SUM on `cost_micro_usd` | `is_programmatic_usage=true` |
| LLM Provider Cost (User) | SUM on `cost_micro_usd` | `is_programmatic_usage=false` |
| Tool Invocations (Programmatic) | COUNT (succeeded only) | grouped by `tool_category` |
| Tool Invocations (User) | COUNT (succeeded only) | grouped by `tool_category` |
| Active Seats | MAX on `seat_count` | analytics only |
| Monthly Active Users | MAX on `mau_count` | analytics only |

### Products

| Product | Type | Pricing Key | Notes |
|---------|------|-------------|-------|
| AI Usage (Programmatic) | USAGE | — | quantity_conversion ÷1M (micro-USD → dollars) |
| AI Usage (User) | USAGE | — | quantity_conversion ÷1M |
| Tool Usage (Programmatic) | USAGE | `tool_category` | dimensional pricing by category |
| Tool Usage (User) | USAGE | `tool_category` | dimensional pricing by category |
| Pro Seat | SUBSCRIPTION | — | $29/mo |
| Max Seat | SUBSCRIPTION | — | $99/mo |

### Pro Plan Rate Card

| Product | Price (cents) | Notes |
|---------|--------------|-------|
| Pro Seat | 2900 ($29/mo) | FLAT + MONTHLY billing |
| Max Seat | 9900 ($99/mo) | FLAT + MONTHLY billing |
| AI Usage (Programmatic) | 130 ($1.30 per $1 cost) | 30% markup on provider cost |
| Tool Usage (Programmatic) | 0 per category | Ready for per-category pricing |

User products (AI Usage User, Tool Usage User) are ready but not on any rate card yet — add when new pricing ships.

### Pro Plan Package

Bundles rate card + seat subscriptions into a reusable template:
- 2 seat-based subscriptions (Pro, Max) with `seat_group_key: "user_id"`
- `collection_schedule: ADVANCE`, prorated, bill immediately on seat changes
- Provisioning: `package_alias: "pro-plan"`

## Implementation Blocks

### Block 0: Metering Infrastructure ✅ Done

**Files created/modified:**
- `front/lib/metronome/client.ts` — HTTP client for ingest API + customer creation
- `front/lib/metronome/events.ts` — Event builders with tool category mapping + user_id
- `front/lib/api/config.ts` — `METRONOME_ENABLED` + `METRONOME_API_KEY`
- `front/temporal/usage_queue/activities.ts` — Emit events for all usage; daily cron for gauges
- `front/temporal/usage_queue/workflows.ts` — `emitMetronomeGaugeEventsWorkflow`
- `front/temporal/usage_queue/client.ts` — Schedule launcher (daily prod, 10min dev)
- `front/temporal/usage_queue/worker.ts` — Start schedule on worker boot
- `front/lib/plans/usage/mau.ts` — Exported `countActiveUsersForPeriodInWorkspace`
- `front/scripts/provision_metronome_customers.ts` — Migration script for existing workspaces
- `front/pages/api/stripe/webhook.ts` — Provision Metronome customer on `checkout.session.completed`
- `front/lib/models/plan.ts` — Added `metronomePackageAlias` column
- `front/types/plan.ts` — Added `metronomePackageAlias` to `PlanType`
- `front/lib/plans/renderers.ts` — Render `metronomePackageAlias`
- `front/docs/metronome-sandbox-setup.sh` — Full Metronome sandbox setup reference

**Key fix:** MAU/seats gauge events were only triggered by membership changes. Added a daily Temporal cron that reports for all workspaces, fixing the stale data gap for stable workspaces.

### Block 1: Billing Switchover

**Plan-based gating:** `metronomePackageAlias` on `PlanModel` determines billing mode. No feature flag.

**New subscriptions:** When `checkout.session.completed` fires for a plan with `metronomePackageAlias`:
1. Create Metronome customer (already implemented)
2. Create Metronome contract using `package_alias` (to implement)
3. Skip Stripe subscription creation

**Existing workspace migration:**
1. Set `metronomePackageAlias` on the plan
2. Wait for current Stripe billing cycle to end
3. On cycle renewal (`customer.subscription.updated` webhook):
   - Detect plan has `metronomePackageAlias`
   - Create Metronome contract
   - Migrate remaining internal credits to Metronome commits (free → prepaid priority 1, committed → prepaid priority 2, PAYG → postpaid priority 3)
   - Freeze internal credits
   - Cancel Stripe subscription items (keep Stripe customer)

**Skip existing billing for Metronome workspaces:**
- `recordUsageActivity`: skip `reportUsageForSubscriptionItems` (Stripe MAU/seat reporting)
- `trackProgrammaticUsageActivity`: skip `trackProgrammaticCost` (internal credit consumption)
- Both continue to emit Metronome events regardless

### Block 2: Credit Blocking for All Usage

Today only programmatic usage is blocked when credits run out. With Metronome, ALL usage (including web/Slack) must be gated.

**Redis-cached credit balance:**
- `getMetronomeCreditBalance(workspaceSId)` / `hasMetronomeCredits(workspaceSId)`
- Cache TTL ~60 seconds
- Updated by: Metronome webhooks (real-time) + periodic poll (fallback in daily gauge cron)

**Pre-flight check in agent loop:**
```
if isMetronomeBilled(plan):
  if not hasMetronomeCredits(workspace.sId):
    block message with "workspace out of credits" error
```

**Metronome webhook handler** (`front/pages/api/metronome/webhook.ts`):

| Event | Action |
|-------|--------|
| `alerts.low_remaining_credit_balance_reached` | Update Redis: credits exhausted |
| `alerts.low_remaining_seat_balance_reached` | Update Redis: per-seat credits exhausted |
| `alerts.spend_threshold_reached` | Update Redis: approaching limit |
| `commit.segment.start` | Update Redis: credits available (new period) |
| `credit.create` | Update Redis: credits available (purchase) |
| `contract.start` | Activate Metronome billing for workspace |
| `contract.end` | Downgrade workspace, schedule scrub |
| `invoice.finalized` | Log/record invoice |
| `invoice.billing_provider_error` | Alert on-call |

### Block 3: Seat Types

Two types: **Pro** ($29/mo, 200 credits/mo) and **Max** ($99/mo, 1000 credits/mo).

**Data model:** Add `seatType` column to membership model. Default `"pro"` for backward compat.

```typescript
type SeatType = "pro" | "max";
```

**Seat lifecycle:**

| Event | Action |
|-------|--------|
| Workspace subscribes to Pro Plan | All existing members get Pro seats automatically |
| New member joins | Auto-assign Pro seat (`add_seat_ids` on Pro subscription) |
| Member removed | Remove their seat (`remove_seat_ids`) |
| Admin upgrades user to Max | `remove_seat_ids` from Pro + `add_seat_ids` on Max |
| Admin downgrades user to Pro | `remove_seat_ids` from Max + `add_seat_ids` on Pro |

**Key rule:** Pro seats are automatic (every member gets one). Max seats are explicit (admin-purchased on demand).

**Code changes needed:**

| Location | Change |
|----------|--------|
| `checkout.session.completed` | After creating contract, iterate all workspace members → `add_seat_ids` on Pro seat subscription for each |
| `signup.ts` (member joins) | Add a Pro seat for the new user |
| `membership.ts` (member revoked) | Remove the seat from whichever subscription they're on |
| New admin endpoint | `PATCH /api/w/[wId]/members/[userId]/seat-type` — upgrade/downgrade between Pro ↔ Max |
| Membership model | Add `seatType` column (default `"pro"`) |

**Metronome integration:**
- Seats tracked natively via seat-based subscriptions (configured in package)
- `seat_group_key: "user_id"` — matches `user_id` in usage events
- Per-seat credit allocation: 200 Dust Credits/mo (Pro), 1000 Dust Credits/mo (Max) via recurring credits with `INDIVIDUAL` allocation
- Balance queryable via `/contracts/seatBalances/list` (for UI)
- `low_remaining_seat_balance_reached` webhook for alerts

**Credits per seat type:**
- Pro seat: 200 Dust Credits/month (auto-granted per seat)
- Max seat: 1000 Dust Credits/month (auto-granted per seat)
- Credits are per-seat (INDIVIDUAL allocation), not pooled
- Usage events with `user_id` draw down from that user's seat credits
- Programmatic usage (no `user_id`) draws from workspace-level credits/commits

**Feature limits per seat type:** Enforced in code (faster than querying Metronome), similar to current plan limits + feature flag pattern.

### Block 4: Contract Provisioning

**New workspace signup (Metronome-billed):**
1. `checkout.session.completed` fires (Stripe Checkout)
2. Create Metronome customer with Stripe customer ID linked (already implemented)
3. Create Metronome contract: `package_alias: plan.metronomePackageAlias`
4. Iterate all workspace members → `add_seat_ids` on Pro seat subscription for each
4. Assign initial seats on the contract

**Contract configuration via packages:**
- Each plan maps to a Metronome package (immutable template)
- Package contains: rate card, seat subscriptions, recurring credits
- New pricing version = new package with same alias + future effective date

### Block 5: Webhook Rewrite

**Stripe webhook changes** (for Metronome-billed workspaces):

| Stripe Event | Current behavior | Metronome-billed behavior |
|---|---|---|
| `checkout.session.completed` | Create Stripe subscription | Create Metronome customer + contract via package (no Stripe subscription) |
| `invoice.paid` | Grant free credits | No-op (Metronome handles credits) |
| `invoice.payment_failed` | Email admins, track failure | Keep as-is (Stripe still collects payment on Metronome invoices) |
| `customer.subscription.updated` | Report usage, allocate PAYG | Trigger switchover if mid-migration; otherwise no-op |
| `customer.subscription.deleted` | End subscription, schedule scrub | No-op (contract.end handles this) |
| `charge.dispute.created` | Log dispute | Keep as-is (Stripe-level) |

**Stripe Checkout stays permanently** as the payment method capture entry point.

**New Metronome webhook endpoint:** `front/pages/api/metronome/webhook.ts` (see Block 2 for event list).

## Implementation Sequence

```
Block 0: Metering infrastructure              ✅ Done
    │
    ▼
Block 1: Plan-based billing switchover        ← Start here
    │
    ├──▶ Block 2: Credit blocking              (can parallel with Block 3)
    │
    ├──▶ Block 3: Seat types (pro/max)         (can parallel with Block 2)
    │
    ▼
Block 4: Contract provisioning                 (depends on Block 1)
    │
    ▼
Block 5: Webhook rewrite                       (depends on Block 4)
    │
    ▼
Migration: Roll out plan by plan
    │
    ▼
Cleanup: Remove old Stripe billing code
```

Blocks 2 and 3 can be parallelized. Estimated: 1 month with 4 engineers, then cooling with 1-2 engineers.

## Current Stripe Billing — Reference

For understanding what gets replaced:

**Seat reporting (PER_SEAT plans):** `stripe.subscriptionItems.update({ quantity })` — triggered by membership changes, rate-limited 1/hour. Point-in-time quantity.

**MAU reporting (MAU_X enterprise plans):** `stripe.subscriptionItems.createUsageRecord()` with `action: "set"` — also triggered by membership changes only (gap: MAU can change without membership changes, fixed by our daily cron).

**Credit system:** Free → committed → PAYG → excess, consumed in priority order. Only programmatic usage is billed. `DUST_MARKUP_PERCENT = 30%` applied in code.

**MAU thresholds:** `MAU_1`/`MAU_5`/`MAU_10` — minimum messages per month to count as active user (1, 5, or 10). Negotiated per enterprise deal.

## Open Questions

1. **Custom credit type**: Need to create "Dust Credits" pricing unit in Metronome (via UI or support). Required for AWU credit-based billing.

2. **AWU credit weights**: Final credit weights per tool category TBD from Pricing Push (target: ~$0.03–$0.05 per credit, basic message = 1 credit, advanced = 1–5 credits).

3. **Sub-agent billing**: Confirmed direction is parent-message-only. Events tagged with `is_sub_agent_message` — Metronome metrics should filter to `is_sub_agent_message=false`. Exact implementation TBD.

4. **Grace period on credit exhaustion**: Hard-block at zero or allow overage? Metronome supports overage billing natively.

5. **Free tier**: Do free workspaces get a Metronome customer? Probably not — gate behind paid subscription.

6. **Enterprise plans**: Custom contracts (no package) or per-enterprise packages? Likely manual contract creation via Metronome UI/API by Ops.

7. **Basic/Advanced daily quotas**: AWU proposes per-seat daily quotas (100 basic/day, 50 advanced/month). Daily quotas need code-side enforcement (Metronome handles monthly credit budgets, not daily rate limits).

## Files Reference

| File | Status | Block |
|------|--------|-------|
| `front/lib/metronome/client.ts` | Created | 0 |
| `front/lib/metronome/events.ts` | Created | 0 |
| `front/lib/api/config.ts` | Modified | 0 |
| `front/lib/plans/usage/mau.ts` | Modified | 0 |
| `front/temporal/usage_queue/activities.ts` | Modified | 0 |
| `front/temporal/usage_queue/workflows.ts` | Modified | 0 |
| `front/temporal/usage_queue/client.ts` | Modified | 0 |
| `front/temporal/usage_queue/worker.ts` | Modified | 0 |
| `front/scripts/provision_metronome_customers.ts` | Created | 0 |
| `front/pages/api/stripe/webhook.ts` | Modified | 0 |
| `front/lib/models/plan.ts` | Modified | 0 |
| `front/types/plan.ts` | Modified | 0 |
| `front/lib/plans/renderers.ts` | Modified | 0 |
| `front/lib/plans/free_plans.ts` | Modified | 0 |
| `front/lib/plans/pro_plans.ts` | Modified | 0 |
| `front/lib/plans/plan_codes.ts` | Modified | 0 |
| `front/docs/metronome-sandbox-setup.sh` | Created | 0 |
| `front/docs/metronome-design-doc.md` | Created | 0 |
| `front/lib/metronome/credit_balance.ts` | To create | 2 |
| `front/pages/api/metronome/webhook.ts` | To create | 2, 5 |
| `front/lib/models/membership.ts` | To modify | 3 |
