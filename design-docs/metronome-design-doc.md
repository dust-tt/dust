# Enable credit-based pricing - Stripe to Metronome migration

Created by: Thomas Draier
Tags: DesignDoc, Engineering, Product
Created time: March 20, 2026 3:52 PM
Status: In ideation

# 📋 Context

Dust is migrating from Stripe Billing to Metronome to support credit-based pricing. Metronome sits on top of Stripe (payments remain in Stripe). The backend sends granular usage events to Metronome; all pricing logic, rate cards, custom plans, and limits are configured in Metronome by GTM/Ops — not by engineers in the codebase.

<aside>
🎯 **Why now:** The "Pricing Push" initiative is designing a hybrid credit-based pricing model. The new model requires per-model, per-tool, per-seat-type metering that would be prohibitively expensive to build on Stripe Billing alone. Metronome commitment is signed ($40k). Metering infrastructure is already shipping events.

</aside>

<aside>
🚀 **Strategic bet:** Anthropic, OpenAI, Cursor, and Databricks all use Metronome for exactly this reason. Migrating now unblocks Dust as a company-wide platform with flexible, usage-aligned pricing.

</aside>

## Current State

### Billing Infrastructure

| Component | Today |
| --- | --- |
| **Subscription management** | Stripe subscriptions (front/lib/plans/stripe.ts) |
| **Plan definitions** | Base plans in plan_codes.ts, pro_plans.ts, free_plans.ts, custom plans in DB |
| **Usage reporting** | Per-seat quantity updates or MAU metered billing via Stripe API |
| **Webhook handler** | front/pages/api/stripe/webhook.ts (checkout, invoices, subscription lifecycle) |
| **Programmatic credits** | Dust-internal credit system (free + purchased + PAYG), consumed in trackProgrammaticCost() |
| **Temporal workflows** | updateWorkspaceUsageWorkflow (1h debounce) and trackProgrammaticUsageWorkflow |

### **Stripe billing**

- Seat reporting (PER_SEAT plans): `stripe.subscriptionItems.update({ quantity })` — triggered by membership changes, rate-limited 1/hour
- MAU reporting (MAU_X enterprise plans): `stripe.subscriptionItems.createUsageRecord()` — triggered by membership changes only and daily cron
- Credit system: Free → committed → PAYG → excess, consumed in priority order. Only programmatic usage is billed. 30% markup applied in code
- MAU thresholds: `MAU_1`/`MAU_5`/`MAU_10` — minimum messages per month to count as active user (1, 5, or 10). Negotiated per enterprise deal

### Current Plans

| Plan | Price | Billing model |
| --- | --- | --- |
| Free (phone trial) | $0 | 100 msgs lifetime, 14 days |
| Pro | $29/seat/month | Per-seat (Stripe quantity) |
| Pro Business | $39/seat/month | Per-seat + SSO |
| Enterprise (MAU) | $45/MAU/month | Metered usage (Stripe createUsageRecord) |
| Enterprise (seat) | $45/seat/month | Per-seat (hidden, via Poke) |
| Enterprise custom plans  | Custom | Defined in stripe subscription |

# 💡 Concepts

## Role of each brick

| System | Role |
| --- | --- |
| **Dust backend** | Sends usage events (LLM calls, tool invocations, gauges). Manages workspace subscriptions and membership. Enforces real-time usage limits via Redis cache |
| **Metronome** | Aggregates usage into billable metrics. Applies rate cards (pricing, markup, credits). Manages contracts, seat subscriptions, and credit grants. Generates invoices. Sends webhooks for lifecycle events |
| **Stripe** | Payment processor only. Captures payment methods via Checkout. Collects payment on Metronome-generated one-off invoices. No Stripe subscriptions for Metronome-billed workspaces |

## AWU (Agentic Work Units)

A custom non-fiat pricing unit in Metronome, branded as **“Agentic Work Units” (AWU)** internally.

**1 AWU = $0.01** (list price). Gross margin ~10% per AWU. Markup kept low because intelligence is “externalized” commodity value — Dust aims to be mega-competitive on margins here.

LLM and tool usage products are priced in AWU. Seats and other fixed charges remain in USD. The rate card defines `credit_type_conversions` to set the USD value per AWU. Customers see and purchase AWU credits; invoices show USD equivalent.

**AWU is indivisible — no fractional AWU.** Credit consumption is always rounded **up** to the nearest whole AWU. A message costing 0.3 AWU of intelligence + 1 AWU of tools = 2 AWU total (ceil(1.3)).

> **Important shift from PPUL (Programmatic Usage).** The previous programmatic billing tracked usage in micro-dollars ($0.000001 precision) — extremely fine-grained, no meaningful rounding loss. AWU at $0.01 is 10,000× coarser. Basic messages (no premium features, no advanced model) remain **0 AWU** — free and unlimited. But any non-basic message costs at minimum 1 AWU ($0.01) due to rounding up. This means small advanced messages (e.g., a simple RAG query costing $0.002 in provider cost) are billed at the 1 AWU floor rather than their actual cost. This is acceptable given that ~85% of messages cost >$0.01 and tool credit weights (integers) dominate the AWU calculation.
> 

**Credit composition — Additive model (leaning, not confirmed):**

```
total_credits = intelligence_credits + tools_credits
```

- **Intelligence credits**: proportional to LLM token cost. Charged only when premium features are used OR model is advanced/reasoning.
- **Tools credits**: fixed credit weight per tool action. `SUM(credit_weight_i × action_count_i)`. **Unresolved:** Théo leans cumulative (sum all tools); earlier Notion doc says costliest-tool-wins (only the most expensive category applies). These produce different bills for multi-tool messages.
- **Basic messages = 0 credits** (no premium features, no advanced model → unlimited with a seat)

> **Not fully confirmed.** "Basic = 0 credits" is a working assumption, not a locked decision. Théo (Mar 9): *"a seat gives you unlimited basic messages"*, but later (Mar 19) hedged: *"messages using no advanced feature/intelligence **might be free**, but we don't need to take that into account for now."* spolu challenged: using an advanced model on a simple message should cost credits. Current working rule: basic message advanced model = minimum 1 credit. Pure basic (standard model, no premium tools) = 0 credits — but this could change.
> 

Premium tool invocations in the message that carry a non-zero AWU weight (i.e., any tool from the AWU weights table below with credits > 0). A message that only uses a standard model and no premium tools (or only 0-weight tools like web search or platform utilities) costs 0 AWU — intelligence credits are not charged. This ensures simple Q&A messages remain free and unlimited with a seat.

> **Note:** Additive model was the leaning decision from the Mar 20 session with Gabe/Stan/Pauline/Théo. spolu leaned toward a step/multiplicative model — **final confirmation pending**.
> 

> **Question:** Can Guest seats also send unlimited basic messages, or only paid seats ?
> 

## Seats, Roles, and Access Model

Seats replace MAU-based pricing. The model has two dimensions:

### Two dimensions

| Dimension | Values | Scope |
| --- | --- | --- |
| **Role** | `Viewer`, `User`, `Admin` | What the user can do — platform capabilities and permissions |
| **Usage tier** (seat type) | `Guest` (0 credits), `Pro`, `Max` | How many credits the user gets |

**Roles** (ordered by access level):

| Role | Platform capabilities | Admin capabilities |
| --- | --- | --- |
| **Viewer** | View workspace, browse conversations, conversation history/search | None |
| **User** | Full: agent/skill creation, knowledge management, data sources, developer features (MCP, API keys) | None |
| **Admin** | Same as User + workspace settings, connections, SCIM, audit logs, governance | Full admin capabilities |

**Usage tiers** (how much the user consumes):

| Tier | Credits/month | Metronome seat | Pool access |
| --- | --- | --- | --- |
| **Guest** | 0 | $0 seat | No. Can send basic messages only (if basic = 0 AWU is confirmed), otherwise no messages at all |
| **Pro** | 5,000 (INDIVIDUAL) | $30/mo seat | Yes (fallback when individual exhausted) |
| **Max** | 20,000 (INDIVIDUAL) | $125/mo seat | Yes (fallback when individual exhausted) |

Default assignment: Viewer role + Guest tier. All members are Metronome seats (Guest at $0 appears on invoice).

**How they combine per plan:**

| Plan | Available roles | Available usage tiers | Usage model |
| --- | --- | --- | --- |
| **Free plan** | User, Admin | Limited | Limited credits, data sources, MCPs; possibly time-limited |
| **Business & Enterprise (seat-based)** | Viewer, User, Admin | Guest, Pro, Max | Per-seat credit bundles (INDIVIDUAL) |
| **Platform plan (Large Enterprise)** | Viewer, User, Admin | Pooled (no per-seat tiers) | Workspace pool credits |

### Seat types (per-plan)

**Business plan:**

| Seat type | Price (annual) | Price (monthly) | Credits/month | Assignment |
| --- | --- | --- | --- | --- |
| **Guest** | $0 | $0 | 0 | Default when a user joins a Business plan workspace. Stored as a $0 Metronome seat with 0 recurring credits — allows adding credits later via package config without code changes |
| **Pro** | $24/seat | $30/seat | 5,000 | Default paid seat (~90% of users) |
| **Max** | $100/seat | $125/seat | 20,000 | Power users (admin-initiated upgrade) |

**Enterprise Platform plan:**

On Enterprise Platform, all users draw from the **workspace pool** (no per-seat credit bundles). Two Metronome seat types, mapped to roles:

| Seat type (Metronome) | Maps to role | Credits | Description |
| --- | --- | --- | --- |
| **Light** | Viewer | From workspace pool | Default. View workspace, browse conversations, conversation history/search |
| **Standard** | User or Admin | From workspace pool | Admin-initiated upgrade. Full platform capabilities |

Pricing is custom-negotiated per deal.

> **Open question — Enterprise Platform seat pricing:**
> 
> - **Pricing per seat type**: Not defined. Possible structure: Light at $X/seat (low), Standard at $Y/seat (higher), or flat platform fee + per-seat pricing.
> - **Should Light seat users drawing from the workspace pool have some individual cap** to prevent one user consuming the entire pool? (Pauline’s concern)

All seat types provide access to **all product features** on Business plans. Differentiation is purely in credit volume.

Per-seat credits (Business plans) use `INDIVIDUAL` allocation (each user has their own balance). When exhausted, usage falls back to the workspace-level credit pool.

**Programmatic usage** (API key, no `user_id`): AWU cost is calculated the same way (intelligence + tools credits), but consumed from the **workspace pool** (committed/PAYG credits), not from any individual seat allocation, since there’s no user. Overage is charged per-AWU at the list price.

> **Note — no free programmatic credits on new plans.** Unlike legacy plans (which grant free programmatic credits via the `registered_users` bracket formula), the new pricing has no free programmatic allocation. Programmatic usage draws exclusively from the workspace pool (committed/PAYG). This means a workspace without purchased credits cannot use the API at all. **Open question:** should new plans include some baseline programmatic credits, or is committed/PAYG-only the intended model?
> 

> **Note:** Open question for large enterprise deals — whether programmatic usage should use AWU or direct USD token pricing (per ElevenLabs’ lesson that enterprise API customers prefer $/unit over credits).
> 

## Plan restructuring

| Change | Detail |
| --- | --- |
| “Pro” plan → **“Business” plan** | Gains SSO, EU hosting, Salesforce (previously Enterprise-gated) |
| Feature gating removed | All product features accessible from Free plan |
| Differentiation = volume | Connectors (1/20/unlimited), spaces (1/10/unlimited), credits |
| Enterprise-only features | SCIM, audit logs, advanced analytics, custom data retention, remote MCP, … |

> **Open questions:**
- **Business plan seat cap at 100–150?** Sales suggested capping to push larger teams to Enterprise. Unconfirmed.
- **Free workspaces in Metronome:** Do free (non-paying) workspaces get a Metronome customer/contract? Probably not — gate behind first paid subscription.
> 

## Workspace gauge event

A single daily event per workspace (`event_type: "workspace_gauge"`) carrying all gauge properties as a snapshot. One event, one idempotent `transaction_id`: `workspace-gauge-{workspaceSId}-{YYYY-MM-DD}`. Each Metronome billable metric picks up the property it cares about.

**Current gauge properties:**

| Property | Type | Description | Used by |
| --- | --- | --- | --- |
| `member_count` | number | Total active members | Legacy free credit commit (bracket formula) |
| `mau_1_count` | number | Users with 1+ message in 30 days | Legacy enterprise MAU_1 contracts |
| `mau_5_count` | number | Users with 5+ messages in 30 days | Legacy enterprise MAU_5 contracts |
| `mau_10_count` | number | Users with 10+ messages in 30 days | Legacy enterprise MAU_10 contracts |

**Future gauge properties** (can be added to the same event without schema changes):

| Property | Type | Description | Potential use |
| --- | --- | --- | --- |
| `connected_data_sources_count` | number | Number of connected data sources | Plan limit enforcement, usage-based pricing |
| `storage_bytes` | number | Total storage used | Storage-based pricing tiers |
| `has_sso` | number (0/1) | SSO enabled | Feature-based plan gating |
| `has_scim` | number (0/1) | SCIM provisioning enabled | Feature-based plan gating |
| `has_audit_logs` | number (0/1) | Audit logs enabled | Feature-based plan gating |
| `has_analytics` | number (0/1) | Advanced analytics enabled | Feature-based plan gating |
| `has_remote_mcp` | number (0/1) | Remote MCP servers configured | Feature-based plan gating |

> **Note on booleans:** Metronome event properties are `string | number`. There is no native boolean type. Use `0`/`1` integers for boolean features — Metronome metrics can aggregate on these (e.g., MAX on `has_sso` = 1 if SSO was enabled at any point in the period, COUNT where `has_sso` = 1 for number of workspaces with SSO).
> 

> **Open question:** Confirm with AEs and founders: stop MAU billing entirely and move to traditional seats? Leaning **yes** — 80% of enterprise ARR is committed, paying seats / total seats = 85%. MAU poorly understood by customers.
> 

## AWU classification: basic vs advanced

Every message is classified as **basic** or **advanced** based on models and tools used:

- **Basic** (0 credits, not fully confirmed): Standard models (Claude Sonnet, GPT-5 Mini, Gemini Flash, Mistral, DeepSeek), no premium tool features. Working assumption: Unlimited with any seat ( see note above in Concepts > AWU )
- **Advanced** (1+ credits): Frontier/reasoning models (Claude Opus, GPT-5, o1/o3/o4, Gemini Pro), OR premium tools (deep research, generation, multi-agent orchestration)

Sent as `message_tier` on all events.

**Sub-agent metering — event granularity.** Two approaches, same total AWU billed:

**Option 1: Parent-only events** (Théo's guidance, Mar 23): "parent messages should be sent to Metronome, not child messages." Sub-agent intelligence + tool costs aggregated into the parent message's AWU total before emitting. 1 event per user action. Simpler Metronome data, but requires waiting for the full agent chain to complete before emitting (not fire-and-forget).

**Option 2: Per-message events** (current code architecture): Each sub-agent emits its own `llm_usage` and `tool_use` events with `is_sub_agent_message: "true"` and `parent_agent_message_id`. Fire-and-forget compatible. More events in Metronome but richer analytics (per-sub-agent cost breakdown).

Both produce the **same total AWU bill** — the difference is only in event granularity and emission timing. Option 1 is cleaner in Metronome (fewer events, 1 per user action). Option 2 is simpler in code (fire-and-forget, no aggregation wait). The `is_sub_agent_message` flag and `parent_agent_message_id` are only needed for Option 2. Leaning towards Option 2 for better granularity.

> **Note:** This means a deep-dive spawning 10 sub-agents will bill the full intelligence + tool cost of all 10 sub-agents, plus the 5 AWU orchestrator weight on the parent.
> 

# 🏗️ Architecture

## Overview

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
  │  Daily cron ──▶ workspace_gauge event ──▶ Metronome    │
  │                  (members, MAU, storage, ingest API    │
  │                   data sources, features)              │
  │                                                        │
  │  Metronome webhook ──▶ Redis cache (credit balance)    │
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

## Concept mapping: Dust ↔ Metronome

| Dust concept | Metronome concept | Relationship |
| --- | --- | --- |
| Plan (e.g., Business Plan) | Package | 1:1 via `metronomePackageAlias` |
| Workspace | Customer | 1:1 — `metronomeCustomerId` on `WorkspaceModel`, workspace `sId` as ingest alias |
| Subscription | Contract | 1:1 — contract created from package on subscribe |
| Membership | Seat | 1:1 — each member gets a seat on the contract |
| Agent message (LLM call) | `llm_usage` event | 1:N — one event per model call within a message |
| Agent message (tool call) | `tool_use` event | 1:N — one event per MCP action |
| Programmatic credit (free) | Recurring credit | **Legacy plans only** — bracket formula based on `registered_users`. No free programmatic allocation on new plans |
| Programmatic credit (committed) | Commit (PREPAID) | Workspace pool (purchased credits) |
| Programmatic credit (PAYG) | Commit (POSTPAID) | Workspace pool (overage) |

## Event types

| Event | Trigger | Frequency |
| --- | --- | --- |
| `llm_usage` | Agent message completion | One per (provider_id, model_id) group — aggregates token counts and cost per model |
| `tool_use` | Agent message completion | One per (tool_name, mcp_server_id, status) group — aggregates identical tool invocations with `count` and `total_execution_duration_ms` |
| `workspace_gauge` 
 | Daily Temporal cron | Once/day/workspace — carries all gauge properties (member_count, mau_1/5/10, data sources, storage, feature flags) in a single event |

## Seats and auto-assigned credits

When a workspace subscribes:

1. Contract created from package → seat subscriptions (Guest, Pro, Max) provisioned automatically
2. All existing members bulk-assigned as **Guest seats** ($0, 0 AWU)
3. Each paid seat (Pro/Max) gets its monthly credit allocation via `INDIVIDUAL` recurring credits in the package

On membership changes:

- **Member joins** → `addMetronomeGuestSeat` (fire-and-forget from `createMembership`)
- **Member leaves** → `removeMetronomeSeat` (fire-and-forget from `revokeMembership`)
- **Seat type change** → `changeMetronomeSeatType` (remove from old subscription + add to new)

# ⚙️ Implementation

## LLM and Tool Usage

### Pricing logic

**Phase 1: Cost generated in code**

Code computes `cost_micro_usd` per LLM call (`token_pricing.ts`) and sends it as an event property (already implemented). **Same metric** (`LLM Provider Cost`) is used by both legacy and new pricing — only the product/rate card configuration differs:

- **Legacy rate card**: product converts micro-USD → USD (`quantity_conversion: ÷1M`), priced in USD with 30% markup
- **New pricing rate card**: same conversion to USD, then `credit_type_conversions` converts USD → AWU, with `rounding_behavior: "ceiling"` (no fractional AWU)

No new metrics needed. No code changes needed. AWU rounding handled entirely by Metronome.

| Concern | Where it lives | Changed by |
| --- | --- | --- |
| Per-model token rates (provider cost) | `token_pricing.ts` (code) | Engineers |
| USD → AWU conversion | Metronome product (`quantity_conversion`) + rate card (`credit_type_conversions`) | Metronome config |
| AWU rounding | Metronome (`rounding_behavior: "ceiling"`) | Metronome config |
| Intelligence markup (0–10%) | Rate card in Metronome (rate on AI Usage product) or via `fiat_per_custom_credit` per contract | GTM/Ops |
| Per-tool-category credit weights | Rate card in Metronome | GTM/Ops |
| Per-seat pricing | Rate card in Metronome | GTM/Ops |
| Custom enterprise discounts | Contract overrides in Metronome | Sales/Ops |

**Phase 2: Metronome Pricing Index**

Metronome publishes a [Pricing Index](https://metronome.com/pricing-index/openai-api) with per-model token pricing for major providers (OpenAI, Anthropic, etc.). All events already send raw token counts (`prompt_tokens`, `completion_tokens`, `cached_tokens`, `cache_creation_tokens`) + `model_id` alongside `cost_micro_usd`. The infrastructure is ready:

1. Dimensional metrics by `model_id` for each token type — created in sandbox (experimental)
2. Products with `pricing_group_key: ["model_id"]` and `quantity_conversion ÷1M` — created in sandbox
3. Sample rate card with manually hardcoded per-model prices — created in sandbox for testing

**Open question — ask Metronome:** How does the Pricing Index integrate with rate cards? Is it (a) a rate card that auto-syncs from the index, (b) an API we query to populate rates, or (c) a UI feature linking a rate card to an index? The sandbox currently uses manually hardcoded rates — if the Pricing Index can auto-maintain them, it eliminates the main drawback of dimensional pricing (~240 entries to maintain). **Follow up via Slack Connect channel with Metronome.**

Phase 1 uses `cost_micro_usd` computed in code. Phase 2 migrates to the Pricing Index when: (a) we understand how it integrates, (b) we want GTM/Ops to control per-model pricing without code deploys, or (c) we want to stop maintaining `token_pricing.ts` entirely.

### AWU credit weights per tool category

Configured in the rate card. Working values (calibration in progress):

| Tool Category | Credits | Status | Examples |
| --- | --- | --- | --- |
| Retrieval (RAG, MCP read, table query) | **1** | Proposal | search, include_data, extract_data |
| Web search | **0** | Proposal | web_search_&_browse ("paying for web search is an anti-pattern") |
| Write actions (MCP write) | **2** | Proposal | connector write-backs |
| Visuals (Frames, data query) | **2** | Proposal | table query visualizations |
| Create Frame | **5** | Proposal | new Frame creation |
| Edit Frame | **2** | Proposal | Frame modification |
| Orchestrator (run_agent) | **5** | Proposal | run_agent, agent_router |
| Unsupervised actions (triggers, evals) | **2** | Proposal | scheduled triggers |
| Platform utilities | **0** | Proposal | extract_data, common_utilities |

> **Open questions on tool weights:**
> 
> - Exact credit weights per tool are **not finalized** — calibration with analytics pending. Current values are from the Metabase simulator dashboard.
> - **Cumulative vs costliest-tool-wins** for multi-tool messages: Théo leans cumulative; earlier Notion doc says costliest applies. Needs reconciliation.
> - **RAG at 1 credit** — RAG represents ~50% of all tool credit consumption at this weight. Is 1 credit too much? Needs calibration.
> - **Should all actions be priced?** spolu's objection is broader than "edit frame": *"I'm really not a fan of pricing all actions. Pricing an edit frame makes no sense to me as a buyer"* and *"multiplicative is overfitted on our current model."* This challenges the entire per-action pricing approach, not just one tool weight. Under debate.
> - **FX ($/€) impact** on per-credit pricing and gross margins: flagged, not yet analyzed.

### Programmatic vs user usage

AWU cost is calculated **the same way** for both programmatic and user usage (intelligence + tools credits). The difference is only in **where credits are consumed from**:

- **User usage** (`is_programmatic_usage=false`, has `user_id`): Web/Slack/extension. Consumed from the user's **individual seat allocation** first (Pro/Max — Guest has 0), then falls back to workspace pool
- **Programmatic usage** (`is_programmatic_usage=true`, no `user_id`): API key usage. Consumed directly from the **workspace pool** (committed/PAYG credits) — not tied to any seat allocation since there's no user

Metrics are split into programmatic and user variants via `is_programmatic_usage` to allow different rate card pricing if needed (e.g., different markup or tool weights for API vs interactive usage). Currently both use the same rates.

The `origin` property (`web`, `slack`, `api`, `zapier`, etc.) is also available for filtering if needed.

### `llm_usage` event properties

One event per (provider_id, model_id) group within an agent message. Multiple calls to the same model are aggregated.

| Property | Type | Description |
| --- | --- | --- |
| `workspace_id` | string | Workspace sId |
| `user_id` | string (optional) | User sId, null for programmatic |
| `agent_message_id` | string | Agent message sId (this message's own ID) |
| `parent_agent_message_id` | string (optional) | Parent message sId when `is_sub_agent_message=true`. Allows grouping all costs from an agent chain under the original user action. Derived from `agenticOriginMessageId` on the user message |
| `provider_id` | string | e.g., `anthropic`, `openai` |
| `model_id` | string | e.g., `claude-sonnet-4-6` |
| `prompt_tokens` | number | Total cache input tokens for this model |
| `completion_tokens` | number | Total cache output tokens for this model |
| `cached_tokens` | number | Total cache read tokens for this model |
| `cache_creation_tokens` | number | Total cache write tokens for this model |
| `cost_micro_usd` | number | Total provider cost for this model (no markup), from `token_pricing.ts`. Used by legacy rate cards (30% markup in USD). Not used for AWU billing on new plans — kept for analytics, margin tracking, and shadow mode validation |
| `is_programmatic_usage` | string | `"true"` or `"false"` |
| `message_tier` | string | `"basic"` or `"advanced"` (AWU classification) |
| `is_sub_agent_message` | string | `"true"` if spawned by another agent (detected via `agenticMessageType` on user message) |
| `origin` | string | e.g., `web`, `slack`, `api`, `zapier` |

### `tool_use` event properties

One event per (tool_name, mcp_server_id, status) group within a message. Identical tool invocations are aggregated with a `count` field.

| Property | Type | Description |
| --- | --- | --- |
| `workspace_id` | string | Workspace sId |
| `user_id` | string (optional) | User sId, null for programmatic |
| `agent_message_id` | string | Agent message sId (this message's own ID) |
| `parent_agent_message_id` | string (optional) | Parent message sId when `is_sub_agent_message=true` |
| `tool_name` | string | e.g., `websearch`, `search` |
| `internal_mcp_server_name` | string | e.g., `web_search_&_browse`, empty for external |
| `mcp_server_id` | string | Server sId |
| `tool_category` | string | Pricing tier (retrieval, deep_research, connectors, generation, agents, actions, platform, reasoning) |
| `tool_group` | string | Constant value `"tools"`. Used as `presentation_group_key` to aggregate all tool categories into a single "Tool Usage" line on invoices |
| `status` | string | `succeeded`, `errored`, `denied`, etc. |
| `count` | number | Number of invocations in this group |
| `total_execution_duration_ms` | number | Sum of wall-clock execution times for all invocations in the group |
| `is_programmatic_usage` | string | `"true"` or `"false"` |
| `message_tier` | string | `"basic"` or `"advanced"` |
| `is_sub_agent_message` | string | `"true"` if spawned by another agent |
| `origin` | string | e.g., `web`, `slack`, `api` |

### Idempotent retryability

Every event carries a deterministic `transaction_id` derived from business identifiers — **not** random UUIDs. Metronome deduplicates events with the same `transaction_id`.

| Event type | `transaction_id` pattern | Uniqueness guarantee |
| --- | --- | --- |
| `llm_usage` | `llm-{workspaceId}-{agentMessageId}-{providerId}-{modelId}` | One per provider/model group per message |
| `tool_use` | `tool-{workspaceId}-{agentMessageId}-{toolName}-{mcpServerId}-{status}` | One per tool/server/status group per message |
| `workspace_gauge` | `workspace-gauge-{workspaceId}-{YYYY-MM-DD}` | One per workspace per day |

**Retry semantics:**

- `ingestMetronomeEvents` is fire-and-forget — logs warnings but does not throw
- Temporal activities can be safely retried — same deterministic `transaction_id` on replay, Metronome deduplicates
- Gauge crons re-running same day → same `dateKey` → same `transaction_id` → idempotent

**Extended downtime backfill:** Events emitted during outage are lost (fire-and-forget). To backfill, replay Temporal activities for the affected period — deterministic `transaction_id` ensures no double-counting.

### Metronome billable metrics

**Same metrics for all plans** (legacy and new pricing). What differs is the product/rate card configuration, not the metrics.

| Billable Metric | Aggregation | Filter | Used by |
| --- | --- | --- | --- |
| LLM Provider Cost (Programmatic) | SUM on `cost_micro_usd` | `is_programmatic_usage=true` | Legacy (USD markup) + New pricing (USD → AWU conversion) |
| LLM Provider Cost (User) | SUM on `cost_micro_usd` | `is_programmatic_usage=false` | New pricing only (USD → AWU conversion) |
| Tool Invocations (Programmatic) | COUNT (succeeded only) | grouped by `tool_category` | Legacy (0-priced) + New pricing (AWU weights) |
| Tool Invocations (User) | COUNT (succeeded only) | grouped by `tool_category` | New pricing only (AWU weights) |
| Registered Users | MAX on `member_count` | event_type=`workspace_gauge` | Legacy plans only (bracket-based free credit commit) |
| MAU_1 | MAX on `mau_1_count` | event_type=`workspace_gauge` | Legacy enterprise (MAU_1 plans) |
| MAU_5 | MAX on `mau_5_count` | event_type=`workspace_gauge` | Legacy enterprise (MAU_5 plans) |
| MAU_10 | MAX on `mau_10_count` | event_type=`workspace_gauge` | Legacy enterprise (MAU_10 plans) |

### Metronome products

### Usage products (shared across legacy and new pricing)

Same products, different rate card configuration. The metric is the same — what changes is how the rate card prices it (USD for legacy, AWU for new).

| Product | Type | Metric | Pricing Key | Legacy rate card | New pricing rate card |
| --- | --- | --- | --- | --- | --- |
| AI Usage (Programmatic) | USAGE | LLM Provider Cost (Prog) | — | `÷1M`, priced in USD (30% markup) | `÷1M` + `credit_type_conversions` → AWU + `rounding_behavior: "ceiling"` |
| AI Usage (User) | USAGE | LLM Provider Cost (User) | — | Not on legacy rate card | Same as programmatic, AWU conversion |
| Tool Usage (Programmatic) | USAGE | Tool Invocations (Prog) | `tool_category` | Not on legacy rate card | Dimensional AWU pricing by category. `presentation_group_key: ["tool_group"]` for single invoice line |
| Tool Usage (User) | USAGE | Tool Invocations (User) | `tool_category` | Not on legacy rate card | Same as programmatic |

### Legacy-only products

| Product | Type | Notes |
| --- | --- | --- |
| Legacy Seat ($29) | SUBSCRIPTION | $29/mo flat. Maps to current Pro plan |
| Legacy Seat ($39) | SUBSCRIPTION | $39/mo flat. Maps to current Business/SSO plan |
| Legacy Enterprise Seat | SUBSCRIPTION | $45/mo flat (negotiable per deal) |
| MAU Reporting | USAGE | For MAU-based enterprise contracts only |

### New pricing seat products

| Product | Type | Notes |
| --- | --- | --- |
| Guest Seat | SUBSCRIPTION | $0/mo, 0 AWU. Default on join. Appears on invoice as $0 |
| Pro Seat | SUBSCRIPTION | $24/yr ($30/mo) + 5,000 AWU/month (INDIVIDUAL) |
| Max Seat | SUBSCRIPTION | $100/yr ($125/mo) + 20,000 AWU/month (INDIVIDUAL) |
| Light Seat | SUBSCRIPTION | Enterprise Platform only. Workspace pool credits |
| Standard Seat | SUBSCRIPTION | Enterprise Platform only. Workspace pool credits |
| Included AWU Credits | FIXED | Line item for recurring per-seat credit grants |

### Rate cards

### Legacy rate cards (grandfathered plans, Stripe-equivalent pricing on Metronome)

**Legacy Pro Rate Card** (`legacy-pro-29`):

| Product | Price | Notes |
| --- | --- | --- |
| Legacy Seat ($29) | $29/mo | FLAT + MONTHLY |
| AI Usage (Programmatic) | $1.30 per $1 cost | 30% markup on provider cost, in USD |

**Legacy Business Rate Card** (`legacy-business-39`):

| Product | Price | Notes |
| --- | --- | --- |
| Legacy Seat ($39) | $39/mo | FLAT + MONTHLY, includes SSO |
| AI Usage (Programmatic) | $1.30 per $1 cost | 30% markup on provider cost, in USD |

**Legacy Enterprise Rate Card** (per-customer, manually configured):

| Product | Price | Notes |
| --- | --- | --- |
| Legacy Enterprise Seat | $45/mo (negotiable) | FLAT + MONTHLY |
| MAU Reporting | $45/MAU/mo (negotiable) | For MAU-based contracts only |
| AI Usage (Programmatic) | $1.30 per $1 cost (negotiable) | Markup varies per deal |

> **Note:** Legacy rate cards replicate current Stripe billing exactly. The `registered_users` metric drives a bracket-based free credit commit on legacy plans (1–10 users → $5/user, 11–50 → $2/user, 51–100 → $1/user), managed entirely in Metronome.
> 

### New pricing rate card (credit-based)

**Business Plan Rate Card** (`business-plan`):

| Product | Price | Notes |
| --- | --- | --- |
| Guest Seat | $0/mo | FLAT + MONTHLY, 0 AWU (appears on invoice as $0 line item) |
| Pro Seat | $24/yr ($30/mo) | FLAT + MONTHLY, includes 5,000 AWU/month (INDIVIDUAL) |
| Max Seat | $100/yr ($125/mo) | FLAT + MONTHLY, includes 20,000 AWU/month (INDIVIDUAL) |
| AI Usage (Programmatic) | Priced in AWU | Metronome converts `cost_micro_usd` → USD → AWU via product `quantity_conversion` + rate card `credit_type_conversions` |
| AI Usage (User) | 1 AWU per unit | Same conversion as programmatic |
| Tool Usage (Programmatic) | Per category in AWU | 1 AWU per invocation × tool weight (weight configured in metric or rate card) |
| Tool Usage (User) | Per category in AWU | Same weights as programmatic |

> **Note:** Intelligence markup can be applied at multiple levels: in the rate card (price per USD of provider cost) or via the AWU-to-USD conversion rate (`fiat_per_custom_credit`) which can be tuned per contract — e.g., $0.01/AWU at list price but $0.008/AWU for a high-volume enterprise deal. Tool credit weights still being calibrated.
> 
> 
> **Open question:** Exact intelligence markup (0–10% range decided, exact value TBD). Founders to decide.
> 

### Contracts (packages)

### Legacy contracts (grandfathered)

Each legacy contract matches an existing Stripe plan 1:1. Created during migration Phase 4 when workspaces move from Stripe to Metronome.

| Package | Maps to | Rate card | Seat type | Credit model |
| --- | --- | --- | --- | --- |
| `legacy-pro-29` | Pro $29/mo | Legacy Pro | Legacy Seat ($29) | Free credits via `registered_users` bracket formula |
| `legacy-business-39` | Business $39/mo | Legacy Business | Legacy Seat ($39) | Free credits via `registered_users` bracket formula |
| `legacy-enterprise-mau` | Enterprise (MAU) | Legacy Enterprise | MAU Reporting | Custom per deal |
| `legacy-enterprise-seat` | Enterprise (seat) | Legacy Enterprise | Legacy Enterprise Seat | Custom per deal |

### New pricing contracts

| Package | Target | Rate card | Seat types | Credit model |
| --- | --- | --- | --- | --- |
| `business-plan` | New Business signups | Business Plan | Pro ($24/yr) + Max ($100/yr) | 5,000/20,000 per-seat INDIVIDUAL + workspace pool |
| `enterprise-plan` | New Enterprise deals | Custom per deal | Custom seat types | Pooled workspace credits (negotiable) |

> **Note:** Enterprise contract structure (seats+caps vs. platform fee + pools) not yet decided. Enterprise contracts likely created manually via Metronome UI/API by Ops, not via packages.
> 

> **OPEN — Enterprise migration to new pricing.** Current enterprise customers have custom-negotiated deals (seat-based or MAU-based, custom markup rates, custom credit amounts). Several questions:
> 
> 1. **Migration path:** Do existing enterprise customers stay on legacy rate cards indefinitely, or are they migrated to AWU-based pricing at contract renewal? Can we mix — e.g., keep legacy seat pricing but add AWU billing for usage?
> 2. **Custom rate cards:** Will each enterprise deal get its own Metronome rate card with negotiated AWU prices (per-model token rates, per-tool weights, seat prices), or do we use contract-level overrides on the standard Business Plan rate card?
> 3. **MAU → seats:** Enterprise customers on MAU billing need to transition to seats. This changes their bill structure (paying for all registered users vs only active ones). Needs per-customer communication and possibly price adjustments to maintain revenue parity.
> 4. **Hybrid billing:** Can an enterprise contract use AWU for tool/intelligence billing but keep legacy USD-based programmatic pricing? Or must it be all-or-nothing?
> 5. **Timeline:** Are enterprise migrations part of Phase 4 (same pricing on Metronome) or Phase 5 (new pricing)? Enterprise deals may need to wait until contract renewal.

## Seats Management

Seats replace MAU-based pricing. Every workspace member gets a **Free seat** ($0, 300 AWU/month) automatically on join. Paid seats (Pro, Max) are assigned on upgrade.

**Seat lifecycle:**

| Event | Action |
| --- | --- |
| Workspace subscribes | All existing members get **Free seats** automatically |
| New member joins | Auto-assign **Free seat** (`addMetronomeFreeSeat`, fire-and-forget) |
| Member removed | Remove seat (`removeMetronomeSeat`, fire-and-forget) |
| Admin upgrades Free → Pro | `changeMetronomeSeatType` (remove from Free + add to Pro, starts billing $30/mo) |
| Admin upgrades Pro → Max | `changeMetronomeSeatType` (remove from Pro + add to Max) |
| Admin downgrades Max → Pro | `changeMetronomeSeatType` (remove from Max + add to Pro) |
| Admin downgrades Pro → Free | `changeMetronomeSeatType` (remove from Pro + add to Free, stops billing) |

**Data model:** `seatType` column on membership model (default `"free"`). Admin endpoint `PATCH /api/w/[wId]/members/[userId]/seat-type` for upgrade/downgrade.

**Metronome-side:** Three seat subscriptions (Free, Pro, Max) configured in the package with `seat_group_key: "user_id"`, `is_prorated: true`, `collection_schedule: ADVANCE`. Metronome handles proration when seats are added/removed mid-cycle.

> **OPEN — seat upgrade policy.** See Architecture > Seats and auto-assigned credits for the open question on auto-upgrade (Free→Pro when credits exhausted) vs manual upgrade (admin decision).
> 

**Enterprise seats (open):** Two options on the table:

1. Seat-based with credit caps and negotiable allocation (e.g., "Heavy" = 200 advanced/month, "Light" = 10)
2. Platform access fee + credit pools that admins allocate per user

Enterprise credits would be **pooled** at workspace level (vs. per-user on Business).

> **Note:** Enterprise seat structure not yet decided. Additionally, Metronome does not natively support **volume-based seat pricing** — i.e., degressive per-seat pricing based on quantity (e.g., first 30 seats at $45/mo, next 30 at $35/mo, 60+ at $25/mo). This is a common enterprise negotiation lever. Until Metronome adds native support, workarounds include: multiple seat products at different price tiers managed code-side, or contract-level scheduled charges to approximate volume discounts. Raised with Metronome during the Mar 11 call (logged on their side as product request, per Théo's notes in #initiative_pricing_push Mar 12). No ticket number — follow up via Slack Connect channel with Metronome for status.
> 

## 💰 Credit Pool

### Credit types and consumption order

| Credit Type | Metronome Concept | Priority | Scope | Description |
| --- | --- | --- | --- | --- |
| **Seat allocation** | Credits (recurring) | 1 (consumed first) | Per-user cap | 300/month (Free), 5,000/month (Pro), or 20,000/month (Max). Hard-capped per user — each user can only consume their own seat's allocation |
| **Committed (purchased pool)** | Commits (PREPAID) | 2 | Workspace-wide | Admin-purchased credits shared across all members. Fallback when individual allocation exhausted |
| **PAYG (overage)** | Commits (POSTPAID) | 3 | Workspace-wide | Pay-as-you-go overage if enabled. Can be capped per billing period (see below) |

**Consumption flow:** User burns through their individual seat allocation first → falls back to workspace purchased pool → hits overage (if enabled) or gets blocked.

Programmatic usage (no `user_id`) draws directly from the workspace pool (committed/PAYG), not from any individual seat allocation.

### Seat credit allocation

Credits are granted per-seat automatically each billing cycle via Metronome's recurring credit mechanism in the package:

- **Pro seat**: 5,000 AWU/month
- **Max seat**: 20,000 AWU/month

Per-seat, `INDIVIDUAL` allocation — each user has their own cap. Managed entirely in Metronome (no DB mirror).

### Purchased credits

Admins can buy additional credits that go into the shared workspace pool. Available for any member who has exhausted their individual allocation, or for programmatic usage.

### Queryable balances

- Per-seat balance: via Metronome `/contracts/seatBalances/list`
- Workspace pool balance: via Metronome credit balance APIs

### Overage pricing

Per-credit at list price ($0.01). Enterprise: negotiable volume discount (e.g., $0.0075 at $500K ACV).

**Overage cap:** Metronome's POSTPAID commit type can be configured with a fixed amount, effectively capping overage per billing period. The current Stripe-based system already uses this pattern (`paygCapMicroUsd` on `ProgrammaticUsageConfigurationResource` — Pro: $50/user/month, hard cap $1,000/cycle; Enterprise: configurable per deal). The same approach can be replicated in Metronome by setting the POSTPAID commit amount as the cap.

> **OPEN — overage policy for new pricing.** Three options:
> 
> 1. **Hard-block at zero**: no overage, user/workspace blocked when all credits exhausted
> 2. **Capped overage**: allow overage up to a configurable limit (e.g., $X per billing period), then block
> 3. **Unlimited overage**: bill everything post-hoc, no blocking
> 
> Metronome supports all three. The cap amount should be configurable per contract (self-serve default vs enterprise negotiated). Overage gross margin not yet defined — spolu requested simulation with 25% usage decrease for bucket 3, 50% for overaging users.
> 

## 🚦 User Limit Handling

**Two-level credit check:** Enforcement needs to account for both per-user seat allocation and workspace pool:

1. Metronome sends webhooks when balances change:
    - `alerts.low_remaining_seat_balance_reached` → per-user seat allocation exhausted
    - `alerts.low_remaining_credit_balance_reached` → workspace pool exhausted
2. Dust backend maintains **two Redis caches** (TTL ~60s):
    - Per-user seat credit balance: `hasUserSeatCredits(workspaceSId, userSId)`
    - Workspace pool balance: `hasWorkspacePoolCredits(workspaceSId)`
3. Pre-flight check in agent loop:
A user with exhausted seat credits can still send messages if the workspace pool has balance.
    
    ```
    if isMetronomeBilled(plan):
      if not hasUserSeatCredits(workspace.sId, user.sId)
         and not hasWorkspacePoolCredits(workspace.sId):
        block message with "out of credits" error
    ```
    
4. When credits are replenished (new billing period, credit purchase), `commit.segment.start` / `credit.create` webhook updates both caches.

**UX thresholds:** Warn at **80%** of individual seat allocation, hard-block when both individual and workspace pool at **0%**.

**Long-running agent loops:** An agent may start with credits available but exhaust them mid-run. Current approach: allow the run to complete (post-hoc billing), block only new messages. Metronome supports overage billing natively.

> **Note:** Grace period on credit exhaustion (hard-block vs. 24h grace vs. $X overage cap) is an open product decision.
> 

**Metronome webhook events:**

| Event | Action |
| --- | --- |
| `alerts.low_remaining_credit_balance_reached` | Update Redis: credits exhausted |
| `alerts.low_remaining_seat_balance_reached` | Update Redis: per-seat credits exhausted |
| `alerts.spend_threshold_reached` | Update Redis: approaching limit |
| `commit.segment.start` | Update Redis: credits available (new period) |
| `credit.create` | Update Redis: credits available (purchase) |
| `contract.start` | Activate Metronome billing for workspace |
| `contract.end` | Downgrade workspace, schedule scrub |
| `invoice.finalized` | Log/record invoice |
| `invoice.billing_provider_error` | Alert on-call |

## UI Changes

### Onboarding / Subscribe page

**Rollout phases:**

1. **Shadow mode (current):** `SubscribePage` shows **legacy plans only** (Pro $29). Stripe billing as usual. All usage events double-written to Metronome in the background (shadow mode) but Metronome does not bill. No visible change to users.
2. **Dev/testing phase:** A **dedicated subscribe page** (gated, not accessible to end users) allows subscribing to the new Metronome Business plan. Used only by internal team and pilot testers. This page uses Stripe Checkout in **setup mode** (payment method capture only, no recurring subscription), then `metronome-finalize` provisions the Metronome customer + contract + seats.
3. **Full rollout:** `SubscribePage` updated to show new Metronome-based plans to all users. Legacy plans removed from the subscribe page (existing subscribers grandfathered). Depending on the plan type selected:
    - **Metronome plan:** Redirect to Stripe Checkout in setup mode → `metronome-finalize`
    - Legacy Stripe checkout path removed

### Manage Subscription page

`SubscriptionPage` detects `metronomePackageAlias` and conditionally renders:

- **Stripe-billed (legacy):** Stripe portal links, pricing table, billing period toggle
- **Metronome-billed:** `MetronomeSubscriptionSection` showing:
    - Free/Pro/Max seat counts and monthly cost estimate
    - Seat type management (upgrade/downgrade Free ↔ Pro ↔ Max)
    - Cancel subscription button (ends Metronome contract)

### Credits page

Currently shows programmatic credits only. To be extended to show:

- Per-seat credit balance (via Metronome `/contracts/seatBalances/list`)
- Workspace credit pool balance
- Credit purchase option (committed credits)
- Credit purchase history

### Usage graphs

Currently: programmatic usage graph only. To be refactored:

- Replace internal usage tracking with Metronome API-backed data
- Extend to all usage (not just programmatic) — per-user, per-model, per-tool breakdowns
- Leverage Metronome's `/usage` APIs for consistent billing-grade data
- Show credit estimate during deep-dive planning phase before execution (proposed UX)

## 🔍 Code Pointers

### Event emission

Usage events are sent via Temporal workflows:

- `front/temporal/usage_queue/activities.ts` — `recordUsageActivity` emits `llm_usage` + `tool_use` events per agent message; `emitMetronomeGaugeEventsForAllWorkspacesActivity` emits a single daily `workspace_gauge` event per workspace (members, MAU thresholds, data sources, storage, feature flags)
- Events are built by `front/lib/metronome/events.ts` and ingested via `front/lib/metronome/client.ts` → `ingestMetronomeEvents`
- **All messages** (parent and sub-agent) emit events. Sub-agent events carry `is_sub_agent_message: "true"` and `parent_agent_message_id` for analytics grouping, but are billed individually
- Events always flow to Metronome (always-on, no feature flag) — enables shadow mode and double-write during migration

**No code changes needed for either pricing option** — Option A uses `cost_micro_usd` (already sent), Option B uses raw token counts (already sent). The difference is purely in Metronome configuration (product conversion vs dimensional pricing).

### Seat sync

Hooked directly into `front/lib/resources/membership_resource.ts`:

- `createMembership` → `addMetronomeFreeSeat` (fire-and-forget) — new members default to Free seat
- `revokeMembership` → `removeMetronomeSeat` (fire-and-forget)
- Seat upgrades/downgrades (Free ↔ Pro ↔ Max) → `changeMetronomeSeatType`

Seat functions in `front/lib/metronome/seats.ts` resolve product IDs dynamically from Metronome API by product name ("Free Seat", "Pro Seat", "Max Seat").

**Pending:** `seatType` column on membership model (default `"free"`). Admin endpoint `PATCH /api/w/[wId]/members/[userId]/seat-type`. Auto-upgrade policy (Free→Pro when credits exhausted) — open product decision.

### Subscription flow

**Dev/testing (current):**

- Gated subscribe page for internal/pilot testing only
- `PATCH /api/w/[wId]/subscriptions` (`subscribe_metronome`) → Stripe setup checkout → `POST /api/w/[wId]/subscriptions/metronome-finalize`
- `metronome-finalize` provisions Metronome customer + contract + bulk-assigns Free seats to all members

**Production (legacy, shadow mode):**

- Standard `SubscribePage` with legacy plans (Pro $29, Business $39) → Stripe Checkout with recurring subscription
- All usage events double-written to Metronome (shadow mode)
- Poke upgrade path: `front/pages/api/poke/workspaces/[wId]/upgrade.ts`

**Full rollout (future):**

- `SubscribePage` updated to show new Metronome plans
- Legacy Stripe checkout path removed for new signups

Contract management: `front/pages/api/w/[wId]/metronome/contract.ts`

### Limit handling

- Webhook endpoint (to create): `front/pages/api/metronome/webhook.ts`
- Redis cache for credit balance (to create): `front/lib/metronome/credit_balance.ts`
- **Two-level check**: per-user seat balance + workspace pool balance (see User Limit Handling section)
- Pre-flight credit check: to be added in agent loop entry point
- Long-running agent loops: allow completion (post-hoc billing), block only new messages
- Overage cap: configurable per contract via POSTPAID commit amount (see Credit Pool > Overage pricing)

### Credit management

Once a workspace is on Metronome (legacy or new pricing), **Metronome is the single source of truth for credits**. No credit data is stored in the Dust DB — the existing `CreditResource` / `trackProgrammaticCost` system is bypassed entirely for Metronome-billed workspaces.

- **Pre-flight blocking**: webhook → Redis (no DB)
- **UI credit display**: query Metronome API directly (`/contracts/seatBalances/list`, credit balance endpoints)
- **Legacy `syncMetronomeCreditGrantToDb`**: can be removed — was a transitional design, not needed since Metronome owns the full credit lifecycle

### Plan-based gating

```tsx
function isMetronomeBilled(plan: PlanType): boolean {
  return plan.metronomePackageAlias != null;
}
```

`metronomePackageAlias` on `PlanModel`: `null` → Stripe billing, `"business-plan"` → Metronome billing. Each Dust plan maps 1:1 to a Metronome package.

**Legacy plans in shadow mode:** `metronomePackageAlias` is still `null` (billing on Stripe). Events flow to Metronome for shadow comparison but Metronome does not bill. When migrating a legacy workspace to Metronome billing, set `metronomePackageAlias` to the corresponding legacy package alias (`"legacy-pro-29"`, `"legacy-business-39"`).

### Metronome limitations

Three features **not natively supported** — raised with Metronome during Mar 11 call, logged on their side as product requests (per Théo's notes in #initiative_pricing_push Mar 12). No ticket numbers — follow up via Slack Connect channel with Metronome for status:

1. **Volume-based seat pricing** (degressive pricing by quantity: 0–30 seats one price, 30–60 another) — Dust must own this logic or use workarounds (multiple seat products, scheduled charges)
2. **Payment-gated commitments for bank transfers** — only credit cards/ACH supported for initial charges
3. **Daily credit allowances/tiering** — possible but not ergonomic in current system

Additional **architectural constraints** (not product requests, just how Metronome works):

1. **No per-user credit tracking** — Metronome tracks credits at contract (workspace) level. Per-user seat credit caps (300/5,000/20,000) are enforced via INDIVIDUAL allocation on seat subscriptions, but real-time per-user balance checks need Dust-side enforcement (Redis)
2. **Cannot mix MAU and seats in one contract** — legacy MAU-based customers must be on a separate contract type from seat-based customers. No hybrid within a single contract
3. **Revenue reporting gap** — existing Metabase dashboards pull from Stripe. Migration to Metronome requires rebuilding reporting on Metronome's data (their revenue recognition APIs are available but integration work needed)

# 🛠️ Metronome Objects Deployment

## Sandbox setup

Full configuration script: `front/docs/metronome-sandbox-setup.sh`. Creates all metrics, products, rate cards, and packages via Metronome API.

See "Metronome billable metrics", "Metronome products", "Rate cards", and "Contracts" sections above for the full object definitions.

## Deployment approach

Currently deployed via setup script (`metronome-sandbox-setup.sh`). Consider Terraforming Metronome objects for production:

- Metrics, products, rate card definitions as code
- Package configurations versioned alongside plan changes
- Environment-specific configs (sandbox vs production IDs)
- Legacy and new pricing packages deployed in parallel

# 🔄 Migration

## Two-step approach (decided)

1. **Billing platform migration first:** Grandfather all existing clients on identical pricing via Metronome. No pricing changes
2. **Release new pricing:** Once Metronome is stable, ship new credit-based plans. New rate cards for new signups first, then existing customers

## Contract strategy

See "Contracts (packages)" section above for the full legacy and new pricing package definitions.

- **Phase 4 (migration):** Each existing Stripe plan gets a matching legacy Metronome package. Workspaces migrated 1:1 with identical pricing
- **Phase 5 (new pricing):** New signups get `business-plan` package with AWU credit pricing. Existing workspaces can be migrated by switching `metronomePackageAlias` from legacy to new package

## Phased rollout (decided)

Phases 1–4 use **legacy contracts only** (same pricing as Stripe, just migrating the billing platform). New AWU-based pricing is only introduced in Phase 5.

| Phase | Duration | Contracts used | Scope |
| --- | --- | --- | --- |
| **1. Shadow mode** | Active now | None (Stripe billing, Metronome receives events only) | All workspaces emit events to Metronome; billing 100% on Stripe. Compare Metronome shadow invoices vs Stripe for validation |
| **2. Internal dogfood** | ~1 week | Legacy (`legacy-pro-29`) | Enable Metronome billing on Dust's own workspace(s); validate invoices, credits, seat reporting match Stripe |
| **3. Controlled rollout** | ~1–2 weeks | Legacy (`legacy-pro-29`, `legacy-business-39`, `legacy-enterprise-*`) | 5–10 friendly/pilot workspaces (Pro + Enterprise mix). Same pricing, different billing platform |
| **4. Full migration** | ~2–3 weeks | Legacy (all) | Progressive batches: 10% → 25% → 50% → 100% at billing cycle boundaries. All workspaces on Metronome with legacy contracts. Stripe billing fully replaced |
| **5. New pricing** | TBD | New (`business-plan`) | New AWU-based rate cards for new signups. Existing workspaces can opt-in or migrate at contract renewal. Gated subscribe page opened to all users |
| **6. Cleanup** | TBD | New only | Remove old Stripe billing code, legacy conditional checks, old plan definitions. Legacy contracts sunset as customers migrate |

## Credit migration rules

- Migrate remaining balance only (not full amount)
- Preserve expiration dates and priority order (free → committed → PAYG)
- Freeze internal credits after migration to avoid double-consumption

## Existing programmatic usage

Current programmatic credits continue for Stripe-billed workspaces. For Metronome-billed workspaces:

- `reportUsageForSubscriptionItems` (Stripe MAU/seat reporting): skip
- `trackProgrammaticCost` (internal credit consumption): skip — Metronome tracks credits
- Free credit grants: replaced by per-seat allocation (5,000 Pro / 20,000 Max). Legacy bracket formula managed in Metronome rate card. No DB sync needed — Metronome is single source of truth
- Usage graphs: refactor from internal tracking to Metronome API-backed data

> **Open questions on migration:**
> 
> - **Design partner interviews** (Laurel, Vanta, Alan, Holy, Back Market) — not yet booked. Needed to validate new pricing before Phase 5.
> - **Before/after pricing impact** for US customers (Persona, Whatnot, Watershed) — pending analytics (requested by Gina).
> - **Rollback plan** from Metronome mid-billing-cycle — **not yet defined, required before Phase 2**. If a workspace on Metronome billing encounters issues, we need a procedure to revert to Stripe: re-create Stripe subscription from Metronome contract data, handle prorated billing overlap, reconcile any credits consumed in Metronome. This is a safety requirement for Phases 2–4 where real customer billing is at stake.
> - **Revenue reporting gap** — all existing Metabase dashboards pull from Stripe. When billing moves to Metronome, dashboards break. Metronome has revenue recognition APIs but integration work needed. JD flagged: *"I have no idea what our rev-stack looks like, but at the very minimum I would ask myself what Metabase will look like when subscriptions and prices are no longer handled in Stripe."* This should be a workstream, not an afterthought.

## Sales signals and risks

Concerns raised by the sales team in #initiative_pricing_push that should inform pricing decisions and rollout:

- **"Saving credits" psychology** (Louis): credit model could discourage experimentation — users may hoard credits instead of exploring, leading to lower engagement and longer sales cycles
- **Per-query cost fear** (Victor): prospect Eurotunnel/Getlink explicitly rejected Dust partly due to fear of per-query costs. Credits may trigger the same perception
- **Unused seat FUD** (Ben): concern about customers paying for unused seats. Requests token reassignment (transfer credits between users)
- **Customer communication risk** (Thibault): concern about outreach to recent customers during pricing change — risk of churn if handled poorly
- **Before/after comparison needed** (Gina): requested before/after pricing impact analysis for US customers (Persona, Whatnot, Watershed) before rollout

## External benchmarks (from Slack)

Directly relevant lessons from peer companies:

- **ElevenLabs** (Mar 27): Credits worked for self-serve ($22–$99/month) but were **abandoned for enterprise 6 months ago**. Switched to direct USD pricing per unit (characters for TTS, minutes for agents). Reason: *"credit layer creates unnecessary complication for at-scale API customers who do unit economics."* Key warning: insufficient UI updates during credit-to-dollar transition caused friction. **Directly relevant to the open question of whether enterprise API should use AWU or direct USD.**
- **Pigment** (Mar 27): Uses 1 credit = $0.10 with shared pool. Transitioning to Intelligence + Actions (same direction as Dust). Warning: **~1h/day support questions post-rollout**, weekly live Q&As needed, continuous enablement. Clay "faced operational backlash" when splitting credit types. **Plan for post-launch support load.**

# Tasks

## Timeline and staffing

JD's estimate: **4–6 weeks implementation** with 2–4 engineers, then **3–5 weeks phased rollout** with 1–2 engineers monitoring. No committed delivery date. Phase 5 (new pricing, actual revenue impact) has no timeline — blocked on open product decisions.

## Open decisions

| Decision | Blocked tasks | Owner |
| --- | --- | --- |
| **Pricing option A vs B** (AWU in code vs dimensional pricing in Metronome) | Event schema, metrics creation, rate card configuration | Founders + Eng |
| **Additive vs step/multiplicative credit model** | AWU calculation logic | spolu to confirm |
| **Tool credit weights** (exact values per category) | Rate card configuration, AWU calculation | Théo + theoG |
| **Cumulative vs costliest-tool-wins** for multi-tool messages | AWU calculation logic | Théo |
| **Intelligence markup** (exact % within 0–10% range) | Rate card configuration | Founders |
| **Sub-agent metering** (parent-only events vs per-message events) | Event emission architecture, `is_sub_agent_message` flag | Théo + Eng |
| **Seat/access model** (Viewer/User/Admin roles × Guest/Pro/Max tiers, Enterprise pool caps) | Metronome package config, seat products, subscription flow | Product |
| **Seat upgrade policy** (auto Free→Pro vs manual) | Seat management code, UX | Product |
| **Overage policy** (hard-block vs capped vs unlimited) | Limit handling, webhook handler | Product |
| **Enterprise seat structure** (seats+caps vs platform fee + pools) | Enterprise packages/contracts | Task force |

## Engineering tasks

### Workstream 0: Foundation

| Task | Description | Dependencies |
| --- | --- | --- |
| **F1. Data model** | Add `metronomePackageAlias` to `PlanModel` + `metronomeCustomerId` to `WorkspaceModel`. DB migrations. `isMetronomeBilled(plan)` helper | None |
| **F2. Plan codes** | `PRO_PLAN_METRONOME_CODE`, plan definition with `metronomePackageAlias`, seed/migration | F1 |
| **F3. Metronome API client** | `front/lib/metronome/client.ts` — ingest, customer/contract CRUD, seat edits, product listing. Config for `METRONOME_API_KEY` | None |
| **F4. Event builders** | `front/lib/metronome/events.ts` — `buildLlmUsageEvents`, `buildToolUseEvents`, gauge builders, `classifyMessageTier`, tool category mapping | F3 |
| **F5. Event emission integration** | Hook `ingestMetronomeEvents` into `recordUsageActivity` in Temporal workflow. Always-on, fire-and-forget | F3, F4 |
| **F6. Gauge events workflow** | Temporal workflow + schedule for daily `workspace_gauge` event (single event per workspace with all gauges: members, MAU, data sources, storage, features). 1h in dev, daily in prod. SKIP overlap | F3, F4 |
| **F7. Seat management library** | `front/lib/metronome/seats.ts` — add/remove/change seats, dynamic product ID resolution by name, bulk assignment | F3 |
| **F8. Subscription resource changes** | Skip Pro→Pro path for Metronome plans, `ended_backend_only` handling | F1 |

### Workstream 1: Event enhancements (depends on: F4, F5)

| Task | Description | Dependencies |
| --- | --- | --- |
| **~~E1. Add `awu_credits` to events~~** | ~~No longer needed — Metronome handles USD → AWU conversion for both options~~ | Removed |
| **E2. Add `parent_agent_message_id` to events** | Pass parent message sId to sub-agent events for cost grouping | F4 |
| **E3. Add MAU_1/5/10 gauge events** | Split single `mau` gauge into 3 events with different thresholds | F4, F6 |
| **E4. Skip Stripe usage reporting for Metronome workspaces** | `reportUsageForSubscriptionItems` + `trackProgrammaticCost`: skip when `isMetronomeBilled` | F5 |
| **E5. Remove `syncMetronomeCreditGrantToDb`** | Dead code — Metronome is single source of truth, no DB sync needed | None |

### Workstream 2: Seat management (depends on: F7, seat upgrade policy decision)

| Task | Description | Dependencies |
| --- | --- | --- |
| **S1. Add `seatType` column to membership model** | Default `"free"`. Migration to backfill existing memberships | None |
| **S2. Create Free Seat product handling in code** | Update `seats.ts`: `addMetronomeFreeSeat` (default on join), resolve "Free Seat" product ID dynamically | F7 |
| **S3. Update membership hooks** | `createMembership` → `addMetronomeFreeSeat` (not Pro). `revokeMembership` → `removeMetronomeSeat` | S1, S2, F7 |
| **S4. Admin seat type endpoint** | `PATCH /api/w/[wId]/members/[userId]/seat-type` — upgrade/downgrade Free ↔ Pro ↔ Max with Metronome seat swap | S1, S2 |
| **S5. Auto-upgrade logic (if decided)** | When Free user exhausts 300 AWU → auto-upgrade to Pro. Webhook or pre-flight check triggers upgrade | S4, seat upgrade policy decision |
| **S6. Bulk seat assignment on contract creation** | `metronome-finalize`: assign all existing members as Free seats (not Pro) | S2 |

### Workstream 3: Limit handling & webhooks (depends on: overage policy decision)

| Task | Description | Dependencies |
| --- | --- | --- |
| **L1. Metronome webhook endpoint** | `front/pages/api/metronome/webhook.ts` — handle all webhook events (alerts, credits, contract lifecycle, invoices) | None |
| **L2. Redis credit balance cache** | `front/lib/metronome/credit_balance.ts` — two-level cache: per-user seat balance + workspace pool balance. TTL ~60s | L1 |
| **L3. Pre-flight credit check in agent loop** | Before LLM call: check `hasUserSeatCredits` AND `hasWorkspacePoolCredits`. Block if both exhausted | L2 |
| **L4. Overage cap enforcement** | Configure POSTPAID commit amount as cap per contract. Enforce in pre-flight check | L3, overage policy decision |
| **L5. UX: credit exhaustion warning** | Warn at 80% of individual seat allocation. Block message with clear error when fully exhausted | L3 |

### Workstream 4: Subscription & contract provisioning (depends on: F1, F3, F7, F8)

| Task | Description | Dependencies |
| --- | --- | --- |
| **C1. Gated subscribe page (dev/testing)** | Dedicated page for internal testing of new Metronome Business plan. Not accessible to end users | None |
| **C2. Stripe setup checkout for Metronome plans** | `createMetronomeCheckoutSession`: setup mode, customer creation, no recurring subscription | F1 |
| **C3. `metronome-finalize` endpoint** | Post-checkout: provision Metronome customer + contract, assign Free seats, restore workspace | C2, S6, F3, F7 |
| **C4. Legacy contract provisioning** | Create Metronome contracts matching existing Stripe plans (legacy-pro-29, legacy-business-39). Used for Phases 2–4 migration | F3 |
| **C5. Poke upgrade to Metronome** | Mark subscription `ended_backend_only` before cancelling Stripe. Provision Metronome customer + contract | C4, F3, F8 |
| **C6. Contract management API** | `GET /metronome/contract` (seat counts, cost estimate), `DELETE` (cancel contract) | F3 |

### Workstream 5: UI (depends on: F1 for conditional rendering)

| Task | Description | Dependencies |
| --- | --- | --- |
| **U1. `MetronomeSubscriptionSection`** | Billing dashboard: Free/Pro/Max seat counts, monthly cost, seat management, cancel button | C6 |
| **U2. Subscription page conditional rendering** | Detect `metronomePackageAlias`: show Metronome section vs Stripe portal | F1 |
| **U3. Credits page (new pricing)** | Per-seat credit balance (Metronome API), workspace pool balance, purchase option | L2 |
| **U4. Usage graphs refactor** | Replace internal tracking with Metronome `/usage` APIs. Extend to all usage (per-user, per-model, per-tool) | F3 |
| **U5. Subscribe page (full rollout)** | Update `SubscribePage` with new Metronome plans for all users. Remove legacy Stripe checkout | C1, Phase 5 |
| **U6. Revenue reporting migration** | Rebuild Metabase dashboards on Metronome data (revenue recognition APIs). Required before Phase 4 | X1 |

### Workstream 6: Metronome configuration

| Task | Description | Dependencies |
| --- | --- | --- |
| **~~M1. Create new pricing metrics~~** | ~~Not needed — same metrics for legacy and new pricing. Only `LLM Provider Cost (User)` + `Tool Invocations (User)` are new, created alongside legacy metrics in M2~~ | Removed |
| **M2. Create all metrics in production** | LLM Provider Cost (Prog + User), Tool Invocations (Prog + User), Registered Users, MAU_1/5/10. Same metrics for all plans | None |
| **M3. Create all products in production** | Legacy seats, new seats (Guest/Pro/Max/Light/Standard), AI Usage (Prog + User), Tool Usage (Prog + User), AWU Credits | M2 |
| **M4. Create legacy rate cards in production** | legacy-pro-29, legacy-business-39, legacy-enterprise | M3 |
| **M5. Create new pricing rate card in production** | business-plan with AWU pricing, tool weights, seat prices | M3, tool weights decision, markup decision |
| **M6. Create packages in production** | Legacy packages + business-plan package with recurring credits (300/5,000/20,000) | M4, M5 |
| **M7. Terraform/script production deployment** | Codify Metronome objects for reproducible deployment across environments | M6 |

### Workstream 7: Migration execution

| Task | Description | Dependencies |
| --- | --- | --- |
| **X1. Shadow mode validation** | Compare Metronome shadow invoices vs Stripe invoices for all workspaces | E4, M2, M4 |
| **X2. Internal dogfood** | Enable Metronome billing on Dust's own workspace(s) with legacy contract | X1, C4, L1 |
| **X3. Controlled rollout** | Enable on 5–10 pilot workspaces (Pro + Enterprise mix) | X2 |
| **X4. Full migration** | Progressive batches: 10% → 25% → 50% → 100% at billing cycle boundaries. Freeze internal credits post-migration | X3 |
| **X5. New pricing activation** | Open gated subscribe page to all users. New signups on `business-plan` package | X4, M5, M6, all open decisions resolved |
| **X6. Cleanup** | Remove old Stripe billing code, conditional checks, legacy plan definitions. Sunset legacy contracts as customers migrate | X5 |

## Dependency graph

```
Workstream 0 (Foundation) — START HERE
  F1 (independent)  ──▶  F2 ← F1
  F3 (independent)  ──▶  F4 ← F3
                          F5 ← F3, F4
                          F6 ← F3, F4
                          F7 ← F3
  F8 ← F1

Workstream 1 (Events) ← F4, F5
  E1 ← F4, pricing option decision
  E2 ← F4
  E3 ← F4, F6
  E4 ← F5
  E5 (independent)

Workstream 2 (Seats) ← F7
  S1 (independent)
  S2 ← F7
  S3 ← S1, S2, F7
  S4 ← S1, S2
  S5 ← S4, upgrade policy decision
  S6 ← S2

Workstream 3 (Limits)
  L1 (independent)
  L2 ← L1
  L3 ← L2
  L4 ← L3, overage policy decision
  L5 ← L3

Workstream 4 (Subscription) ← F1, F3, F7, F8
  C1 (independent)
  C2 ← F1
  C3 ← C2, S6, F3, F7
  C4 ← F3
  C5 ← C4, F3, F8
  C6 ← F3

Workstream 5 (UI) ← F1
  U1 ← C6
  U2 ← F1
  U3 ← L2
  U4 ← F3
  U5 ← C1, Phase 5
  U6 ← X1

Workstream 6 (Metronome config)
  M1 ← pricing option decision
  M2 (independent)
  M3 ← M1, M2
  M4 ← M3
  M5 ← M3, tool weights, markup decisions
  M6 ← M4, M5
  M7 ← M6

Workstream 7 (Migration) — sequential
  X1 ← E4, M2, M4
  X2 ← X1, C4, L1
  X3 ← X2
  X4 ← X3
  X5 ← X4, M5, M6, all decisions
  X6 ← X5
```

## Critical path

```
F1 + F3 (foundation, no blockers — start immediately)
  → F4, F7, F8 (event builders, seats, subscription resource)
  → F5, F6 (event emission, gauge workflow)
  → E4 (skip Stripe reporting)
  → X1 (shadow validation, also needs M2 + M4)
  → X2 → X3 → X4 (migration phases)
  → X5 (new pricing, needs M5 + M6 + all decisions)

In parallel with foundation:
  M2 (legacy metrics — independent)
  L1 (webhook — independent)
  S1 (seatType column — independent)
  C1 (gated subscribe page — independent)
```

**Bottom line:** Everything starts with **F1** (data model) and **F3** (Metronome client) — these are the two root tasks with no dependencies. All other workstreams flow from them. Open product decisions (pricing option, tool weights, markup, seat model) block the new pricing rate card (M5) and Phase 5, but don't block the migration (Phases 1–4 use legacy contracts).