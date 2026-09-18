import {
  CREDIT_PRICED_ENTERPRISE_DEFAULT_PLAN_CODE,
  CREDIT_PRICED_ENTERPRISE_PILOT_PLAN_CODE,
} from "@app/lib/plans/plan_codes";
import type { MembershipSeatType } from "@app/types/memberships";

// Hardcoded pre-fill templates for the Switch Contract poke dialog. Selecting a
// template fills the form with these values; the operator can then edit any
// field before submitting. Every field is optional — an omitted field keeps the
// form's current/default value.
//
// Packages are referenced by tier (+ optional case-insensitive name substring)
// rather than by Metronome package id, since ids differ per environment; the
// dialog resolves the matching package in the resolved currency at apply time.
// Seats are keyed by seat type and merged onto the selected package's seats, so
// a seat type the package does not sell is ignored.

type PaymentFrequency =
  | "one_time"
  | "monthly"
  | "quarterly"
  | "semi_annually"
  | "annually";

type TemplatePaymentSchedule = {
  frequency: PaymentFrequency;
  periods?: number;
};

export type ContractDurationUnit = "years" | "months" | "weeks";

type TemplateSeat = {
  selected?: boolean;
  minSeats?: number;
  maxSeats?: number;
  // Per-seat rate in the currency's major units (dollars / euros); the monthly
  // rate for a monthly seat, the yearly rate for a yearly seat. Omit to keep the
  // package's default rate.
  rate?: number;
  commitmentPrice?: number;
  paymentSchedule?: TemplatePaymentSchedule;
};

export type SwitchContractTemplate = {
  id: string;
  name: string;
  description?: string;
  // Contract type. Resolved to a concrete package at apply time.
  package?: { tier: "business" | "enterprise"; namePattern?: string };
  planCode?: string;
  startMode?: "immediately" | "retroactive_first_of_month" | "select";
  // datetime-local shape ("YYYY-MM-DDTHH:mm", interpreted as UTC). Only used
  // when startMode is "select".
  startingAt?: string;
  // Sets the contract end date to start + duration (via the "Set duration"
  // toggle), which also drives the commitment period.
  duration?: { value: number; unit: ContractDurationUnit };
  // How Metronome collects Stripe invoices for the customer. `send_invoice`
  // emails the invoice for manual payment; `charge_automatically` charges the
  // card on file. Only takes effect when a Stripe customer is wired in.
  stripeCollectionMethod?: "charge_automatically" | "send_invoice";
  netPaymentTermsDays?: number;
  defaultDiscountPercent?: number;
  usageCapCredits?: number;
  // Default per-user workspace credit pool monthly limit (credits).
  defaultPoolCapCredits?: number;
  paygEnabled?: boolean;
  autoSeatUpgradeEnabled?: boolean;
  topUpEnabled?: boolean;
  autoInvoiceFinalizationEnabled?: boolean;
  promoteNoneSeatsTo?: MembershipSeatType;
  seats?: Partial<Record<MembershipSeatType, TemplateSeat>>;
  initialCredits?: {
    amountCredits: number;
    invoiceAmount: number;
    perUser?: boolean;
    paymentSchedule: TemplatePaymentSchedule;
  };
  scheduledCharge?: {
    name?: string;
    invoiceAmount: number;
    paymentSchedule: TemplatePaymentSchedule;
  };
  recurringFreeCredit?: number;
  // Promotional free leading period: reduces the seat commitment's earliest
  // bill(s) by the prorated value of this duration, so the customer pays nothing
  // for it (the granted seats are unchanged).
  offerFreePeriod?: { value: number; unit: ContractDurationUnit };
};

export const SWITCH_CONTRACT_TEMPLATES: SwitchContractTemplate[] = [
  {
    id: "enterprise-pooled",
    name: "Enterprise pooled",
    description: "Enterprise Pooled, yearly workspace seats, pooled credits.",
    package: { tier: "enterprise", namePattern: "pooled" },
    planCode: CREDIT_PRICED_ENTERPRISE_DEFAULT_PLAN_CODE,
    startMode: "select",
    stripeCollectionMethod: "send_invoice",
    seats: {
      workspace_yearly: { selected: true },
    },
  },
  {
    id: "enterprise-seat-based",
    name: "Enterprise seat-based",
    description: "Enterprise Seat-based, yearly Pro/Max per-user seats.",
    package: { tier: "enterprise", namePattern: "seat-based" },
    planCode: CREDIT_PRICED_ENTERPRISE_DEFAULT_PLAN_CODE,
    startMode: "select",
    stripeCollectionMethod: "send_invoice",
    seats: {
      pro_yearly: { selected: true },
      max_yearly: { selected: true },
    },
  },
  {
    id: "enterprise-free-pilot-2w",
    name: "Free pilot — 2 weeks",
    description:
      "Enterprise pooled, 2-week commitment, free workspace seats, 10k free credits per committed seat.",
    package: { tier: "enterprise", namePattern: "pooled" },
    planCode: CREDIT_PRICED_ENTERPRISE_PILOT_PLAN_CODE,
    startMode: "select",
    stripeCollectionMethod: "send_invoice",
    duration: { value: 2, unit: "weeks" },
    defaultPoolCapCredits: 10000,
    seats: {
      workspace_yearly: { selected: true, rate: 0 },
    },
    initialCredits: {
      amountCredits: 10000,
      invoiceAmount: 0,
      perUser: true,
      paymentSchedule: { frequency: "one_time" },
    },
  },
  {
    id: "enterprise-pilot-2m",
    name: "Paid pilot",
    description:
      "Enterprise pooled, 2-month commitment, workspace seats at 600/year, first 2 weeks free, 10k initial credits per committed seat.",
    package: { tier: "enterprise", namePattern: "pooled" },
    planCode: CREDIT_PRICED_ENTERPRISE_PILOT_PLAN_CODE,
    startMode: "select",
    stripeCollectionMethod: "send_invoice",
    duration: { value: 2, unit: "months" },
    defaultPoolCapCredits: 10000,
    // First 2 weeks offered for free.
    offerFreePeriod: { value: 2, unit: "weeks" },
    // Override the workspace-seat rate to 600/year (major units). Set the seat
    // commitment (minSeats) at apply time — the per-user initial credits below
    // scale with it.
    seats: {
      workspace_yearly: { selected: true, rate: 600 },
    },
    // 10k credits per committed seat (scaled by the workspace_yearly commitment
    // the operator enters).
    initialCredits: {
      amountCredits: 10000,
      invoiceAmount: 0,
      perUser: true,
      paymentSchedule: { frequency: "one_time" },
    },
  },
  {
    id: "partner",
    name: "Partner",
    description:
      "Partner Demo Enterprise, free pooled platform seats, monthly shared free credit pool.",
    package: { tier: "enterprise", namePattern: "partner" },
    planCode: CREDIT_PRICED_ENTERPRISE_DEFAULT_PLAN_CODE,
    startMode: "select",
    stripeCollectionMethod: "send_invoice",
    // Partner Demo entitles the monthly (pooled) workspace seat at $0.
    seats: {
      workspace: { selected: true, rate: 0 },
    },
    // Shared monthly free pool granted at the contract level; adjust per deal.
    recurringFreeCredit: 10000,
    defaultPoolCapCredits: 10000,
  },
];
