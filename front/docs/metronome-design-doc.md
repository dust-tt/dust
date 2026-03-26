# Metronome Billing Integration — Design Doc

## Context

Dust is migrating from Stripe Billing to Metronome to support credit-based pricing. Metronome sits on top of Stripe (payments remain in Stripe). The backend sends granular usage events to Metronome; all pricing logic, rate cards, custom plans, and limits are configured in Metronome by GTM/Ops — not by engineers in the codebase.

**Current state:** Metering infrastructure implemented (events flowing to Metronome). Self-serve subscription flow complete: Stripe Checkout (setup mode) → Metronome customer + contract + seat seeding. Seat sync hooked into membership lifecycle. Sandbox fully configured.

**Target:** Metronome live when the new pricing ships (ETA TBD).

**Current Stripe billing (for reference):**
- Seat reporting (PER_SEAT plans): `stripe.subscriptionItems.update({ quantity })` — triggered by membership changes, rate-limited 1/hour
- MAU reporting (MAU_X enterprise plans): `stripe.subscriptionItems.createUsageRecord()` — triggered by membership changes only (gap: MAU can change without membership changes, fixed by daily cron)
- Credit system: Free → committed → PAYG → excess, consumed in priority order. Only programmatic usage is billed. 30% markup applied in code
- MAU thresholds: `MAU_1`/`MAU_5`/`MAU_10` — minimum messages per month to count as active user (1, 5, or 10). Negotiated per enterprise deal

## Concepts

### Role of each brick

| System | Role |
|--------|------|
| **Dust backend** | Sends usage events (LLM calls, tool invocations, gauges). Manages workspace subscriptions and membership. Enforces real-time usage limits via Redis cache |
| **Metronome** | Aggregates usage into billable metrics. Applies rate cards (pricing, markup, credits). Manages contracts, seat subscriptions, and credit grants. Generates invoices. Sends webhooks for lifecycle events |
| **Stripe** | Payment processor only. Captures payment methods via Checkout. Collects payment on Metronome-generated one-off invoices. No Stripe subscriptions for Metronome-billed workspaces |

### AWU (Agentic Work Units)

A custom non-fiat pricing unit in Metronome (id: `1ad632f0-4e5a-44d6-a1bf-aa6f6bc550d8`). Branded as **"Agentic Work Units" (AWU)** internally.

**Price per credit: $0.01** (list price). Cost allocation: ~$0.009/credit. Gross margin: ~10% per credit. Markup kept low because intelligence is "externalized" commodity value — Dust aims to be mega-competitive on margins here.

LLM and tool usage products are priced in AWU. Seats and other fixed charges remain in USD. The rate card defines `credit_type_conversions` to set the USD value per AWU. Customers see and purchase AWU credits; invoices show USD equivalent.

**No fractional AWU.** Credit consumption is always rounded **up** to the nearest whole AWU. A message costing 0.3 AWU of intelligence + 1 AWU of tools = 2 AWU total (ceil(1.3)).

**Credit composition — Additive model (decided):**

```
total_credits = intelligence_credits + tools_credits
```

- **Intelligence credits**: proportional to LLM token cost. Charged only when `premium_feature_count > 0` OR model is advanced/reasoning. Formula: `ROUND(total_cost_usd / 0.01)`
- **Tools credits**: fixed credit weight per tool action, cumulative across all tools in a message. `SUM(credit_weight_i × action_count_i)`
- **Basic messages = 0 credits** (no premium features, no advanced model → unlimited with a seat)

> **Note:** Additive model was the leaning decision from the Mar 20 session with Gabe/Stan/Pauline/Théo. spolu leaned toward a step/multiplicative model — **final confirmation pending**.

### Seats

Every workspace member gets a **seat** on the Metronome contract. Seats replace MAU-based pricing — no more counting monthly active users for billing. Direction confirmed: **stop MAU billing, move to traditional seats**.

| Seat type | Price (annual) | Price (monthly) | Credits/month | Assignment |
|-----------|---------------|-----------------|---------------|------------|
| **Free** | $0 | $0 | 300 | Auto — new users joining workspace |
| **Pro** | $24/seat | $30/seat | 5,000 | Auto — every paying member |
| **Max** | $100/seat | $125/seat | 20,000 | Explicit — admin-purchased upgrade |

> **Note:** These are the latest calibrated numbers from Mar 27. Earlier proposals had Pro at 200–2,000 credits and Max at 1,000–10,000. Final validation with design partners pending.

All tiers provide access to **all product features** (agent builder, all models, Frames, Deep Research, multi-agent orchestration, Salesforce tools, MCP, code execution). Differentiation is purely in credit volume.

Seats are managed via Metronome's native seat-based subscriptions with `seat_group_key: "user_id"`. Per-seat credits use `INDIVIDUAL` allocation (each user has their own balance). When exhausted, usage falls back to the workspace-level credit pool.

**No viewer seat for self-serve** (decided). Free credit allocation on join covers light users. Viewer/Light seat may be Enterprise-only.

**Programmatic usage stays token-based** (decided) — credits are for interactive/agent usage only.

### Plan restructuring (decided)

| Change | Detail |
|--------|--------|
| "Pro" plan → **"Business" plan** | Gains SSO, EU hosting, Salesforce (previously Enterprise-gated) |
| Feature gating removed | All product features accessible from Free plan |
| Differentiation = volume | Connectors (1/20/unlimited), spaces (1/10/unlimited), credits |
| Enterprise-only features | SCIM, audit logs, advanced analytics, custom data retention, remote MCP, priority support, CSM |

### MAU (Monthly Active Users)

Gauge metrics emitted daily. Not used for billing in Metronome plans — seat-based subscriptions replace MAU-based pricing. Kept for legacy enterprise contracts and observability.

Three gauges with different activity thresholds:

| Gauge | Threshold | Use case |
|-------|-----------|----------|
| `mau_1` | 1+ message in rolling 30 days | Default MAU count |
| `mau_5` | 5+ messages in rolling 30 days | Enterprise contracts (MAU_5 threshold) |
| `mau_10` | 10+ messages in rolling 30 days | Enterprise contracts (MAU_10 threshold) |

### AWU classification: basic vs advanced

Every message is classified as **basic** or **advanced** based on models and tools used:

- **Basic** (0 credits): Standard models (Claude Sonnet, GPT-5 Mini, Gemini Flash, Mistral, DeepSeek), no premium tool features. Unlimited with any seat
- **Advanced** (1+ credits): Frontier/reasoning models (Claude Opus, GPT-5, o1/o3/o4, Gemini Pro), OR premium tools (deep research, generation, multi-agent orchestration)

Sent as `message_tier` on all events. Sub-agent messages tagged `is_sub_agent_message: "true"` — metered at parent level only.

## Architecture

### Overview

```
  ┌────────────────────────────────────────────────────────┐
  │                     Dust Backend                       │
  │                                                        │
  │  Agent loop ──▶ usage_queue activity ──▶ Metronome     │
  │  (LLM calls,    (Temporal workflow)      ingest API    │
  │   tool calls)                                          │
  │                                                        │
  │  Membership ──▶ seats.ts ──▶ Metronome contracts/edit  │
  │  (create/revoke)  (fire-and-forget)                    │
  │                                                        │
  │  Daily cron ──▶ registered_users gauge ──▶ Metronome   │
  │                  mau gauges (×3)           ingest API   │
  │                                                        │
  │  Metronome webhook ──▶ Redis cache (credit balance)    │
  │                    ──▶ DB (sync credit grants)         │
  └────────────────────────────────────────────────────────┘
                          │                    ▲
                usage events              webhooks
                seat edits           (alerts, credits,
                          │            contracts)
                          ▼                    │
                   ┌─────────────┐
                   │  Metronome  │
                   │             │
                   │  Metrics    │──▶ One-off Stripe invoices
                   │  Rate Cards │
                   │  Contracts  │
                   │  Packages   │
                   │  Credits    │
                   └──────┬──────┘
                          │ invoices
                          ▼
                   ┌─────────────┐
                   │   Stripe    │
                   │  (payments  │
                   │    only)    │
                   └─────────────┘
```

### Concept mapping: Dust ↔ Metronome

| Dust concept | Metronome concept | Relationship |
|---|---|---|
| Plan (e.g., Business Plan) | Package | 1:1 via `metronomePackageAlias` |
| Workspace | Customer | 1:1 — `metronomeCustomerId` on `WorkspaceModel`, workspace `sId` as ingest alias |
| Subscription | Contract | 1:1 — contract created from package on subscribe |
| Membership | Seat | 1:1 — each member gets a seat on the contract |
| Agent message (LLM call) | `llm_usage` event | 1:N — one event per model call within a message |
| Agent message (tool call) | `tool_use` event | 1:N — one event per MCP action |
| Programmatic credit (free) | Recurring credit | **Legacy plans only** — bracket formula based on `registered_users`. New plans use per-seat allocation instead |
| Programmatic credit (committed) | Commit (PREPAID) | Workspace pool (purchased credits) |
| Programmatic credit (PAYG) | Commit (POSTPAID) | Workspace pool (overage) |

### Event types

| Event | Trigger | Frequency |
|-------|---------|-----------|
| `llm_usage` | Every LLM model call in an agent message | Per model call |
| `tool_use` | Every MCP action in an agent message | Per tool invocation |
| `registered_users` | Daily Temporal cron | Once/day/workspace |
| `mau_1` / `mau_5` / `mau_10` | Daily Temporal cron | Once/day/workspace each |

### Seats and auto-assigned credits

When a workspace subscribes:
1. Contract created from package → seat subscriptions (Pro, Max) provisioned automatically
2. All existing members bulk-assigned as Pro seats
3. Each seat gets its monthly credit allocation (5,000 or 20,000 AWU) via `INDIVIDUAL` recurring credits in the package

On membership changes:
- **Member joins** → `addMetronomeProSeat` (fire-and-forget from `createMembership`)
- **Member leaves** → `removeMetronomeSeat` (fire-and-forget from `revokeMembership`)
- **Seat type change** → `changeMetronomeSeatType` (remove from old subscription + add to new)

Seat product IDs are resolved dynamically from Metronome's products API by name ("Pro Seat", "Max Seat") — no hardcoded IDs.

## LLM and Tool Usage

### Pricing logic

Two options for where LLM cost → AWU conversion happens. **This is a one-way choice** — the two options produce different billing amounts, and switching after launch changes customer bills.

**Option A: Cost computed in code, AWU rounded per message**

Code computes `cost_micro_usd` per LLM call (`token_pricing.ts`), converts to AWU (`ceil(cost_usd / 0.01)`), and sends the rounded integer `awu_credits` as an event property. Metronome SUMs pre-rounded values. Tool credits are already integers (credit weights × invocation count).

| Concern | Where it lives | Changed by |
|---------|---------------|------------|
| Per-model token rates (provider cost) | `token_pricing.ts` (code) | Engineers |
| AWU rounding | Code (`ceil()` per message) | Engineers |
| Intelligence markup (0–10%) | Rate card in Metronome | GTM/Ops |
| Per-tool-category credit weights | Rate card in Metronome | GTM/Ops |
| Per-seat pricing | Rate card in Metronome | GTM/Ops |
| Custom enterprise discounts | Contract overrides in Metronome | Sales/Ops |

Pros: per-message granularity, every message costs at least 1 AWU (when non-free), predictable for users.
Cons: per-model pricing changes require code deploys; GTM/Ops cannot change token rates independently.

**Option B: Token pricing in Metronome, AWU rounded per billing period**

Code sends raw token counts (`prompt_tokens`, `completion_tokens`, `cached_tokens`, `cache_creation_tokens`) + `model_id` per LLM call. Metronome applies per-model per-token prices via dimensional pricing, converts to AWU, and rounds at the billing period level using `quantity_conversion.rounding_behavior: "ceiling"`.

| Concern | Where it lives | Changed by |
|---------|---------------|------------|
| Per-model token rates | Rate card in Metronome (dimensional pricing by `model_id`) | GTM/Ops |
| AWU rounding | Metronome (`ceiling` per billing period) | Metronome config |
| Intelligence markup (0–10%) | Rate card in Metronome | GTM/Ops |
| Per-tool-category credit weights | Rate card in Metronome | GTM/Ops |
| Per-seat pricing | Rate card in Metronome | GTM/Ops |
| Custom enterprise discounts | Contract overrides in Metronome | Sales/Ops |

Pros: all pricing in Metronome, GTM/Ops can change per-model prices without code deploys, per-model overrides in enterprise contracts.
Cons: rounding is per-period not per-message (10 × 0.3 AWU = 3 AWU, not 10); requires maintaining ~60 model entries in Metronome rate card; new models need a rate card entry or usage won't be billed.

> **OPEN — needs decision.** These two options are **not equivalent** and cannot be switched after launch without changing billing behavior. Per-message rounding (A) systematically charges more than per-period rounding (B) for users with many small messages. The choice also determines where per-model pricing lives (code vs Metronome) and who can change it (engineers vs GTM/Ops). All events already include both `cost_micro_usd` and raw token counts, so both options are technically ready.

### AWU credit weights per tool category

Configured in the rate card. Working values (calibration in progress):

| Tool Category | Credits | Status | Examples |
|---|---|---|---|
| Retrieval (RAG, MCP read, table query) | **1** | Proposal | search, include_data, extract_data |
| Web search | **0** | Proposal | web_search_&_browse ("paying for web search is an anti-pattern") |
| Write actions (MCP write) | **2** | Proposal | connector write-backs |
| Visuals (Frames, data query) | **2** | Proposal | table query visualizations |
| Create Frame | **5** | Proposal | new Frame creation |
| Edit Frame | **2** | Proposal | Frame modification |
| Orchestrator (run_agent) | **5** | Proposal | run_agent, agent_router |
| Unsupervised actions (triggers, evals) | **2** | Proposal | scheduled triggers |
| Platform utilities | **0** | Proposal | extract_data, common_utilities |

> **Note:** Exact credit weights per tool are **not finalized** — calibration with analytics pending. Current values are from the Metabase simulator dashboard. Key open question: whether to use cumulative credits (sum of all tools) or costliest-tool-wins per message.

### Programmatic vs user usage

All metrics split into programmatic and user variants via `is_programmatic_usage` property:
- **Programmatic** (`is_programmatic_usage=true`): API key usage, no `user_id`. Stays token-based billing (decided). Currently billed with 30% markup
- **User** (`is_programmatic_usage=false`): Web/Slack/extension usage, has `user_id`. Billed via credit system when new pricing ships

The `origin` property (`web`, `slack`, `api`, `zapier`, etc.) is also available for filtering if needed.

### `llm_usage` event properties

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

### `tool_use` event properties

| Property | Type | Description |
|----------|------|-------------|
| `workspace_id` | string | Workspace sId |
| `user_id` | string (optional) | User sId, null for programmatic |
| `agent_message_id` | string | Agent message sId |
| `tool_name` | string | e.g., `websearch`, `search` |
| `internal_mcp_server_name` | string | e.g., `web_search_&_browse`, empty for external |
| `mcp_server_id` | string | Server sId |
| `tool_category` | string | Pricing tier (retrieval, deep_research, connectors, generation, agents, actions, platform, reasoning) |
| `status` | string | `succeeded`, `errored`, `denied`, etc. |
| `execution_duration_ms` | number | Wall-clock execution time |
| `is_programmatic_usage` | string | `"true"` or `"false"` |
| `message_tier` | string | `"basic"` or `"advanced"` |
| `is_sub_agent_message` | string | `"true"` if spawned by another agent |
| `origin` | string | e.g., `web`, `slack`, `api` |

### Idempotent retryability

Every event carries a deterministic `transaction_id` derived from business identifiers — **not** random UUIDs. Metronome deduplicates events with the same `transaction_id`.

| Event type | `transaction_id` pattern | Uniqueness guarantee |
|---|---|---|
| `llm_usage` | `llm-{workspaceSId}-{agentMessageSId}-{modelId}-{index}` | Unique per model call within a message |
| `tool_use` | `tool-{workspaceSId}-{actionSId}` | Unique per MCP action (action sId is globally unique) |
| `registered_users` | `registered_users-{workspaceSId}-{YYYY-MM-DD}` | One per workspace per day |
| `mau_N` | `mau_N-{workspaceSId}-{YYYY-MM-DD}` | One per threshold per workspace per day |

**Retry semantics:**
- `ingestMetronomeEvents` is fire-and-forget — logs warnings but does not throw
- Temporal activities can be safely retried — same deterministic `transaction_id` on replay, Metronome deduplicates
- Gauge crons re-running same day → same `dateKey` → same `transaction_id` → idempotent

**Extended downtime backfill:** Events emitted during outage are lost (fire-and-forget). To backfill, replay Temporal activities for the affected period — deterministic `transaction_id` ensures no double-counting.

### Metronome billable metrics

Metrics are **shared across all plans** — the same events feed both legacy and new pricing. What differs is which metrics each rate card uses.

| Billable Metric | Aggregation | Filter | Used by |
|--------|-------------|--------|---------|
| LLM Provider Cost (Programmatic) | SUM on `cost_micro_usd` | `is_programmatic_usage=true` | Legacy + New |
| LLM Provider Cost (User) | SUM on `cost_micro_usd` | `is_programmatic_usage=false` | New pricing only |
| Tool Invocations (Programmatic) | COUNT (succeeded only) | grouped by `tool_category` | Legacy (0-priced) + New |
| Tool Invocations (User) | COUNT (succeeded only) | grouped by `tool_category` | New pricing only |
| Registered Users | MAX on `member_count` | — | Legacy only (drives bracket-based free credit commit) |
| MAU_1 | MAX on `mau_count` (1+ msg threshold) | — | Legacy enterprise (MAU_1 plans) |
| MAU_5 | MAX on `mau_count` (5+ msg threshold) | — | Legacy enterprise (MAU_5 plans) |
| MAU_10 | MAX on `mau_count` (10+ msg threshold) | — | Legacy enterprise (MAU_10 plans) |

### Metronome products

#### Shared products (used by both legacy and new pricing)

| Product | Type | Pricing Key | Notes |
|---------|------|-------------|-------|
| AI Usage (Programmatic) | USAGE | — | quantity_conversion ÷1M (micro-USD → dollars). Priced in USD on legacy, AWU on new |
| Tool Usage (Programmatic) | USAGE | `tool_category` | Dimensional pricing by category. 0-priced on legacy, AWU weights on new |

#### Legacy-only products

| Product | Type | Pricing Key | Notes |
|---------|------|-------------|-------|
| Legacy Seat ($29) | SUBSCRIPTION | — | $29/mo flat. Maps to current Pro plan |
| Legacy Seat ($39) | SUBSCRIPTION | — | $39/mo flat. Maps to current Business/SSO plan |
| Legacy Enterprise Seat | SUBSCRIPTION | — | $45/mo flat (negotiable) |
| MAU Reporting | USAGE | — | For MAU-based enterprise contracts only |

#### New pricing products

| Product | Type | Pricing Key | Notes |
|---------|------|-------------|-------|
| Pro Seat | SUBSCRIPTION | — | $24/yr ($30/mo) + 5,000 AWU/month |
| Max Seat | SUBSCRIPTION | — | $100/yr ($125/mo) + 20,000 AWU/month |
| AI Usage (User) | USAGE | — | quantity_conversion ÷1M. Priced in AWU |
| Tool Usage (User) | USAGE | `tool_category` | Dimensional pricing in AWU by AWU weights |

### Rate cards

#### Legacy rate cards (grandfathered plans, Stripe-equivalent pricing on Metronome)

**Legacy Pro Rate Card** (`legacy-pro-29`):

| Product | Price | Notes |
|---------|-------|-------|
| Legacy Seat ($29) | $29/mo (2900 cents) | FLAT + MONTHLY |
| AI Usage (Programmatic) | $1.30 per $1 cost | 30% markup on provider cost, in USD |
| Tool Usage (Programmatic) | $0 per category | Not billed on legacy |

**Legacy Business Rate Card** (`legacy-business-39`):

| Product | Price | Notes |
|---------|-------|-------|
| Legacy Seat ($39) | $39/mo (3900 cents) | FLAT + MONTHLY, includes SSO |
| AI Usage (Programmatic) | $1.30 per $1 cost | 30% markup on provider cost, in USD |
| Tool Usage (Programmatic) | $0 per category | Not billed on legacy |

**Legacy Enterprise Rate Card** (per-customer, manually configured):

| Product | Price | Notes |
|---------|-------|-------|
| Legacy Enterprise Seat | $45/mo (negotiable) | FLAT + MONTHLY |
| MAU Reporting | $45/MAU/mo (negotiable) | For MAU-based contracts only |
| AI Usage (Programmatic) | $1.30 per $1 cost (negotiable) | Markup varies per deal |
| Tool Usage (Programmatic) | $0 per category | Not billed on legacy |

> **Note:** Legacy rate cards replicate current Stripe billing exactly. The `registered_users` metric drives a bracket-based free credit commit on legacy plans (1–10 users → $5/user, 11–50 → $2/user, 51–100 → $1/user) via `syncMetronomeCreditGrantToDb`.

#### New pricing rate card (credit-based)

**Business Plan Rate Card** (`business-plan`):

| Product | Price | Notes |
|---------|-------|-------|
| Pro Seat | $24/yr ($30/mo) | FLAT + MONTHLY, includes 5,000 AWU/month (INDIVIDUAL) |
| Max Seat | $100/yr ($125/mo) | FLAT + MONTHLY, includes 20,000 AWU/month (INDIVIDUAL) |
| AI Usage (Programmatic) | ~1 AWU per $0.01 cost (0–10% markup) | Provider cost → AWU conversion |
| AI Usage (User) | ~1 AWU per $0.01 cost (0–10% markup) | Same formula as programmatic |
| Tool Usage (Programmatic) | Per category in AWU | AWU weights (see tool credit weights table) |
| Tool Usage (User) | Per category in AWU | AWU weights (see tool credit weights table) |

> **Note:** Exact intelligence markup (0–10% range) not yet decided. Tool credit weights still being calibrated.

### Contracts (packages)

#### Legacy contracts (grandfathered)

Each legacy contract matches an existing Stripe plan 1:1. Created during migration Phase 4 when workspaces move from Stripe to Metronome.

| Package | Maps to | Rate card | Seat type | Credit model |
|---------|---------|-----------|-----------|--------------|
| `legacy-pro-29` | Pro $29/mo | Legacy Pro | Legacy Seat ($29) | Free credits via `registered_users` bracket formula |
| `legacy-business-39` | Business $39/mo | Legacy Business | Legacy Seat ($39) | Free credits via `registered_users` bracket formula |
| `legacy-enterprise-mau` | Enterprise (MAU) | Legacy Enterprise | MAU Reporting | Custom per deal |
| `legacy-enterprise-seat` | Enterprise (seat) | Legacy Enterprise | Legacy Enterprise Seat | Custom per deal |

#### New pricing contracts

| Package | Target | Rate card | Seat types | Credit model |
|---------|--------|-----------|------------|--------------|
| `business-plan` | New Business signups | Business Plan | Pro ($24/yr) + Max ($100/yr) | 5,000/20,000 per-seat INDIVIDUAL + workspace pool |
| `enterprise-plan` | New Enterprise deals | Custom per deal | Custom seat types | Pooled workspace credits (negotiable) |

> **Note:** Enterprise contract structure (seats+caps vs. platform fee + pools) not yet decided. Enterprise contracts likely created manually via Metronome UI/API by Ops, not via packages.

## Seats Management

Seats replace MAU-based pricing. Every workspace member gets a seat automatically.

**Seat lifecycle:**

| Event | Action |
|-------|--------|
| Workspace subscribes | All existing members get Pro seats automatically |
| New member joins | Auto-assign Pro seat (`addMetronomeProSeat`, fire-and-forget) |
| Member removed | Remove seat (`removeMetronomeSeat`, fire-and-forget) |
| Admin upgrades to Max | Remove from Pro subscription + add to Max subscription |
| Admin downgrades to Pro | Remove from Max subscription + add to Pro subscription |

**Data model (pending):** `seatType` column on membership model (default `"pro"`). Admin endpoint `PATCH /api/w/[wId]/members/[userId]/seat-type` for upgrade/downgrade.

**Metronome-side:** Seat subscriptions configured in the package with `seat_group_key: "user_id"`, `is_prorated: true`, `collection_schedule: ADVANCE`. Metronome handles proration when seats are added/removed mid-cycle.

**Enterprise seats (open):** Two options on the table:
1. Seat-based with credit caps and negotiable allocation (e.g., "Heavy" = 200 advanced/month, "Light" = 10)
2. Platform access fee + credit pools that admins allocate per user

Enterprise credits would be **pooled** at workspace level (vs. per-user on Business).

> **Note:** Enterprise seat structure not yet decided. Metronome does not natively support seat-based tiered pricing (0–30 seats one price, 30–60 another) — Dust must own this logic until Metronome builds it. Logged as product request.

## Credit Pool

### Credit types and consumption order

| Credit Type | Metronome Concept | Priority | Scope | Description |
|-------------|-------------------|----------|-------|-------------|
| **Free (seat allocation)** | Credits (recurring) | 1 (consumed first) | Per-user cap | 5,000/month (Pro) or 20,000/month (Max). Hard-capped per user — a Pro user can't exceed 5,000 even if other users haven't touched theirs |
| **Committed (purchased pool)** | Commits (PREPAID) | 2 | Workspace-wide | Admin-purchased credits shared across all members. Fallback when individual allocation exhausted |
| **PAYG (overage)** | Commits (POSTPAID) | 3 | Workspace-wide | Pay-as-you-go overage if enabled |

**Consumption flow:** User burns through their individual seat allocation first → falls back to workspace purchased pool → hits overage (if enabled) or gets blocked.

Programmatic usage (no `user_id`) draws directly from the workspace pool (committed/PAYG), not from any individual seat allocation.

### Seat credit allocation

Credits are granted per-seat automatically each billing cycle via Metronome's recurring credit mechanism in the package:
- **Pro seat**: 5,000 AWU/month
- **Max seat**: 20,000 AWU/month

Per-seat, `INDIVIDUAL` allocation — each user has their own cap. Synced to Dust DB via `syncMetronomeCreditGrantToDb` on webhook.

### Purchased credits

Admins can buy additional credits that go into the shared workspace pool. Available for any member who has exhausted their individual allocation, or for programmatic usage.

### Queryable balances

- Per-seat balance: via Metronome `/contracts/seatBalances/list`
- Workspace pool balance: via Metronome credit balance APIs

### Overage pricing

Per-credit at list price ($0.01). Enterprise: negotiable volume discount (e.g., $0.0075 at $500K ACV).

> **Note:** Overage gross margin not yet defined. spolu requested simulation with 25% usage decrease for bucket 3, 50% for overaging users.

## User Limit Handling

**Two-level credit check:** Enforcement needs to account for both per-user seat allocation and workspace pool:

1. Metronome sends webhooks when balances change:
   - `alerts.low_remaining_seat_balance_reached` → per-user seat allocation exhausted
   - `alerts.low_remaining_credit_balance_reached` → workspace pool exhausted
2. Dust backend maintains **two Redis caches** (TTL ~60s):
   - Per-user seat credit balance: `hasUserSeatCredits(workspaceSId, userSId)`
   - Workspace pool balance: `hasWorkspacePoolCredits(workspaceSId)`
3. Pre-flight check in agent loop:
   ```
   if isMetronomeBilled(plan):
     if not hasUserSeatCredits(workspace.sId, user.sId)
        and not hasWorkspacePoolCredits(workspace.sId):
       block message with "out of credits" error
   ```
   A user with exhausted seat credits can still send messages if the workspace pool has balance.
4. When credits are replenished (new billing period, credit purchase), `commit.segment.start` / `credit.create` webhook updates both caches.

**UX thresholds:** Warn at **80%** of individual seat allocation, hard-block when both individual and workspace pool at **0%**.

**Long-running agent loops:** An agent may start with credits available but exhaust them mid-run. Current approach: allow the run to complete (post-hoc billing), block only new messages. Metronome supports overage billing natively.

> **Note:** Grace period on credit exhaustion (hard-block vs. 24h grace vs. $X overage cap) is an open product decision.

**Metronome webhook events:**

| Event | Action |
|-------|--------|
| `alerts.low_remaining_credit_balance_reached` | Update Redis: credits exhausted |
| `alerts.low_remaining_seat_balance_reached` | Update Redis: per-seat credits exhausted |
| `alerts.spend_threshold_reached` | Update Redis: approaching limit |
| `commit.segment.start` | Sync credit grant to DB; update Redis: credits available |
| `credit.create` | Sync credit grant to DB; update Redis: credits available |
| `contract.start` | Activate Metronome billing for workspace |
| `contract.end` | Downgrade workspace, schedule scrub |
| `invoice.finalized` | Log/record invoice |
| `invoice.billing_provider_error` | Alert on-call |

## UI Changes

### Onboarding / Subscribe page

`SubscribePage` shows a "Subscribe (usage-based)" card alongside existing per-seat billing options. Depending on the plan type selected:

- **Existing plans (Stripe):** Redirect to Stripe Checkout with recurring subscription
- **Metronome plan:** Redirect to Stripe Checkout in **setup mode** (payment method capture only, no recurring subscription). On success, `PaymentProcessingPage` calls `metronome-finalize` to provision Metronome customer + contract + seats

### Manage Subscription page

`SubscriptionPage` detects `metronomePackageAlias` and conditionally renders:

- **Stripe-billed:** Stripe portal links, pricing table, billing period toggle
- **Metronome-billed:** `MetronomeSubscriptionSection` showing:
  - Pro/Max seat counts and monthly cost estimate
  - Seat type management (upgrade/downgrade Pro ↔ Max)
  - Cancel subscription button (ends Metronome contract)

### Credits page

Currently shows programmatic credits only. To be extended to show:
- Per-seat credit balance (via Metronome `/contracts/seatBalances/list`)
- Workspace credit pool balance
- Credit purchase option (committed credits)
- Credit purchase history

> **Note:** Post-launch operational burden expected to be high (~1h/day support questions per Pigment's experience). Plan for admin observability dashboard (workspace + user-level usage tracking, forecasting, agent ROI) requested by sales.

### Usage graphs

Currently: programmatic usage graph only. To be refactored:
- Replace internal usage tracking with Metronome API-backed data
- Extend to all usage (not just programmatic) — per-user, per-model, per-tool breakdowns
- Leverage Metronome's `/usage` APIs for consistent billing-grade data
- Show credit estimate during deep-dive planning phase before execution (proposed UX)

## Implementation / Code Pointers

### Event emission

Usage events are sent via Temporal workflows:
- `front/temporal/usage_queue/activities.ts` — `recordUsageActivity` emits `llm_usage` + `tool_use` events per agent message; `emitMetronomeGaugeEventsForAllWorkspacesActivity` emits daily `registered_users` + `mau` gauges for all workspaces
- Events are built by `front/lib/metronome/events.ts` and ingested via `front/lib/metronome/client.ts` → `ingestMetronomeEvents`
- Only **parent messages** sent to Metronome, **not child/sub-agent messages** (~2% of messages are orchestrator type)

### Seat sync

Hooked directly into `front/lib/resources/membership_resource.ts`:
- `createMembership` → `addMetronomeProSeat` (fire-and-forget)
- `revokeMembership` → `removeMetronomeSeat` (fire-and-forget)

Seat functions in `front/lib/metronome/seats.ts` resolve product IDs dynamically from Metronome API by product name.

### Subscription flow

- Self-serve: `PATCH /api/w/[wId]/subscriptions` (`subscribe_metronome`) → Stripe setup checkout → `POST /api/w/[wId]/subscriptions/metronome-finalize`
- Poke upgrade: `front/pages/api/poke/workspaces/[wId]/upgrade.ts`
- Contract management: `front/pages/api/w/[wId]/metronome/contract.ts`

### Limit handling

- Webhook endpoint (to create): `front/pages/api/metronome/webhook.ts`
- Redis cache for credit balance (to create): `front/lib/metronome/credit_balance.ts`
- Pre-flight credit check: to be added in agent loop entry point
- Consideration: long-running agent loops may start with credits and exhaust them mid-run — allow completion, block new messages only

### Credit sync

`front/lib/credits/free.ts` → `syncMetronomeCreditGrantToDb`: called from Metronome webhook when a credit grant is applied. Takes the Metronome grant ID, amount, and dates; creates a `CreditResource` in the DB keyed by grant ID for idempotency. **Used for legacy plans only** (bracket formula based on `registered_users` gauge). New plans use per-seat credit allocation managed entirely in Metronome.

### Plan-based gating

```typescript
function isMetronomeBilled(plan: PlanType): boolean {
  return plan.metronomePackageAlias != null;
}
```

`metronomePackageAlias` on `PlanModel`: `null` → Stripe billing, `"business-plan"` → Metronome billing. Each Dust plan maps 1:1 to a Metronome package.

### Metronome limitations

Three features **not natively supported** (logged as product requests):
1. **Seat-based tiered pricing** (0–30 seats one price, 30–60 another) — Dust must own this logic
2. **Payment-gated commitments for bank transfers** — only credit cards/ACH for initial charges
3. **Daily credit allowances/tiering** — possible but not ergonomic

## Metronome Objects Deployment

### Sandbox setup

Full configuration script: `front/docs/metronome-sandbox-setup.sh`. Creates all metrics, products, rate cards, and packages via Metronome API.

See "Metronome billable metrics", "Metronome products", "Rate cards", and "Contracts" sections above for the full object definitions.

### Deployment approach

Currently deployed via setup script (`metronome-sandbox-setup.sh`). Consider Terraforming Metronome objects for production:
- Metrics, products, rate card definitions as code
- Package configurations versioned alongside plan changes
- Environment-specific configs (sandbox vs production IDs)
- Legacy and new pricing packages deployed in parallel

## Migration

### Two-step approach (decided)

1. **Billing platform migration first:** Grandfather all existing clients on identical pricing via Metronome. No pricing changes
2. **Release new pricing:** Once Metronome is stable, ship new credit-based plans. New rate cards for new signups first, then existing customers

### Contract strategy

See "Contracts (packages)" section above for the full legacy and new pricing package definitions.

- **Phase 4 (migration):** Each existing Stripe plan gets a matching legacy Metronome package. Workspaces migrated 1:1 with identical pricing
- **Phase 5 (new pricing):** New signups get `business-plan` package with AWU credit pricing. Existing workspaces can be migrated by switching `metronomePackageAlias` from legacy to new package

### Phased rollout (decided)

| Phase | Duration | Scope |
|-------|----------|-------|
| **1. Shadow mode** | Active now | All workspaces emit events to Metronome; billing 100% on Stripe |
| **2. Internal dogfood** | ~1 week | Enable on Dust's own workspace(s); validate invoices, credits, seat reporting |
| **3. Controlled rollout** | ~1–2 weeks | 5–10 friendly/pilot workspaces (Pro + Enterprise mix) |
| **4. Full migration** | ~2–3 weeks | Progressive batches: 10% → 25% → 50% → 100% at billing cycle boundaries |
| **5. New pricing** | Post-migration | New rate cards for new signups, then existing customers |
| **6. Cleanup** | TBD | Remove old Stripe billing code, conditional checks, old plan definitions |

### Credit migration rules

- Migrate remaining balance only (not full amount)
- Preserve expiration dates and priority order (free → committed → PAYG)
- Freeze internal credits after migration to avoid double-consumption

### Existing programmatic usage

Current programmatic credits continue for Stripe-billed workspaces. For Metronome-billed workspaces:
- `reportUsageForSubscriptionItems` (Stripe MAU/seat reporting): skip
- `trackProgrammaticCost` (internal credit consumption): skip — Metronome tracks credits
- Free credit grants: replaced by per-seat allocation (5,000 Pro / 20,000 Max). Legacy `registered_users`-based bracket formula kept only for grandfathered plans via `syncMetronomeCreditGrantToDb`
- Usage graphs: refactor from internal tracking to Metronome API-backed data

## Open Questions

### Critical (blocking)

| # | Question | Status |
|---|----------|--------|
| 1 | **Exact credit weights per tool category** | Not finalized — calibration with analytics pending |
| 2 | **Exact intelligence markup** (0–10% range decided, exact value TBD) | Founders to decide |
| 3 | **Cumulative vs costliest-tool-wins** for multi-tool messages | Théo leans cumulative; earlier doc says costliest. Needs reconciliation |
| 4 | **Enterprise seat structure**: seats+caps vs. platform fee + pools | Two options on table |
| 5 | **Overage credit gross margin** | Requested by spolu; unanswered |
| 6 | **Additive vs step/multiplicative model final confirmation** | Additive = leaning decision; spolu may prefer step-based |

### Important (in progress)

| # | Question | Leaning |
|---|----------|---------|
| 7 | Stop MAU billing → traditional seats? | **Yes** — confirm with AEs |
| 8 | Viewer seat for Business plan? | **No** — free credits on join covers light use |
| 9 | Grace period on credit exhaustion? | Undecided (hard-block vs. overage) |
| 10 | RAG pricing at 1 credit — too much? (50% of tool credit consumption) | Flagged, needs calibration |
| 11 | Should all actions be priced? (spolu objects to pricing "edit frame") | Under debate |
| 12 | Free tier: Metronome customer for free workspaces? | Probably not |
| 13 | Enterprise: credits or direct USD? (ElevenLabs abandoned credits for enterprise) | Open |
| 14 | Business plan seat cap at 100–150? | Sales suggestion, unconfirmed |
| 15 | FX ($/€) impact on per-credit pricing | Flagged, not analyzed |

### Validation (pending)

- Design partner interviews (Laurel, Vanta, Alan, Holy, Back Market) — not yet booked
- Before/after pricing impact for US customers (Persona, Whatnot, Watershed) — pending analytics
- Rollback plan from Metronome mid-billing-cycle — not yet defined
