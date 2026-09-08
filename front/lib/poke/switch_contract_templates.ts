import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  CREDIT_PRICED_ENTERPRISE_DEFAULT_PLAN_CODE,
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
  netPaymentTermsDays?: number;
  defaultDiscountPercent?: number;
  usageCapCredits?: number;
  paygEnabled?: boolean;
  autoSeatUpgradeEnabled?: boolean;
  topUpEnabled?: boolean;
  autoInvoiceFinalizationEnabled?: boolean;
  promoteNoneSeatsTo?: MembershipSeatType;
  seats?: Partial<Record<MembershipSeatType, TemplateSeat>>;
  initialCredits?: {
    amountCredits: number;
    invoiceAmount: number;
    paymentSchedule: TemplatePaymentSchedule;
  };
  scheduledCharge?: {
    name?: string;
    invoiceAmount: number;
    paymentSchedule: TemplatePaymentSchedule;
  };
  recurringFreeCredit?: number;
};

export const SWITCH_CONTRACT_TEMPLATES: SwitchContractTemplate[] = [
  {
    id: "business-annual",
    name: "Business — annual",
    description: "Business plan, starts immediately, 1-year commitment.",
    package: { tier: "business" },
    planCode: CREDIT_PRICED_BUSINESS_PLAN_CODE,
    startMode: "immediately",
    duration: { value: 1, unit: "years" },
    seats: {
      pro_yearly: { selected: true, minSeats: 10 },
    },
  },
  {
    id: "enterprise-annual",
    name: "Enterprise — annual",
    description:
      "Enterprise plan, starts immediately, 1-year commitment, prepaid credits.",
    package: { tier: "enterprise" },
    planCode: CREDIT_PRICED_ENTERPRISE_DEFAULT_PLAN_CODE,
    startMode: "immediately",
    duration: { value: 1, unit: "years" },
    initialCredits: {
      amountCredits: 100000,
      invoiceAmount: 5000,
      paymentSchedule: { frequency: "one_time" },
    },
  },
];
