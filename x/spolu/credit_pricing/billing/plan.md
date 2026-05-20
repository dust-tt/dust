# Credit-pricing Billing page — PR plan

Companion to `overview.md`. Splits the work into small, independently mergeable PRs that ship a
new `/w/:wId/billing` page **separate** from the existing `SubscriptionPage`. The new page is
gated on `isSubscriptionMetronomeBilled(subscription) && !isLegacyPlan(plan)`; workspaces that
fail the gate keep the existing Subscription page untouched.

Each PR is sized to be reviewable in one sitting, lands behind the gate, and leaves the app in a
working state for both gate-true and gate-false workspaces.

---

## Guiding principles

- **No edits to `SubscriptionPage.tsx` or `MetronomeSubscriptionPanel.tsx`** except trivial
  re-exports of helpers we extract. The legacy flow keeps rendering bit-for-bit identically.
- **One PR = one design block** where possible. The page assembles incrementally; until a block
  ships, render a skeleton/`<Spinner />` for that section.
- **Backend before frontend**: any new endpoint ships in its own PR with a typed handler + test
  before the UI PR that consumes it. Per `[BACK16]/[BACK18]` keep handlers thin, put logic in
  `lib/api/billing/*` returning domain types — never `APIErrorWithStatusCode`.
- **Don't introduce a feature flag for the page** — the gate is contract-based per the Slack
  decision. Local dev still requires the `metronome_billing` flag on the workspace + the Poke
  flip as documented in `overview.md`.
- **Every PR is reviewable in isolation**: include a 1-2 line `## Tests` section in the PR
  body matching the template in `AGENTS.local.md`. Use `[TEST1]/[TEST2]` factory-based
  functional tests for endpoints; add Vitest unit tests for pure helpers.

---

## PR 1 — `isLegacyPlan` + `isCreditPricingSubscription` helpers

**Goal:** give every caller a single place to ask "should this workspace see the new Billing
page?". No UI changes, no routing, no endpoints.

**Changes**
- `front/lib/plans/plan_codes.ts`
  - Add `isLegacyPlan(plan: PlanType | null | undefined): boolean`. Returns `true` for any of
    the currently-shipping plan codes (the existing `PRO_PLAN_SEAT_29_CODE`,
    `PRO_PLAN_SEAT_39_CODE`, `PRO_PLAN_LARGE_FILES_CODE`, every `ENT_*` prefix, every `FREE_*`
    code) — these are the codes that pre-date credit-pricing. Returns `false` for any new
    credit-pricing plan codes (none exist yet — they'll arrive when sales/PM publish them, at
    which point this function gets updated to know about the *new* codes too; until then
    everything is legacy).
  - Co-locate a brief comment explaining: "Legacy = pre-credit-pricing. New credit-pricing
    Pro/Max/Business/Enterprise tiers will be added to the *exclusion list* of this function
    as they're introduced."
- `front/types/plan.ts`
  - Export `isCreditPricingSubscription(subscription: SubscriptionType): boolean` that returns
    `isSubscriptionMetronomeBilled(subscription) && !isLegacyPlan(subscription.plan)`. Single
    canonical predicate the UI, sidebar, and route guards all use.

**Tests**
- Vitest unit tests for `isLegacyPlan` (each known code in/out) and
  `isCreditPricingSubscription` (Metronome+legacy, Metronome+new, Stripe+legacy, Stripe+new).

**Risk:** None. Pure additions, no callers yet.

**Why first:** every later PR consumes this predicate. Landing it standalone means later PRs
don't re-debate the gate.

---

## PR 2 — `/w/:wId/billing` route + empty `BillingPage` shell

**Goal:** stand up the new route with a placeholder so subsequent PRs only need to fill blocks.

**Changes**
- New file `front/components/pages/workspace/billing/BillingPage.tsx`. Renders the page header
  ("Billing", "Change your subscription and edit your billing information") and `null` for
  every section. Calls `useAuth()` to access the subscription; if
  `!isCreditPricingSubscription(subscription)` calls `router.replace("/w/:wId/subscription")`
  (mirroring the redirect pattern used by `UsagePage.tsx:151-155`).
- New file `front/pages/w/[wId]/billing.tsx` (Next shell, matching the pattern used by
  `front/pages/w/[wId]/subscription.tsx`).
- `front-spa/src/app/routes/adminRoutes.tsx` — register the lazy-loaded `BillingPage` at
  `path: "billing"` next to the existing `subscription` route. Follow the existing
  `withSuspense(import(...), "BillingPage")` pattern (`adminRoutes.tsx:60-65`).
- No sidebar change yet — the page is only reachable by URL.

**Tests**
- Manual: with a credit-pricing workspace, `/w/<wId>/billing` renders the title; with a
  legacy/Stripe workspace, navigating there redirects to `/subscription`.

**Risk:** Low. New file, no existing-route changes.

---

## PR 3 — Sidebar wiring + `/subscription` reverse-redirect

**Goal:** make the page discoverable and ensure exactly one of "Billing" / "Subscription" shows.

**Changes**
- `front/components/navigation/config.ts` (around `subscription` at line 285-290):
  - Add a `billing` menu entry above `subscription`, label "Billing", icon `CardIcon`, href
    `/w/${owner.sId}/billing`. Render only when
    `isCreditPricingSubscription(subscription)`.
  - Hide the existing `subscription` entry when the gate is true. The cleanest approach is a
    `hidden` boolean alongside `featureFlag` (extend the menu schema if it doesn't already
    support it) so the sidebar config stays declarative. If extending the schema feels heavy
    for one entry, filter the array at the bottom of the `if (isAdmin(owner)) { … }` block.
- `front/components/pages/workspace/subscription/SubscriptionPage.tsx` — top of the component,
  add a `useEffect` that calls `router.replace("/w/:wId/billing")` when
  `isCreditPricingSubscription(subscription)` is true. This is the *only* change to this file
  in the whole plan; it makes the redirect symmetric so deep links from anywhere land on the
  right page.

**Tests**
- Manual: credit-pricing workspace sees "Billing" in the sidebar, no "Subscription"; legacy
  workspace sees "Subscription", no "Billing"; visiting either URL on the wrong side bounces.

**Risk:** Low. Sidebar is declarative; the redirect mirrors `UsagePage`'s existing pattern.

---

## PR 4 — "Current plan" card (top block)

**Goal:** ship the first visible content on the page — the Business/Pro/Enterprise card with
"Current" chip, Frequency, Next billing date, Amount, and a disabled "Upgrade" CTA.

**Changes**
- New `front/components/pages/workspace/billing/CurrentPlanCard.tsx` consuming
  `useMetronomeContract` and `useMetronomeInvoice` from `front/lib/swr/workspaces.ts:626-686`.
  Format amounts via the existing `getPriceAsString` helper
  (`front/lib/client/subscription.ts`); show a `<Spinner />` while either hook is loading.
- Plan family label: `contract.planFamily` ("Pro" / "Enterprise") + an "Business" override when
  `isWhitelistedBusinessPlan(owner)` returns true (from `plan_codes.ts:90-95`).
- Frequency line: `invoice.billingPeriod` ("Monthly" / "Yearly").
- Next billing date: `invoice.currentPeriodEndMs` formatted with the existing `formatDate`
  helper in `MetronomeSubscriptionPanel.tsx:46-52` (extract it to a shared
  `front/lib/client/billing.ts` in this PR so we don't dupe).
- Amount: `invoice.estimatedAmountCents` (cents) → `getPriceAsString(amountCents / 100,
  currency)`.
- "Switch to yearly to save $XXX per year" subtext: render only when
  `invoice.billingPeriod === "monthly"`. CTA is **disabled with a tooltip** ("Annual pricing
  rolling out soon") for now — the actual yearly switch arrives in PR 9 once
  `seat_plan.ts:116` TODO lands.
- Wire the card into `BillingPage.tsx` (replacing the `null` placeholder).

**Tests**
- Functional test for `BillingPage` rendering with mocked SWR — assert the plan family,
  amount, and date appear. Use the existing test setup in `front/tests/`.

**Risk:** Low. All data sources exist; this is pure rendering.

---

## PR 5 — Pro / Max seat cards

**Goal:** render the two side-by-side seat cards under the current-plan block.

**Changes**
- New `front/components/pages/workspace/billing/SeatCards.tsx` consuming `useSeatPlan`
  (`front/lib/swr/credits.ts:291-313`) and `useWorkspaceSeatsCount` (in `swr/workspaces.ts`).
- Card per seat type:
  - Title "Pro plan" / "Max plan" with the existing seat-type icons (see
    `MetronomeSubscriptionPanel.tsx` and `constants.ts:163-193`).
  - `priceCents` per user formatted via `getPriceAsString`.
  - "N seats assigned" using `useWorkspaceSeatsCount` filtered by seat type.
  - "N,NNN credits per months" from `awuCredits`.
- Handle the `null` case of `useSeatPlan` (workspace not Metronome-billed). Since the page
  redirects in that case the cards should never see it, but render a safe empty state.
- Wire into `BillingPage`.

**Tests**
- Functional test asserting the two cards render with the right copy from mocked seat-plan +
  seat-count responses.

**Risk:** Low. Endpoint exists. No backend work.

---

## PR 6 — "Upgrade your workspace — Enterprise" block

**Goal:** ship the static Enterprise upsell card with "Contact sales" CTA.

**Changes**
- New `front/components/pages/workspace/billing/EnterpriseUpsellCard.tsx`. Static content; the
  CTA is an external link to `CONTACT_SALES_URL` (already defined in
  `MetronomeSubscriptionPanel.tsx:44` — extract to `front/lib/client/billing.ts` so both files
  share it).
- Wire into `BillingPage`.

**Tests**
- Snapshot/manual.

**Risk:** None.

---

## PR 7 — Backend: `GET /api/w/[wId]/billing/info`

**Goal:** expose the workspace's billing address + default card so the UI can render the
Billing-information block. This is one of the two backend gaps in `overview.md` §5.

**Changes**
- New `front/lib/api/billing/info.ts` exporting `getBillingInfo(auth): Promise<Result<BillingInfo, BillingInfoError>>`.
  - Resolves the workspace's Stripe customer through the existing
    `getMetronomeCustomerStripeCustomerId(owner.metronomeCustomerId)` helper (already used at
    `front/lib/plans/stripe.ts:570`).
  - Fetches the Stripe `customer` and its `invoice_settings.default_payment_method` (with
    `expand: ["invoice_settings.default_payment_method"]`).
  - Returns `{ address: { line1, line2, city, postalCode, country, state, name } | null,
    defaultPaymentMethod: { brand, last4 } | null }`. Never throws on missing fields;
    `null` is a valid value.
  - Domain error type `BillingInfoError` covers `"no_stripe_customer"` / `"stripe_error"`.
- New `front/pages/api/w/[wId]/billing/info.ts` — thin admin-only handler that calls the lib
  function and maps the domain error to 404 / 500.
- `lint:swagger-annotations` will require either `@swagger` or `@ignoreswagger` — start with
  `@ignoreswagger` since it's private and the public swagger surface is unaffected.

**Tests**
- Functional test (factory + supertest, per `[TEST1]/[TEST2]`) — admin GET returns shape;
  non-admin gets 403; workspace without a Stripe customer gets 404.

**Risk:** Medium. Touches Stripe. Mock Stripe in tests; verify on a real dev workspace
manually.

---

## PR 8 — "Billing information" UI block

**Goal:** wire PR 7 into the page. Surfaces address + Visa/Mastercard + last 4. "Change"
buttons POST to `/api/stripe/portal` and redirect to the returned `portalUrl` (existing
endpoint at `front/pages/api/stripe/portal.ts`).

**Changes**
- New SWR hook `useBillingInfo` in `front/lib/swr/billing.ts` (new file) following the
  `[REACT2]` pattern — abstract the GET and the POST-to-portal as colocated hooks.
- New `front/components/pages/workspace/billing/BillingInfoBlock.tsx` — renders the address
  card and the card-on-file row with two "Change" buttons. Loading state per `[REACT3]`.
- Card brand → icon: small map (visa, mastercard, amex, …) or use Sparkle's existing card
  icons if available. If not, fall back to a text label and add icons in a follow-up.

**Tests**
- Mocked SWR functional test asserting the address + last4 appear, and that clicking "Change"
  triggers a POST to `/api/stripe/portal`.

**Risk:** Low. UI on top of new endpoint.

---

## PR 9 — Backend: `GET /api/w/[wId]/metronome/invoices`

**Goal:** list finalized invoices for the Invoices section. The other backend gap from
`overview.md` §5.

**Changes**
- `front/lib/metronome/client.ts` — add `listMetronomeFinalizedInvoices(metronomeCustomerId,
  { limit })` next to `listMetronomeDraftInvoices` at line 1422. Same shape, `status:
  "FINALIZED"`. Page through results up to `limit` (default 24 — two years of monthly
  invoices is plenty for the UI; pagination is a follow-up if needed).
- New `front/lib/api/billing/invoices.ts` — `listFinalizedInvoices(auth, { limit }):
  Promise<Result<BillingInvoice[], BillingInvoicesError>>`. Maps SDK invoice → `{ id;
  issuedAtMs; amountCents; currency; hostedUrl }`. The hosted URL is the Stripe-hosted
  invoice URL pulled from `invoice.invoice_metadata.stripe_invoice_id` resolved through the
  Stripe SDK *only if cheap*; otherwise just expose Metronome's `invoice_pdf`-equivalent if
  the SDK gives us one. Pick the simpler path and document the tradeoff inline.
- New `front/pages/api/w/[wId]/metronome/invoices.ts` — thin admin-only handler.

**Tests**
- Functional test mocking the Metronome SDK list — assert shape, 403 for non-admin, empty
  array for no invoices.

**Risk:** Medium. Stripe-resolution path needs care; if the design accepts a Metronome-hosted
PDF link, this simplifies.

---

## PR 10 — "Invoices" UI block

**Goal:** wire PR 9 into the page. Surfaces the last N invoices with month / date / amount /
"See invoice" link.

**Changes**
- New SWR hook `useMetronomeInvoices` in `front/lib/swr/billing.ts` (created in PR 8).
- New `front/components/pages/workspace/billing/InvoicesBlock.tsx` — list of rows, "See
  invoice" opens `hostedUrl` in a new tab.
- Empty state: "No invoices yet" — only shown when SWR has resolved with an empty list.

**Tests**
- Functional test with mocked invoices.

**Risk:** Low.

---

## PR 11 — Annual pricing on seat cards + enable yearly switch (depends on upstream)

**Goal:** unblock the "Switch to yearly to save $XXX" CTA in PR 4 and surface annual prices on
the seat cards. Depends on `seat_plan.ts:116` TODO being resolved upstream (task #8072).

**Changes**
- Update `lib/api/credits/seat_plan.ts` so the response includes both monthly and annual price
  cents per seat (or accept that as a separate PR if owned by another stream).
- Update `BillingPage` + `SeatCards` to surface annual savings.
- Wire the "Switch to yearly" CTA to the existing
  `PATCH /api/w/[wId]/subscriptions` flow with `billingPeriod: "yearly"` — same call
  `MetronomeSubscriptionPanel.tsx` already makes for cancel/reactivate-style changes (or use
  the dedicated checkout flow if yearly switch is a re-checkout).

**Tests**
- Functional test on the patched endpoint; UI test on the new copy.

**Risk:** Medium. Couples this stream to the annual-pricing rate-card work. Land as the last
PR.

---

## PR 12 — Cleanup

**Goal:** remove duplication accrued during the cut-over.

**Changes**
- Move shared helpers introduced piecemeal (`formatDate`, `CONTACT_SALES_URL`) into
  `front/lib/client/billing.ts` and update callers in `MetronomeSubscriptionPanel.tsx` and
  `SubscriptionPage.tsx`.
- Remove anything in `MetronomeSubscriptionPanel.tsx` that's now genuinely dead because legacy
  workspaces don't use the new building blocks (none expected — the panel stays as-is for
  legacy users).
- Verify type-check passes (`npx tsgo --noEmit`) and run `npm run format:changed`.

**Tests**
- Type-check + existing test suites.

**Risk:** None.

---

## Sequencing notes

- **PR 1 → PR 2 → PR 3** unblocks everything else; ship these first, in order.
- **PR 4 / 5 / 6** are independent and can be opened in parallel.
- **PR 7 → PR 8** and **PR 9 → PR 10** are two independent two-step backend-then-frontend
  pairs; either order is fine.
- **PR 11** depends on upstream rate-card work — track separately, land last.
- **PR 12** rolls up cleanup at the end.

If at any point the new credit-pricing plan codes (the Pro/Max/Business tiers in the design)
land in `plan_codes.ts`, revisit `isLegacyPlan` from PR 1 to make sure they're correctly
excluded.

---

## Definition of done for the whole stream

- Credit-pricing workspaces (gate true) see the new Billing page; sidebar shows "Billing", not
  "Subscription"; `/subscription` redirects to `/billing`.
- Legacy / Stripe workspaces (gate false) see exactly the current Subscription page; sidebar
  shows "Subscription", not "Billing"; `/billing` redirects to `/subscription`.
- All four design sections render with real data (current plan, seat cards, Enterprise upsell,
  billing info, invoices).
- "Change" actions for address and card route to the Stripe Customer Portal.
- "See invoice" links open the Stripe-hosted invoice.
- "Switch to yearly" works (or is disabled with a clear "coming soon" tooltip if PR 11 is
  still in flight at ship time).
- Type-check, lint, and existing tests pass.
