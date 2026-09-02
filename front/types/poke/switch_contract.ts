import type { MembershipSeatType } from "@app/types/memberships";
import { isMembershipSeatType } from "@app/types/memberships";
import { z } from "zod";

// Shared between the switch-contract poke plugin (server-side validation in
// `lib/api/poke/switch_contract.ts`) and the SwitchContractDialog SPA form —
// keeps validation rules for the pieces reused verbatim by both from
// drifting apart across the client/server boundary.
export const paymentScheduleSchema = z
  .object({
    frequency: z
      .enum(["one_time", "monthly", "quarterly", "semi_annually", "annually"])
      .default("one_time"),
    periods: z.number().int().min(2).max(60).optional(),
  })
  .refine(
    (s) => s.frequency === "one_time" || s.periods !== undefined,
    "periods is required when frequency is not one_time"
  )
  .default({ frequency: "one_time" });

// A pure invoice line item with no associated credit grant (e.g. a
// professional-services or setup fee), applied via Metronome's
// `add_scheduled_charges` contract edit rather than a commit.
// `invoiceAmount` is in the customer's billing currency major units
// (e.g. dollars / euros).
const scheduledChargeSchema = z.object({
  name: z.string().min(1).optional(),
  invoiceAmount: z.number().min(0, "Amount must be zero or more"),
  paymentSchedule: paymentScheduleSchema,
});

// One-off initial AWU credits granted alongside a contract switch as a
// contract-level prepaid commit. `invoiceAmount` is in the customer's
// billing currency major units (e.g. dollars / euros).
const initialCreditsSchema = z.object({
  amountCredits: z
    .number()
    .int("Initial credits must be an integer number of credits")
    .min(1, "Initial credits must be at least 1 credit"),
  invoiceAmount: z.number().min(0, "Invoice amount must be zero or more"),
  paymentSchedule: paymentScheduleSchema,
});

// Bare leaf validator for the recurring free AWU credit grant (AWU credits
// per month) — the body schema keeps this as a top-level number (no
// wrapping object, since it has no other fields), while the dialog wraps it
// in its own toggle-on/off union.
const recurringFreeCreditSchema = z
  .number()
  .int("Recurring free credit must be an integer number of AWU credits")
  .min(1, "Recurring free credit must be at least 1 credit");

// Per-seat-type settings for a contract switch, keyed by seat type (see
// `SwitchContractBodySchema.seats`). `minSeats` is the billing floor and
// `maxSeats` the hard assignment cap (omitted = no cap), both persisted to
// `workspace_seat_limits`. `rate` is the per-seat rate in the currency's MAJOR
// units (dollars / euros); the server converts it to Metronome's fiat unit via
// `metronomeAmount`. When `commitmentPrice` is set (also in major units), a
// contract prepaid commit is created granting `minSeats * rate` of contract
// credit, invoiced at `commitmentPrice`.
const seatEntrySchema = z.object({
  // Whether the seat is entitled on the new contract. `true` (the default,
  // for backward compatibility) entitles and configures the seat; `false`
  // disables a seat the package would otherwise sell. The dialog submits
  // every known seat so deselections can be turned into disable overrides.
  selected: z.boolean().default(true),
  minSeats: z.number().int().min(0, "Min seats must be ≥ 0"),
  maxSeats: z.number().int().min(1, "Max seats must be ≥ 1").optional(),
  rate: z.number().min(0, "Rate must be ≥ 0"),
  commitmentPrice: z.number().min(0, "Commitment price must be ≥ 0").optional(),
  paymentSchedule: paymentScheduleSchema,
});

export const SwitchContractBodySchema = z.object({
  planCode: z.string().min(1, "Required"),
  metronomePackageId: z.string().min(1, "Required"),
  // ISO timestamp. Used only for enterprise-tier switches; any moment is
  // accepted (including the past — backdating is allowed), and it is ceiled to
  // the next hour boundary. Omitted for Pro/Business/Free, which swap at the
  // current hour.
  startingAt: z.string().optional(),
  // Optional ISO timestamp (exclusive) at which the new contract ends. Applied
  // as a separate `v1.contracts.updateEndDate` call after provisioning.
  // Omitted leaves the contract open-ended.
  endingAt: z.string().optional(),
  // Optional. Net payment terms in days (e.g. 30 for "Net 30"): how many days
  // after invoice issuance the invoice is due. Applied to the Metronome
  // contract and only meaningful with `send_invoice`; ignored when the card on
  // file is auto-charged. Omitted leaves Metronome's account default in place.
  netPaymentTermsDays: z
    .number()
    .int("Net payment terms must be a whole number of days")
    .min(0, "Net payment terms must be ≥ 0")
    .max(365, "Net payment terms must be ≤ 365")
    .optional(),
  // Optional. Wires the contract to a Stripe customer for billing. Left
  // blank, the contract is created with no Stripe billing provider
  // configured — Metronome still raises invoices for `initialCredits`,
  // `scheduledCharge`, and any seat `commitmentPrice` as usual, they simply
  // aren't pushed to Stripe (nothing is auto-charged; reconcile manually).
  // Any package currency may be picked in that case, since there's no Stripe
  // customer currency to match against.
  stripeCustomerId: z.string().default(""),
  // How Metronome collects Stripe invoices for this customer. Only takes
  // effect when a Stripe customer is wired in. `charge_automatically` charges
  // the card on file; `send_invoice` emails the invoice for manual payment.
  stripeCollectionMethod: z
    .enum(["charge_automatically", "send_invoice"])
    .default("charge_automatically"),
  paygEnabled: z.boolean().default(false),
  // AWU credits — written directly to `credit_usage_configuration.usageCapCredits`.
  usageCapCredits: z
    .number()
    .int("Usage cap must be an integer number of credits")
    .min(1, "Usage cap must be at least 1 credit")
    .optional(),
  // Optional one-off initial AWU credits granted alongside the switch as a
  // contract-level prepaid commit (priority 300, same as purchased commits),
  // invoiced against `stripeCustomerId`. See `initialCreditsSchema`.
  initialCredits: initialCreditsSchema.optional(),
  // Optional scheduled/one-off charge, invoiced against `stripeCustomerId`.
  // See `scheduledChargeSchema`.
  scheduledCharge: scheduledChargeSchema.optional(),
  // Optional recurring free AWU credit grant, applied as a contract-level
  // (non-seat) `add_recurring_credits` edit rather than baked into a
  // package — e.g. the Partner Demo shared monthly pool
  // (dust-tt/decisions#937). Usable with any package/tier; recurs monthly,
  // for the life of the contract (no end date). Unlike `initialCredits`,
  // this is a pure credit grant with no invoice, so no Stripe customer is
  // required.
  recurringFreeCredit: recurringFreeCreditSchema.optional(),
  // Optional HubSpot deal ID. Stored on the subscription and forwarded to
  // Metronome as a custom field so contracts can be joined back to HubSpot deals
  // for ARR reporting.
  hubspotDealId: z.string().optional(),
  // Optional PO number, forwarded to Metronome as a contract-level custom
  // field for finance reconciliation against the Stripe invoices Metronome
  // generates for this contract.
  purchaseOrderId: z.string().optional(),
  // Optional: when set, memberships that would otherwise stay on `none` after
  // the seat remap (e.g. legacy members with no explicit seat) are forced onto
  // this seat type, provided the new contract bills it — preempting the
  // committed-spare promotion (see `promoteNoneSeatTypesForContract`). Used by
  // the legacy → Business migration to promote every member to a paid seat
  // (`pro` for a monthly switch, `pro_yearly` for a yearly one).
  promoteNoneSeatsTo: z
    .custom<MembershipSeatType>(isMembershipSeatType)
    .optional(),
  // Optional: when set, marks the (future-dated) contract for the legacy →
  // Business credit migration. At `contract.start`, the webhook converts the
  // workspace's remaining convertible legacy credits to AWU ($1 = 100 AWU) and
  // grants this many free AWU per workspace member — computed then, so the
  // amounts reflect the workspace's state at migration time. Stamped as the
  // `LEGACY_CREDIT_MIGRATION_CUSTOM_FIELD_KEY` custom field on the contract.
  legacyMigrationFreeAwuCreditsPerUser: z.number().int().min(0).optional(),
  // Per-seat-type settings for the new contract, keyed by seat type. See
  // `seatEntrySchema` for field semantics. Unknown seat-type keys are
  // ignored.
  seats: z.record(z.string(), seatEntrySchema).default({}),
  // Credit usage configuration — written to credit_usage_configuration before
  // provisioning so a failure aborts cleanly.
  defaultDiscountPercent: z.number().int().min(0).max(100).default(0),
  balanceThresholdCredits: z.number().int().min(0).optional(),
  defaultPoolCapCredits: z.number().int().min(0).optional(),
  programmaticMonthlyCapCredits: z.number().int().min(0).optional(),
  autoSeatUpgradeEnabled: z.boolean().default(false),
  topUpEnabled: z.boolean().default(false),
  autoInvoiceFinalizationEnabled: z.boolean().default(true),
});

export type SwitchContractBody = z.infer<typeof SwitchContractBodySchema>;
