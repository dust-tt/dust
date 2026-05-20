# Credit-pricing Billing page — implementation overview

The new design replaces the current "Subscription" admin page with a "Billing" page that surfaces
the Metronome-backed, credit-based pricing model (Pro / Max / Business / Enterprise tiers, AWU
credit allocations, monthly/yearly cadence, billing address, card on file, invoice history).

This doc maps the existing Metronome + credit-pricing code paths so the UI work can plug into the
data already in place, lists the gates to enable in dev, and flags the small backend gaps that
need filling before the design can be shipped end-to-end.

All paths below are relative to the hive worktree `~/code/dust/.hives/wk1/`.

---

## 1. The "show new Billing page" gate

**The real gate (per Slack discussion):**

```ts
isSubscriptionMetronomeBilled(subscription) && !isLegacyPlan(subscription.plan)
```

- `isSubscriptionMetronomeBilled` is already defined in `front/types/plan.ts` — true when the
  subscription has a `metronomeContractId` (and no `stripeSubscriptionId`).
- `isLegacyPlan` is **not yet defined** — it needs to be introduced. It must return `true` for
  current plan codes (`PRO_PLAN_SEAT_29`, `PRO_PLAN_SEAT_39`, `PRO_PLAN_LARGE_FILES`, any
  existing `ENT_*` plans created before credit-pricing) and any contract on a `legacy-*`
  Metronome package alias (`LEGACY_PRO_MONTHLY_PACKAGE_ALIAS` etc. in
  `front/lib/metronome/types.ts:19-28`). The new credit-pricing plan codes — to be introduced
  alongside the new Pro / Max / Business tiers — return `false`.

When the gate is true → show the new `/w/:wId/billing` page and hide the old
`/w/:wId/subscription` sidebar entry (or redirect from it). When false → keep the existing
`SubscriptionPage` flow untouched. Many production workspaces are *Metronome-billed but still
on legacy plans*; they must continue to see the current page until they're migrated.

### Feature flags (separate from the gate, but needed for dev)

Two flags declared in `front/types/shared/feature_flags.ts:267-325`, both `dust_only`. Neither
flag is the source of truth for the Billing-page gate above; they exist to bootstrap Metronome
billing on a workspace and to soft-gate the parallel Usage admin page.

| Flag | What it controls |
| --- | --- |
| `metronome_billing` | **Critical for dev setup.** Required for a newly-created subscription to be backed by a Metronome contract instead of a Stripe-only subscription — without it, the workspace ends up on the Stripe path and the Metronome-backed endpoints (`/metronome/contract`, `/metronome/invoice`, `/seats/plan`) return null / 400. Also gates Metronome usage event emission (`llm_usage`, `tool_use`). Default-on logic at `front/lib/api/subscription.ts:15-23` (`isMetronomeBillingEnabled`): the `global_disable_metronome_billing` kill switch turns it off globally, this flag re-enables it per workspace. |
| `metronome_billing_usage_page` | Gates the new "Usage" admin page (`UsagePage`) and its sidebar entry. Used at `front/components/navigation/config.ts:268` and inside `front/components/pages/workspace/UsagePage.tsx:152, 221`. Independent of the new Billing page — that one uses the contract-based gate above. |

### Enabling locally in dev

The full setup to get a Metronome-backed subscription on a dev workspace:

1. **Enable `metronome_billing` on the workspace** so subscription creation goes through the
   Metronome path. Also enable `metronome_billing_usage_page` the same way to see the new admin
   UI:

   ```bash
   # from the hive root
   npm -w front run script -- toggle_feature_flags \
     --enable \
     --featureFlag metronome_billing \
     --workspaceIds <wId> \
     --execute
   ```

   The script lives at `front/scripts/toggle_feature_flags.ts`. Without `--execute` it dry-runs.

2. **Upgrade through Stripe** from the current `/w/<wId>/subscription` page — Stripe is still
   the checkout collector even on the Metronome path, so this is how a Metronome customer +
   contract get provisioned for the workspace.

3. **Switch the workspace to its Metronome contract in Poke** — flip `metronomeContractId` on
   the workspace so reads pick the Metronome path (`isSubscriptionMetronomeBilled` flips to
   true). After this step `useMetronomeContract`/`useMetronomeInvoice`/`useSeatPlan` return
   data and the new Billing page has something to render.

4. **Env vars** (already in dev `.env` if Metronome works locally — confirm via `apiConfig`):
   - `METRONOME_API_KEY` → `apiConfig.getMetronomeApiKey()` (`front/lib/api/config.ts:588-593`)
   - `METRONOME_WEBHOOK_SECRET` → `apiConfig.getMetronomeWebhookSecret()`

If the workspace has no active Metronome contract yet, `getActiveContract(workspace.sId)` returns
null and several endpoints (`/seats/plan`, `/metronome/contract`, etc.) return `null` or 400 —
typically the symptom of step 3 not having been done. The `global_disable_metronome_billing` kill
switch is managed from Poke (`front/components/poke/pages/KillPage.tsx`); provisioning helpers
live at `scripts/provision_metronome_customers.ts` and `scripts/metronome_setup.ts`.

---

## 2. Where the new "Billing" page lives

A **new** page at `/w/:wId/billing`, separate from the existing `SubscriptionPage`. We do not
reuse or in-place-rewrite `SubscriptionPage` — that page must continue to serve workspaces that
fail the gate (Stripe-billed, or Metronome-billed-but-legacy).

Routing is owned by the SPA at `front-spa/src/app/routes/adminRoutes.tsx`. New + existing
routes:

| Route | Component | File |
| --- | --- | --- |
| `/w/:wId/billing` *(new)* | `BillingPage` | `front/components/pages/workspace/billing/BillingPage.tsx` *(new)* |
| `/w/:wId/subscription` | `SubscriptionPage` | `front/components/pages/workspace/subscription/SubscriptionPage.tsx` |
| `/w/:wId/subscription/manage` | `ManageSubscriptionPage` | `front/components/pages/workspace/subscription/ManageSubscriptionPage.tsx` |
| `/w/:wId/usage` | `UsagePage` (gated) | `front/components/pages/workspace/UsagePage.tsx` |

The sidebar shows exactly one of the two entries ("Billing" or "Subscription") depending on the
gate. The `/subscription` route also redirects to `/billing` when the gate is true so bookmarks
and external links keep working.

`SubscriptionPage.tsx` already wires `MetronomeSubscriptionPanel`,
`isSubscriptionMetronomeBilled`, `usePerSeatPricing`, `useSubscriptionTrialInfo`,
`useWorkspaceSeatsCount` — but those hooks live in `front/lib/swr/` and can be consumed
directly from the new `BillingPage` without depending on the old one.

---

## 3. Data sources for each design block

### 3.1 "Business — Current / Frequency / Next billing date / Amount" card

Source: `useMetronomeContract` + `useMetronomeInvoice` (in `front/lib/swr/workspaces.ts:626-686`).

| Design field | Backend |
| --- | --- |
| Plan family name (Business, Pro, Enterprise) | `contract.planFamily` from `GET /api/w/[wId]/metronome/contract` — `MetronomeContractSummary` at `front/pages/api/w/[wId]/metronome/contract.ts:19-31`. `planFamily` is `"pro" \| "enterprise"`; "Business" comes from the plan code prefix — use `isWhitelistedBusinessPlan(plan)` from `front/lib/plans/plan_codes.ts`. |
| "Current" chip | Always when `subscription.status === "active"` (`types/plan.ts:76-114`). |
| Frequency (Monthly/Yearly) | `invoice.billingPeriod` from `GET /api/w/[wId]/metronome/invoice` (`MetronomeInvoiceSummary` at `front/pages/api/w/[wId]/metronome/invoice.ts:19-36`). Currently inferred from invoice span (> 60 days → yearly), see `invoice.ts:54-57`. |
| Next billing date | `invoice.currentPeriodEndMs`. |
| Amount | `invoice.estimatedAmountCents` (cents in the contract's `invoice.currency`). Format with `getPriceAsString` from `front/lib/client/subscription.ts`. |
| "Switch to yearly to save $XXX" / Upgrade button | Reuse the existing yearly-switch flow already present in `SubscriptionPage.tsx` — see `BillingPeriod` usage and `PatchSubscriptionRequestBody` at `front/pages/api/w/[wId]/subscriptions`. Note: per-seat *yearly* pricing for Metronome contracts is still a TODO — see `front/lib/api/credits/seat_plan.ts:116` ("Add annual pricing"). |

### 3.2 "Pro plan / Max plan" seat cards

Source: `useSeatPlan` (`front/lib/swr/credits.ts:291-313`) → `GET /api/w/[wId]/seats/plan` →
`handleSeatPlanRequest` at `front/lib/api/credits/seat_plan.ts`.

The response shape (`SeatPlanResponseBody` at `seat_plan.ts:27-28`) already matches the design:

```ts
{
  pro: { awuCredits: number; priceCents: number; currency } | null,
  max: { awuCredits: number; priceCents: number; currency } | null,
}
```

| Design field | Backend |
| --- | --- |
| `$24.99 per user` | `pro.priceCents` formatted to currency. |
| `$119.99 per user` | `max.priceCents`. |
| `7,000 credits per months` | `pro.awuCredits`. Resolved from the contract's `recurring_credits` entry named `PRO_SEAT_CREDIT_NAME`. |
| `28,000 credits per months` | `max.awuCredits` (`MAX_SEAT_CREDIT_NAME`). |
| "32 seats assigned" / "12 seats assigned" | `useWorkspaceSeatsCount` → `GET /api/w/[wId]/seats/count` (returns counts by seat type — pro / max / free / workspace). The constants for seat types/AWU defaults live at `front/lib/metronome/constants.ts:163-193` (`PRO_SEAT_MONTHLY_AWU_CREDITS = 8000`, `MAX_SEAT_MONTHLY_AWU_CREDITS = 40000`). |

### 3.3 "Upgrade your workspace — Enterprise / Contact sales"

Static block. Existing `MetronomeSubscriptionPanel.tsx:44`:
`CONTACT_SALES_URL = ${config.getStaticWebsiteUrl()}/home/contact`.

### 3.4 "Billing information" (address + card)

There is **no first-party Dust endpoint** exposing the Metronome customer's billing address or
payment method today. The status quo for any "change billing" affordance is to bounce the user
through the Stripe Customer Portal.

| Design field | Backend |
| --- | --- |
| Billing address block | None yet — pick one of: (a) call `POST /api/stripe/portal` and redirect (`front/pages/api/stripe/portal.ts`) on "Change"; (b) add a new `GET /api/w/[wId]/billing/info` endpoint that retrieves the Stripe Customer object via the Metronome customer link (`getMetronomeCustomerStripeCustomerId` is already used in `front/lib/plans/stripe.ts:570`) and returns `address`, `name`, `email`, `default_payment_method`. (b) is the design-faithful path; (a) ships faster. |
| Visa / card last 4 | Same as above — Stripe `customer.invoice_settings.default_payment_method.card.last4`. |
| "Change" button | `POST /api/stripe/portal` returns `{ portalUrl }`; redirect. |

Per `[BACK16]` keep the new endpoint thin: it should live in `lib/api/billing/*` (new folder) and
return domain values, not `APIErrorWithStatusCode`.

### 3.5 "Invoices" list

Also **not exposed yet** for finalized invoices. `front/lib/metronome/client.ts:1422`
(`listMetronomeDraftInvoices`) currently filters `status: "DRAFT"` and feeds the current-period
estimate.

For the invoice history list you need a sibling helper, e.g. `listMetronomeFinalizedInvoices(...)`
that uses `status: "FINALIZED"` and returns date / amount / `invoice_pdf` URL. Surface it via a
new `GET /api/w/[wId]/metronome/invoices` endpoint that returns
`{ invoices: Array<{ id; issuedAtMs; amountCents; currency; pdfUrl }> }`.

Each invoice in Metronome carries a Stripe `invoice_metadata.stripe_invoice_id`; the "See invoice"
link should resolve to either the Stripe-hosted invoice URL or `invoice_pdf` from Stripe — easiest
is to expose the Stripe hosted URL.

---

## 4. Key code paths

### Metronome SDK & client

- `front/lib/metronome/client.ts` — `getMetronomeClient()`, `getActiveContract`,
  `getMetronomeContractById`, `listMetronomeDraftInvoices` (line 1422), `listMetronomeBalances`
  (line 1445), event ingestion.
- `front/lib/metronome/plan_type.ts` — cached `getActiveContract(workspaceId)`, invalidated by
  the Metronome webhook.
- `front/lib/metronome/contract_lifecycle.ts` — `cancelWorkspaceContractAtPeriodEnd`,
  `reactivateWorkspaceContract`.
- `front/lib/metronome/constants.ts:163-193` — seat AWU allocations and product/credit names.
- `front/lib/metronome/amounts.ts` — `amountCents(unitPrice, currency)` (Metronome quotes USD in
  cents but other currencies in whole units — always normalize via this helper).
- `front/lib/metronome/types.ts:1-162` — `MetronomePackageTier`, `BillingFrequency`,
  `classifyMetronomePackageByName`.
- `front/lib/metronome/credits.ts`, `credit_balance.ts`, `user_credit_state_machine.ts`,
  `workspace_credit_state_machine.ts` — pooled-seat credit accounting (relevant for the Usage
  page, not the Billing page itself).

### Subscription & plan glue

- `front/lib/api/subscription.ts:12-23` — `isMetronomeBillingEnabled(auth)`.
- `front/types/plan.ts:76-114` — `SubscriptionType`, `MetronomeBilledSubscriptionType`,
  `isSubscriptionMetronomeBilled(subscription)`.
- `front/lib/plans/plan_codes.ts` — `PRO_PLAN_SEAT_29_CODE`, `PRO_PLAN_SEAT_39_CODE` (Business),
  `ENT_PLAN_*`, plus `isProPlan`, `isEntreprisePlanPrefix`, `isWhitelistedBusinessPlan`,
  `isUpgraded`.
- `front/lib/plans/billing_currency.ts:61-72` — geo → currency resolution (Metronome path
  prefers EUR for EU/EEA/CH, USD elsewhere).
- `front/lib/plans/stripe.ts:570-596` — `createCustomerPortalSession`, the Stripe-portal escape
  hatch.

### Existing endpoints to reuse

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/w/[wId]/metronome/contract` | Contract summary (`planFamily`, MAU tiers, `contractEndingAtMs`, `hasSeatSubscription`). |
| PATCH | `/api/w/[wId]/metronome/contract` | Cancel / reactivate, body `{ action: "cancel" \| "reactivate" }`. |
| GET | `/api/w/[wId]/metronome/invoice` | Current period draft estimate (`billingPeriod`, `currentPeriodStartMs`, `currentPeriodEndMs`, `estimatedAmountCents`, `seatUnitPriceCents`, `mau*UnitPricesCents`). |
| GET | `/api/w/[wId]/credits/metronome-balances` | Free / committed / PAYG credit balances. |
| GET | `/api/w/[wId]/credits/awu-pool-summary` | Pooled AWU pool (Usage page; not Billing). |
| GET | `/api/w/[wId]/seats/plan` | `pro` / `max` `{ awuCredits, priceCents, currency }`. |
| GET | `/api/w/[wId]/seats/count` | Seat counts by seat type. |
| GET | `/api/w/[wId]/seats/availability` | Whether more seats can be added. |
| GET | `/api/w/[wId]/subscriptions/pricing` | Stripe-flavored per-seat pricing fallback (`usePerSeatPricing`). |
| GET | `/api/w/[wId]/subscriptions/trial-info` | Trial state. |
| PATCH | `/api/w/[wId]/subscriptions` | Trial-skip / business upgrade, body matches `PatchSubscriptionRequestBody`. |
| POST | `/api/stripe/portal` | Returns `{ portalUrl }` for Stripe Customer Portal (current "change" affordance). |

### SWR hooks already wired

- `useMetronomeContract`, `useMetronomeInvoice`, `usePerSeatPricing`, `useWorkspaceSeatsCount`,
  `useSubscriptionTrialInfo` — `front/lib/swr/workspaces.ts:578-686`.
- `useSeatPlan`, `useAwuPoolSummary`, `useAwuPurchaseInfo` — `front/lib/swr/credits.ts:227-313`.
- `useWorkspaceSeatAvailability` — `front/lib/swr/workspaces.ts:578`.
- `useFeatureFlags`, `useAuth`, `useWorkspace` — context hooks for gating and current
  subscription.

### Existing UI scaffolding

- `front/components/pages/workspace/subscription/SubscriptionPage.tsx` (628 lines) — current
  entry point, already branches on `isSubscriptionMetronomeBilled`.
- `front/components/pages/workspace/subscription/MetronomeSubscriptionPanel.tsx` (577 lines) —
  contract summary + cancel/reactivate dialogs + invoice estimate. The new design's "Business —
  Current — Frequency — Amount" card is largely this panel restyled; the Pro/Max seat cards,
  Enterprise upsell, billing info, and invoices sections are the new pieces.
- `front/components/plans/SubscriptionPlanCards.tsx` — plan cards / pricing dialogs used today.
- `front/components/workspace/MetronomeUsageChart.tsx` — Usage page chart, not on Billing.
- `front/components/poke/pages/KillPage.tsx` — where the `global_disable_metronome_billing`
  kill switch is managed.

---

## 5. Backend gaps to fill before the UI is fully wired

These are the only meaningful backend deltas — keep them small and per `[BACK16]`/`[BACK18]`
keep business logic in `lib/api/*` and HTTP shaping in handlers.

1. **Finalized invoices listing** (for the "Invoices" section):
   - Add `listMetronomeFinalizedInvoices(metronomeCustomerId)` next to
     `listMetronomeDraftInvoices` at `front/lib/metronome/client.ts:1422`, filtering
     `status: "FINALIZED"`.
   - Add `lib/api/billing/invoices.ts` with a typed mapper to
     `{ id; issuedAtMs; amountCents; currency; hostedUrl }`.
   - New endpoint `GET /api/w/[wId]/metronome/invoices` (admin-only).
   - New SWR hook `useMetronomeInvoices` in `front/lib/swr/workspaces.ts`.

2. **Billing info (address + default card)** — pick one:
   - *Lightweight*: keep "Change" buttons as a `POST /api/stripe/portal` redirect (already
     implemented). Display the address/card client-side from a new
     `GET /api/w/[wId]/billing/info` that returns `{ address, name, defaultPaymentMethod: { brand, last4 } }`
     pulled from the Stripe customer via `getMetronomeCustomerStripeCustomerId`.
   - *Inline edit*: use Stripe Elements + a new endpoint to attach payment methods. More work,
     not necessary for first cut.

3. **Annual price for seat cards**: `front/lib/api/credits/seat_plan.ts:116` carries a TODO for
   annual seat pricing (https://github.com/dust-tt/tasks/issues/8072). Until that's resolved the
   "Switch to yearly" CTA can rely on `useMetronomeInvoice().invoice.billingPeriod` for the
   *current* cadence and a coarse annual estimate, but per-seat annual prices in the cards will
   need the rate-card extension.

4. **Sidebar entry (if Option B)**: add a `billing` menu item next to `subscription` at
   `front/components/navigation/config.ts:243-291`, gated on `metronome_billing_usage_page`
   (same flag as Usage) until a dedicated flag is introduced.

---

## 6. Suggested implementation order

1. Toggle `metronome_billing_usage_page` on a dev workspace; confirm `useMetronomeContract`,
   `useMetronomeInvoice`, and `useSeatPlan` return the expected data.
2. Create `front/components/pages/workspace/billing/BillingPage.tsx` (or refactor
   `SubscriptionPage.tsx`) wiring the hooks above. Render: current-plan card → seat cards →
   Enterprise upsell → billing info → invoices.
3. Add the finalized-invoices endpoint + SWR hook, plug the Invoices section.
4. Add the billing-info endpoint (or wire "Change" to Stripe portal redirect) and plug the
   billing info section.
5. Update the SPA route table at `front-spa/src/app/routes/adminRoutes.tsx` and the sidebar
   config; ship behind the existing gate.

---

## 7. References (one-stop list)

```
front/types/shared/feature_flags.ts:267-325        Feature flag declarations
front/lib/api/subscription.ts:15-23                isMetronomeBillingEnabled
front/scripts/toggle_feature_flags.ts              Enable flag locally
front/lib/api/config.ts:588-593                    Metronome env vars
front/lib/metronome/client.ts                      SDK wrapper, draft invoices, balances
front/lib/metronome/plan_type.ts                   Cached getActiveContract
front/lib/metronome/constants.ts:163-193           Seat AWU allocations, credit/product names
front/lib/metronome/contract_lifecycle.ts          Cancel / reactivate
front/lib/api/credits/seat_plan.ts                 Pro/Max seat info source
front/lib/plans/plan_codes.ts                      Plan code constants & predicates
front/lib/plans/billing_currency.ts:61-72          Geo → currency
front/lib/plans/stripe.ts:570-596                  Customer portal session
front/types/plan.ts:76-114                         SubscriptionType + Metronome predicate
front/lib/swr/workspaces.ts:578-686                Subscription/contract/invoice SWR hooks
front/lib/swr/credits.ts:227-313                   Credit pool & seat plan SWR hooks
front/components/pages/workspace/subscription/SubscriptionPage.tsx
front/components/pages/workspace/subscription/MetronomeSubscriptionPanel.tsx
front/components/pages/workspace/UsagePage.tsx     Reference for gate usage
front/components/navigation/config.ts:240-291      Sidebar wiring (gate example)
front-spa/src/app/routes/adminRoutes.tsx           SPA route registration
front/pages/api/w/[wId]/metronome/contract.ts      GET/PATCH contract
front/pages/api/w/[wId]/metronome/invoice.ts       GET current invoice estimate
front/pages/api/w/[wId]/seats/plan.ts              Pro/Max price + credits
front/pages/api/w/[wId]/seats/count.ts             Seat counts per type
front/pages/api/stripe/portal.ts                   POST /api/stripe/portal
```
