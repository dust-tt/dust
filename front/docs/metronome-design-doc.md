# Metronome Billing Integration — Design Doc

## Context

Dust is migrating from Stripe Billing to Metronome to support credit-based pricing. Metronome sits on top of Stripe (payments/invoicing remain in Stripe). The backend sends granular usage events to Metronome; all pricing logic, rate cards, custom plans, and limits are configured in Metronome by GTM/Ops — not by engineers in the codebase.

**Current state:** Commitment signed ($30k). Metering infrastructure implemented (events flowing to Metronome). Customer provisioning script ready.

**Target:** Metronome live for selected workspaces behind feature flag, with full migration when new pricing ships (~early April).

## Architecture Overview

```
                    ┌─────────────┐
                    │  Metronome  │
                    │             │
   usage events ──▶ │  Billable   │──▶ One-off Stripe invoices
   (all workspaces) │  Metrics    │
                    │  Rate Cards │
                    │  Contracts  │
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

**Two independent concerns:**

| Concern | Scope | Gating |
|---------|-------|--------|
| **Metering** — emitting usage events to Metronome | All workspaces | `METRONOME_ENABLED` env var |
| **Billing** — using Metronome for invoicing, credits, limits | Per workspace | `metronome_billing` feature flag |

## Implemented (Block 0)

Already done and merged/ready:

- **Metronome client** (`front/lib/metronome/client.ts`): HTTP client for ingest API + customer creation
- **Event builders** (`front/lib/metronome/events.ts`): `llm_usage`, `tool_use`, `seats`, `mau` events
- **Event emission** (`front/temporal/usage_queue/activities.ts`):
  - `trackProgrammaticUsageActivity` emits `llm_usage` + `tool_use` events for ALL usage (not just programmatic)
  - `recordUsageActivity` emits `seats` + `mau` gauge events
- **Config** (`front/lib/api/config.ts`): `METRONOME_ENABLED` + `METRONOME_API_KEY` env vars
- **Customer provisioning script** (`front/scripts/provision_metronome_customers.ts`)
- **Billable metrics configured in Metronome**:
  - LLM Token Cost (SQL metric with per-model pricing, 30% markup)
  - Tool Invocations (COUNT, grouped by `internal_mcp_server_name`, `tool_name`, `origin`)
  - Active Seats (MAX gauge)
  - Monthly Active Users (MAX gauge)

## Block 1: Feature Flag + Billing Switchover

### 1.1 Add `metronome_billing` feature flag

Add to `WHITELISTABLE_FEATURES_CONFIG` in `front/types/shared/feature_flags.ts`:

```typescript
metronome_billing: {
  description: "Use Metronome for billing instead of Stripe Billing",
  stage: "on_demand",
}
```

### 1.2 Helper to check billing mode

Create `front/lib/metronome/billing_mode.ts`:

```typescript
async function isMetronomeBilled(auth: Authenticator): Promise<boolean> {
  return (
    config.isMetronomeEnabled() &&
    hasFeatureFlag(auth, "metronome_billing")
  );
}
```

This is the single source of truth for "should this workspace use Metronome for billing?" Used everywhere billing logic diverges.

### 1.3 Billing cycle switchover

When `metronome_billing` is enabled for a workspace mid-cycle, we do NOT switch immediately. Instead:

1. Admin enables `metronome_billing` FF via Poke
2. Current billing cycle continues on Stripe as normal
3. On next `customer.subscription.updated` webhook (cycle renewal):
   - Detect that workspace has `metronome_billing` FF
   - Create Metronome contract (starting at new cycle start date)
   - Cancel Stripe subscription items (keep Stripe customer for payment methods)
   - Log the switchover
4. From that point on, Metronome handles invoicing

**Modified file:** `front/pages/api/stripe/webhook.ts` — in the `customer.subscription.updated` handler, after detecting cycle change, check `isMetronomeBilled` and branch.

### 1.4 Skip Stripe usage reporting for Metronome workspaces

In `recordUsageActivity` (`front/temporal/usage_queue/activities.ts`):
- If `isMetronomeBilled(auth)`: skip `reportUsageForSubscriptionItems` (Stripe), only emit Metronome gauge events
- Otherwise: existing behavior (report to Stripe + emit Metronome events for analytics)

### 1.5 Skip programmatic credit consumption for Metronome workspaces

In `trackProgrammaticUsageActivity`:
- If `isMetronomeBilled(auth)`: skip `trackProgrammaticCost` (Dust's internal credit system), only emit Metronome events
- Otherwise: existing behavior (consume credits + emit Metronome events)

Metronome handles credit drawdown for these workspaces via contracts/commits.

## Block 2: Credit Blocking for All Usage

Today only programmatic usage is blocked when credits run out. With Metronome, ALL usage must be gated by credit balance.

### 2.1 Credit balance cache in Redis

Create `front/lib/metronome/credit_balance.ts`:

- `getMetronomeCreditBalance(workspaceSId)`: Read from Redis cache
- `setMetronomeCreditBalance(workspaceSId, balanceMicroUsd)`: Write to Redis with TTL
- `hasMetronomeCredits(workspaceSId)`: Boolean check (balance > 0)

Cache TTL: ~60 seconds. Stale data is acceptable — worst case a few messages slip through after credits hit zero.

### 2.2 Sync credit balance from Metronome

Two sync mechanisms:

**Webhook-driven (real-time):** Metronome sends `alerts.low_remaining_credit_balance_reached` → update Redis flag to "credits_exhausted". This catches the transition to zero.

**Periodic poll (fallback):** In `recordUsageActivity` (runs hourly per workspace), if `isMetronomeBilled`, call Metronome API to fetch current credit balance → update Redis cache. This handles recovery (credits purchased/renewed).

### 2.3 Pre-flight check in agent loop

Add a check early in the agent message execution path (before LLM calls):

```
if isMetronomeBilled(auth):
  if not hasMetronomeCredits(workspace.sId):
    block message with "workspace out of credits" error
```

**Where to add this:** In the agent loop entry point, alongside existing checks like `checkProgrammaticUsageLimits`. The exact location depends on where the agent loop starts — likely in the conversation API or the agent loop workflow.

**UX considerations:**
- Show a clear message: "Your workspace has run out of credits. Please purchase more or contact your admin."
- Admin vs. non-admin messaging (like existing `checkProgrammaticUsageLimits`)
- Consider a grace period or soft limit (warn at 80%, block at 0%)

### 2.4 Metronome webhook handler

Create `front/pages/api/metronome/webhook.ts`:

Handle these events (for credit blocking):

| Event | Action |
|-------|--------|
| `alerts.low_remaining_credit_balance_reached` | Update Redis: mark workspace as credits exhausted |
| `alerts.spend_threshold_reached` | Update Redis: mark workspace approaching limit |
| `commit.segment.start` | Update Redis: credits available (new period) |
| `credit.create` | Update Redis: credits available (purchase) |

Other events (for future blocks):

| Event | Action |
|-------|--------|
| `contract.start` | Activate Metronome billing for workspace |
| `contract.end` | Downgrade workspace |
| `invoice.finalized` | Log/record invoice |
| `invoice.billing_provider_error` | Alert on-call |

## Block 3: Seat Types

Today a seat is binary (active member or not). The new pricing introduces differentiated seat types with different limits and pricing.

### 3.1 Data model

Add a `seatType` field to the membership model. Options:

**Option A: Field on MembershipModel** (simpler)

New column `seat_type` on `memberships` table:

```typescript
type SeatType = "viewer" | "standard" | "power";
// Default: "standard" for backward compat
```

**Option B: Separate SeatAssignment model** (more flexible)

New model `WorkspaceSeatAssignment`:

```
- workspaceId (FK)
- userId (FK)
- seatType: SeatType
- assignedAt: Date
- assignedBy: userId (FK, nullable)
```

**Recommendation:** Option A for simplicity. Seat type is a property of the membership, not a separate entity. Migration: add column with default `"standard"`, backfill all existing memberships.

### 3.2 Seat type assignment

- Admin UI: workspace admins assign seat types to users (similar to role assignment)
- API endpoint: `PATCH /api/w/[wId]/members/[userId]` — add `seatType` field
- On assignment change: call Metronome's edit contract API to add/remove seat IDs on the corresponding subscription

### 3.3 Metronome seat-based subscriptions

Metronome natively supports **seat-based credit subscriptions** — each seat type becomes a separate subscription on the contract, with per-seat credit allocation.

**Per contract, create one subscription per seat type:**

| Seat Type | Monthly Credit per Seat | Subscription |
|---|---|---|
| `viewer` | $5 (500 cents) | Subscription A |
| `standard` | $50 (5000 cents) | Subscription B |
| `power` | $200 (20000 cents) | Subscription C |

**Seat assignment via Metronome API:**

When an admin assigns a user to a seat type:
1. Dust calls Metronome's edit contract API: `add_seat_ids: ["user-sId"]` on the corresponding seat type subscription
2. Metronome allocates the credit budget for that seat
3. Proration is handled automatically if mid-cycle

When a user changes seat type:
1. `remove_seat_ids: ["user-sId"]` from old subscription + `add_unassigned_seats: 1` (to maintain capacity)
2. `add_seat_ids: ["user-sId"]` on new subscription

**Per-seat credit tracking:**

Usage events already include `user_id` (the user's sId). Metronome matches usage to seats via the user ID and draws down from that seat's credit balance. For programmatic usage (API keys), `user_id` is null — this usage draws from workspace-level credits/commits, not per-seat credits.

**Monitoring:**
- `low_remaining_seat_balance_reached` webhook alerts when a seat's credits are low
- `/contracts/seatBalances/list` API to query per-seat balances (for UI display)

### 3.4 Events for seat types

**Usage events (already implemented):**

`llm_usage` and `tool_use` events include `user_id` when available (user-initiated usage). Metronome uses this to attribute usage to the correct seat. Programmatic usage (no user) is billed at workspace level.

**Gauge events (for billing seat subscriptions):**

The existing `seats` gauge continues to report total seat count. Metronome's seat-based subscriptions track per-type counts internally (via `add_seat_ids`/`remove_seat_ids`), so we don't need to emit per-type gauge events — Metronome is the source of truth for seat assignments.

### 3.5 Per-seat-type feature limits

Each seat type defines feature access:

```typescript
const SEAT_TYPE_LIMITS: Record<SeatType, {
  creditBudgetCentsPerMonth: number;   // per-seat credit allocation
  allowedFeatures: string[];           // e.g., ["deep_research", "actions"]
}> = {
  viewer:   { creditBudgetCentsPerMonth: 500,   allowedFeatures: ["retrieval"] },
  standard: { creditBudgetCentsPerMonth: 5000,  allowedFeatures: ["retrieval", "actions"] },
  power:    { creditBudgetCentsPerMonth: 20000,  allowedFeatures: ["retrieval", "actions", "deep_research", "autonomous"] },
};
```

**Where to enforce:**
- Message limit: Pre-flight check in agent loop (alongside credit check)
- Feature limits: In MCP server `isRestricted` checks (extend to check user's seat type, similar to how plan limits + feature flags work today)

**Open question:** Should these limits live in code or in Metronome? If in Metronome, the backend queries Metronome for the user's entitlements. If in code, it's faster but requires deploys to change. Recommendation: start in code (faster enforcement), move to Metronome later when the pricing stabilizes.

## Block 4: Metronome Contract Provisioning

### 4.1 New workspace signup (Metronome-billed)

When a new workspace completes checkout:

1. `checkout.session.completed` webhook fires (stays in Stripe)
2. Create Metronome customer (with Stripe customer ID linked)
3. Create Metronome contract with:
   - Rate card (determines pricing)
   - Billing period (monthly)
   - Initial commits/credits (free tier, purchased, etc.)
4. Enable `metronome_billing` FF
5. No Stripe subscription created (Metronome handles billing)

### 4.2 Existing workspace migration

For workspaces switching from Stripe to Metronome:

1. Enable `metronome_billing` FF
2. Wait for current Stripe billing cycle to end
3. On cycle renewal webhook: create Metronome contract, cancel Stripe subscription
4. Metronome takes over billing from next period

### 4.3 Contract configuration

Metronome contracts need:

| Component | Maps to |
|-----------|---------|
| Rate card | Plan pricing (per-seat rates, per-model token rates, per-tool rates) |
| Commits (prepaid) | Purchased credits (committed credits) |
| Credits (free) | Free tier credits (bracketed by user count) |
| Scheduled charges | Fixed platform fees |
| Usage filters | Per-workspace usage isolation (already handled by `customer_id`) |

## Block 5: Webhook Rewrite

### 5.1 New Metronome webhook endpoint

`front/pages/api/metronome/webhook.ts`

Handles Metronome-specific events (see Block 2.4 for the event list).

### 5.2 Modified Stripe webhook

`front/pages/api/stripe/webhook.ts` — for Metronome-billed workspaces:

| Stripe Event | Current behavior | Metronome-billed behavior |
|---|---|---|
| `checkout.session.completed` | Create subscription | Create Metronome customer + contract (no Stripe subscription) |
| `invoice.paid` | Grant free credits | No-op (Metronome handles credits) |
| `invoice.payment_failed` | Email admins, track failure | Keep as-is (Stripe still collects payment) |
| `customer.subscription.updated` | Report usage, allocate PAYG | Trigger switchover if mid-migration; otherwise no-op |
| `customer.subscription.deleted` | End subscription, schedule scrub | No-op (contract.end handles this) |

### 5.3 Stripe events that stay unchanged

- `charge.dispute.created` — disputes are Stripe-level
- `invoice.payment_failed` — payment retries are Stripe-level
- `invoice.voided` — for non-Metronome workspaces

## Implementation Sequence

```
Block 0: Metering infrastructure           ✅ Done
    │
    ▼
Block 1: Feature flag + billing switchover  ← Start here
    │
    ├──▶ Block 2: Credit blocking           (can parallel with Block 3)
    │
    ├──▶ Block 3: Seat types                (can parallel with Block 2)
    │
    ▼
Block 4: Contract provisioning              (depends on Block 1)
    │
    ▼
Block 5: Webhook rewrite                    (depends on Block 4)
    │
    ▼
Migration: Roll out to workspaces behind FF
    │
    ▼
Cleanup: Remove old Stripe billing code
```

**Parallelization:** Blocks 2 and 3 can be worked on simultaneously by different engineers. Block 1 is the prerequisite for everything else. Blocks 4 and 5 are sequential.

## Open Questions

1. **Checkout flow**: Does Stripe Checkout stay for payment method capture, or do we build a custom checkout? Recommendation: keep Stripe Checkout, provision Metronome contract from the webhook.

2. **Seat type definitions**: What are the exact types and their limits? Depends on Pricing Push output (expected early April).

3. **Grace period on credit exhaustion**: Should we hard-block immediately when credits hit zero, or allow a grace period (e.g., 24h or $X overage)? Metronome supports overage billing natively.

4. **Free tier**: Do free workspaces get a Metronome customer? Probably not — they have no Stripe customer. Gate Metronome customer creation behind paid subscription.

5. **Historical data backfill**: Metronome cannot apply new billable metrics to historical data. We're already sending events, so data accumulates from now. If pricing decisions need historical analysis, we have Elasticsearch data.

## Files Modified/Created

| File | Status | Block |
|------|--------|-------|
| `front/lib/metronome/client.ts` | Created | 0 |
| `front/lib/metronome/events.ts` | Created | 0 |
| `front/lib/api/config.ts` | Modified | 0 |
| `front/lib/plans/usage/mau.ts` | Modified | 0 |
| `front/temporal/usage_queue/activities.ts` | Modified | 0 |
| `front/scripts/provision_metronome_customers.ts` | Created | 0 |
| `front/types/shared/feature_flags.ts` | To modify | 1 |
| `front/lib/metronome/billing_mode.ts` | To create | 1 |
| `front/lib/metronome/credit_balance.ts` | To create | 2 |
| `front/pages/api/metronome/webhook.ts` | To create | 2, 5 |
| `front/lib/models/membership.ts` (or new model) | To modify | 3 |
| `front/pages/api/stripe/webhook.ts` | To modify | 4, 5 |
