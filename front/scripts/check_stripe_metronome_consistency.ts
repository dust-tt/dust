/**
 * Compare Stripe billing with Metronome shadow billing for each workspace.
 *
 * For every workspace that has both a Stripe subscription and a Metronome
 * contract, fetch:
 * - the last finalized Stripe invoice for the subscription
 * - the Metronome invoices covering the same billing period
 *
 * Extracts seats (PER_SEAT) and MAU (MAU_*) line items from each side and
 * writes one CSV row per workspace.
 *
 * In addition, for every workspace with a Metronome customer, list its active
 * credits from the Dust DB, look up the matching Metronome credit/commit, and
 * compare initial + remaining amounts. Writes a second CSV (one row per
 * Dust credit, plus one row per Metronome credit/commit not linked to any
 * active Dust credit).
 *
 * Run with:
 *   npx tsx scripts/check_stripe_metronome_consistency.ts \
 *     [--workspaceId <sId>] [--output <path>] [--creditsOutput <path>] --execute
 */

import { Authenticator } from "@app/lib/auth";
import {
  getMetronomeClient,
  listMetronomeCustomerCommits,
  listMetronomeCustomerCredits,
} from "@app/lib/metronome/client";
import {
  getProductMauTierIds,
  getProductWorkspaceSeatId,
} from "@app/lib/metronome/constants";
import { getStripeClient, getStripeSubscription } from "@app/lib/plans/stripe";
import { isMauReportUsage } from "@app/lib/plans/usage/types";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { Logger } from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type Metronome from "@metronome/sdk";
import type { Commit, Credit } from "@metronome/sdk/resources";
import { stringify } from "csv-stringify/sync";
import { writeFileSync } from "fs";
import type { Stripe } from "stripe";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

type StripeBreakdown = {
  invoiceId: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  seatsQuantity: number;
  seatsUnitAmountCents: number;
  seatsTotalCents: number;
  mauTier: string;
  mauQuantity: number;
  mauUnitAmountCents: number;
  mauTotalCents: number;
};

type MetronomeBreakdown = {
  invoiceIds: string[];
  periodStart: Date | null;
  periodEnd: Date | null;
  seatsQuantity: number;
  seatsUnitAmountCents: number;
  seatsTotalCents: number;
  mauTiersHit: string[];
  mauQuantity: number;
  mauTotalCents: number;
};

type Row = {
  workspaceId: string;
  workspaceName: string;
  stripeSubscriptionId: string;
  metronomeContractId: string;
  metronomeCustomerId: string;
  // Stripe.
  stripeInvoiceId: string;
  stripeInvoicePeriodStart: string;
  stripeInvoicePeriodEnd: string;
  stripeCurrency: string;
  stripeSeatsQuantity: string;
  stripeSeatsUnitAmountCents: string;
  stripeSeatsTotalCents: string;
  stripeMauTier: string;
  stripeMauQuantity: string;
  stripeMauUnitAmountCents: string;
  stripeMauTotalCents: string;
  // Metronome.
  metronomeInvoiceIds: string;
  metronomeInvoicePeriodStart: string;
  metronomeInvoicePeriodEnd: string;
  metronomeSeatsQuantity: string;
  metronomeSeatsUnitAmountCents: string;
  metronomeSeatsTotalCents: string;
  metronomeMauTiers: string;
  metronomeMauQuantity: string;
  metronomeMauTotalCents: string;
  // Diff.
  seatsMatch: string;
  mauTotalMatch: string;
  status: string;
  notes: string;
};

const CSV_COLUMNS: Array<keyof Row> = [
  "workspaceId",
  "workspaceName",
  "stripeSubscriptionId",
  "metronomeContractId",
  "metronomeCustomerId",
  "stripeInvoiceId",
  "stripeInvoicePeriodStart",
  "stripeInvoicePeriodEnd",
  "stripeCurrency",
  "stripeSeatsQuantity",
  "stripeSeatsUnitAmountCents",
  "stripeSeatsTotalCents",
  "stripeMauTier",
  "stripeMauQuantity",
  "stripeMauUnitAmountCents",
  "stripeMauTotalCents",
  "metronomeInvoiceIds",
  "metronomeInvoicePeriodStart",
  "metronomeInvoicePeriodEnd",
  "metronomeSeatsQuantity",
  "metronomeSeatsUnitAmountCents",
  "metronomeSeatsTotalCents",
  "metronomeMauTiers",
  "metronomeMauQuantity",
  "metronomeMauTotalCents",
  "seatsMatch",
  "mauTotalMatch",
  "status",
  "notes",
];

type CreditRow = {
  workspaceId: string;
  workspaceName: string;
  metronomeCustomerId: string;
  // Dust credit columns.
  creditId: string;
  creditType: string;
  creditStartDate: string;
  creditExpirationDate: string;
  creditInitialAmountMicroUsd: string;
  creditConsumedAmountMicroUsd: string;
  creditRemainingMicroUsd: string;
  creditMetronomeCreditId: string;
  // Metronome counterpart.
  metronomeKind: string; // "credit" | "commit" | ""
  metronomeProductId: string;
  metronomeInitialAmountMicroUsd: string;
  metronomeBalanceMicroUsd: string;
  // Diff.
  initialMatch: string;
  remainingMatch: string;
  status: string;
  notes: string;
};

const CREDIT_CSV_COLUMNS: Array<keyof CreditRow> = [
  "workspaceId",
  "workspaceName",
  "metronomeCustomerId",
  "creditId",
  "creditType",
  "creditStartDate",
  "creditExpirationDate",
  "creditInitialAmountMicroUsd",
  "creditConsumedAmountMicroUsd",
  "creditRemainingMicroUsd",
  "creditMetronomeCreditId",
  "metronomeKind",
  "metronomeProductId",
  "metronomeInitialAmountMicroUsd",
  "metronomeBalanceMicroUsd",
  "initialMatch",
  "remainingMatch",
  "status",
  "notes",
];

// Metronome invoice periods may not align perfectly with Stripe's
// (e.g. partial-hour boundaries). Allow a 36h slack window.
const PERIOD_MATCH_TOLERANCE_MS = 36 * 60 * 60 * 1000;

// Dust DB stores microUsd. Metronome stores major units (USD). Convert with
// rounding to absorb floating-point noise.
function dollarsToMicroUsd(amount: number): number {
  return Math.round(amount * 1_000_000);
}

function sumScheduleAmount(entry: Credit | Commit): number {
  const items = entry.access_schedule?.schedule_items ?? [];
  let total = 0;
  for (const item of items) {
    total += item.amount;
  }
  return total;
}

async function getLastFinalizedStripeInvoice(
  stripeSubscriptionId: string
): Promise<Stripe.Invoice | null> {
  const stripe = getStripeClient();
  // Most recent first; expand prices so we can read REPORT_USAGE metadata.
  const page = await stripe.invoices.list({
    subscription: stripeSubscriptionId,
    status: "paid",
    limit: 10,
    expand: ["data.lines.data.price"],
  });

  // Stripe returns newest first by default. Filter to subscription cycle / create
  // / update so we don't pick a one-off credit purchase invoice.
  const candidates = page.data.filter(
    (inv) =>
      inv.billing_reason === "subscription_cycle" ||
      inv.billing_reason === "subscription_create" ||
      inv.billing_reason === "subscription_update"
  );

  return candidates[0] ?? null;
}

function extractStripeBreakdown(invoice: Stripe.Invoice): StripeBreakdown {
  const breakdown: StripeBreakdown = {
    invoiceId: invoice.id,
    periodStart: new Date((invoice.period_start ?? 0) * 1000),
    periodEnd: new Date((invoice.period_end ?? 0) * 1000),
    currency: invoice.currency,
    seatsQuantity: 0,
    seatsUnitAmountCents: 0,
    seatsTotalCents: 0,
    mauTier: "",
    mauQuantity: 0,
    mauUnitAmountCents: 0,
    mauTotalCents: 0,
  };

  for (const line of invoice.lines.data) {
    const price = line.price;
    if (!price) {
      continue;
    }
    const reportUsage = price.metadata?.REPORT_USAGE;
    const unitAmountCents = Number(
      price.unit_amount ?? price.unit_amount_decimal ?? 0
    );
    const quantity = line.quantity ?? 0;
    const amountCents = line.amount ?? 0;

    if (reportUsage === "PER_SEAT") {
      breakdown.seatsQuantity += quantity;
      // Multiple PER_SEAT lines (proration) — keep the most recent unit price.
      breakdown.seatsUnitAmountCents = unitAmountCents;
      breakdown.seatsTotalCents += amountCents;
    } else if (isMauReportUsage(reportUsage)) {
      breakdown.mauTier = reportUsage;
      breakdown.mauQuantity += quantity;
      breakdown.mauUnitAmountCents = unitAmountCents;
      breakdown.mauTotalCents += amountCents;
    }
  }

  return breakdown;
}

async function listMetronomeInvoicesForPeriod({
  metronomeCustomerId,
  periodStart,
  periodEnd,
}: {
  metronomeCustomerId: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<Metronome.V1.Customers.Invoice[]> {
  const client = getMetronomeClient();

  // List finalized invoices in a window covering the Stripe period.
  // The Metronome filter applies to billing period, not issue date.
  const startingOn = new Date(
    periodStart.getTime() - PERIOD_MATCH_TOLERANCE_MS
  ).toISOString();
  const endingBefore = new Date(
    periodEnd.getTime() + PERIOD_MATCH_TOLERANCE_MS
  ).toISOString();

  const invoices: Metronome.V1.Customers.Invoice[] = [];
  for await (const invoice of client.v1.customers.invoices.list({
    customer_id: metronomeCustomerId,
    status: "FINALIZED",
    starting_on: startingOn,
    ending_before: endingBefore,
    sort: "date_desc",
  })) {
    invoices.push(invoice);
  }

  // Keep only invoices whose period roughly matches the Stripe period.
  return invoices.filter((inv) => {
    if (!inv.start_timestamp || !inv.end_timestamp) {
      return false;
    }
    const invStart = new Date(inv.start_timestamp).getTime();
    const invEnd = new Date(inv.end_timestamp).getTime();
    return (
      Math.abs(invStart - periodStart.getTime()) <= PERIOD_MATCH_TOLERANCE_MS &&
      Math.abs(invEnd - periodEnd.getTime()) <= PERIOD_MATCH_TOLERANCE_MS
    );
  });
}

// Metronome reports fiat invoice amounts in the major currency unit
// (e.g. dollars/euros), while Stripe reports in the minor unit (cents).
// Convert to cents so we can compare like-for-like. Round to handle the
// occasional sub-cent floating-point dust.
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function extractMetronomeBreakdown(
  invoices: Metronome.V1.Customers.Invoice[]
): MetronomeBreakdown {
  const breakdown: MetronomeBreakdown = {
    invoiceIds: [],
    periodStart: null,
    periodEnd: null,
    seatsQuantity: 0,
    seatsUnitAmountCents: 0,
    seatsTotalCents: 0,
    mauTiersHit: [],
    mauQuantity: 0,
    mauTotalCents: 0,
  };

  const seatProductId = getProductWorkspaceSeatId();
  const mauTierIds = new Set(getProductMauTierIds());

  for (const invoice of invoices) {
    breakdown.invoiceIds.push(invoice.id);
    if (invoice.start_timestamp) {
      const start = new Date(invoice.start_timestamp);
      if (!breakdown.periodStart || start < breakdown.periodStart) {
        breakdown.periodStart = start;
      }
    }
    if (invoice.end_timestamp) {
      const end = new Date(invoice.end_timestamp);
      if (!breakdown.periodEnd || end > breakdown.periodEnd) {
        breakdown.periodEnd = end;
      }
    }

    for (const line of invoice.line_items) {
      if (!line.product_id) {
        continue;
      }
      if (line.product_id === seatProductId) {
        breakdown.seatsQuantity += line.quantity ?? 0;
        if (line.unit_price !== undefined) {
          breakdown.seatsUnitAmountCents = toCents(line.unit_price);
        }
        breakdown.seatsTotalCents += toCents(line.total);
      } else if (mauTierIds.has(line.product_id)) {
        const tierIndex = getProductMauTierIds().indexOf(line.product_id);
        const tierName = `MAU_TIER_${tierIndex + 1}`;
        if (!breakdown.mauTiersHit.includes(tierName)) {
          breakdown.mauTiersHit.push(tierName);
        }
        breakdown.mauQuantity += line.quantity ?? 0;
        breakdown.mauTotalCents += toCents(line.total);
      }
    }
  }

  return breakdown;
}

function buildEmptyRow(workspace: LightWorkspaceType): Row {
  return {
    workspaceId: workspace.sId,
    workspaceName: workspace.name,
    stripeSubscriptionId: "",
    metronomeContractId: "",
    metronomeCustomerId: workspace.metronomeCustomerId ?? "",
    stripeInvoiceId: "",
    stripeInvoicePeriodStart: "",
    stripeInvoicePeriodEnd: "",
    stripeCurrency: "",
    stripeSeatsQuantity: "",
    stripeSeatsUnitAmountCents: "",
    stripeSeatsTotalCents: "",
    stripeMauTier: "",
    stripeMauQuantity: "",
    stripeMauUnitAmountCents: "",
    stripeMauTotalCents: "",
    metronomeInvoiceIds: "",
    metronomeInvoicePeriodStart: "",
    metronomeInvoicePeriodEnd: "",
    metronomeSeatsQuantity: "",
    metronomeSeatsUnitAmountCents: "",
    metronomeSeatsTotalCents: "",
    metronomeMauTiers: "",
    metronomeMauQuantity: "",
    metronomeMauTotalCents: "",
    seatsMatch: "",
    mauTotalMatch: "",
    status: "",
    notes: "",
  };
}

async function checkInvoiceConsistency(
  workspace: LightWorkspaceType,
  logger: Logger
): Promise<Row | null> {
  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );

  if (!subscription) {
    return null;
  }

  const { stripeSubscriptionId, metronomeContractId } = subscription;
  const { metronomeCustomerId } = workspace;

  // Only output rows for workspaces where both billing systems are linked.
  if (!stripeSubscriptionId || !metronomeContractId || !metronomeCustomerId) {
    return null;
  }

  const row = buildEmptyRow(workspace);
  row.stripeSubscriptionId = stripeSubscriptionId;
  row.metronomeContractId = metronomeContractId;
  row.metronomeCustomerId = metronomeCustomerId;

  let stripeBreakdown: StripeBreakdown | null = null;

  try {
    const stripeSubscription =
      await getStripeSubscription(stripeSubscriptionId);
    if (!stripeSubscription) {
      row.status = "missing_stripe_subscription";
      return row;
    }

    const invoice = await getLastFinalizedStripeInvoice(stripeSubscriptionId);
    if (!invoice) {
      row.status = "missing_stripe_invoice";
      return row;
    }

    stripeBreakdown = extractStripeBreakdown(invoice);
    row.stripeInvoiceId = stripeBreakdown.invoiceId;
    row.stripeInvoicePeriodStart = stripeBreakdown.periodStart.toISOString();
    row.stripeInvoicePeriodEnd = stripeBreakdown.periodEnd.toISOString();
    row.stripeCurrency = stripeBreakdown.currency;
    row.stripeSeatsQuantity = String(stripeBreakdown.seatsQuantity);
    row.stripeSeatsUnitAmountCents = String(
      stripeBreakdown.seatsUnitAmountCents
    );
    row.stripeSeatsTotalCents = String(stripeBreakdown.seatsTotalCents);
    row.stripeMauTier = stripeBreakdown.mauTier;
    row.stripeMauQuantity = String(stripeBreakdown.mauQuantity);
    row.stripeMauUnitAmountCents = String(stripeBreakdown.mauUnitAmountCents);
    row.stripeMauTotalCents = String(stripeBreakdown.mauTotalCents);
  } catch (err) {
    const error = normalizeError(err);
    logger.warn(
      { workspaceId: workspace.sId, err: error.message },
      "[Consistency] Failed to fetch Stripe data"
    );
    row.status = "stripe_error";
    row.notes = error.message;
    return row;
  }

  let metronomeInvoices: Metronome.V1.Customers.Invoice[] = [];
  try {
    metronomeInvoices = await listMetronomeInvoicesForPeriod({
      metronomeCustomerId,
      periodStart: stripeBreakdown.periodStart,
      periodEnd: stripeBreakdown.periodEnd,
    });
  } catch (err) {
    const error = normalizeError(err);
    logger.warn(
      { workspaceId: workspace.sId, err: error.message },
      "[Consistency] Failed to fetch Metronome invoices"
    );
    row.status = "metronome_error";
    row.notes = error.message;
    return row;
  }

  if (metronomeInvoices.length === 0) {
    row.status = "missing_metronome_invoice";
    return row;
  }

  const metronomeBreakdown = extractMetronomeBreakdown(metronomeInvoices);
  row.metronomeInvoiceIds = metronomeBreakdown.invoiceIds.join("|");
  row.metronomeInvoicePeriodStart =
    metronomeBreakdown.periodStart?.toISOString() ?? "";
  row.metronomeInvoicePeriodEnd =
    metronomeBreakdown.periodEnd?.toISOString() ?? "";
  row.metronomeSeatsQuantity = String(metronomeBreakdown.seatsQuantity);
  row.metronomeSeatsUnitAmountCents = String(
    metronomeBreakdown.seatsUnitAmountCents
  );
  row.metronomeSeatsTotalCents = String(metronomeBreakdown.seatsTotalCents);
  row.metronomeMauTiers = metronomeBreakdown.mauTiersHit.join("|");
  row.metronomeMauQuantity = String(metronomeBreakdown.mauQuantity);
  row.metronomeMauTotalCents = String(metronomeBreakdown.mauTotalCents);

  const seatsMatch =
    stripeBreakdown.seatsQuantity === metronomeBreakdown.seatsQuantity &&
    stripeBreakdown.seatsTotalCents === metronomeBreakdown.seatsTotalCents;
  const mauTotalMatch =
    stripeBreakdown.mauTotalCents === metronomeBreakdown.mauTotalCents;

  row.seatsMatch = seatsMatch ? "yes" : "no";
  row.mauTotalMatch = mauTotalMatch ? "yes" : "no";

  if (seatsMatch && mauTotalMatch) {
    row.status = "ok";
  } else if (!seatsMatch && !mauTotalMatch) {
    row.status = "mismatch_seats_and_mau";
  } else if (!seatsMatch) {
    row.status = "mismatch_seats";
  } else {
    row.status = "mismatch_mau";
  }

  return row;
}

function buildEmptyCreditRow(
  workspace: LightWorkspaceType,
  metronomeCustomerId: string
): CreditRow {
  return {
    workspaceId: workspace.sId,
    workspaceName: workspace.name,
    metronomeCustomerId,
    creditId: "",
    creditType: "",
    creditStartDate: "",
    creditExpirationDate: "",
    creditInitialAmountMicroUsd: "",
    creditConsumedAmountMicroUsd: "",
    creditRemainingMicroUsd: "",
    creditMetronomeCreditId: "",
    metronomeKind: "",
    metronomeProductId: "",
    metronomeInitialAmountMicroUsd: "",
    metronomeBalanceMicroUsd: "",
    initialMatch: "",
    remainingMatch: "",
    status: "",
    notes: "",
  };
}

async function checkCreditConsistency(
  workspace: LightWorkspaceType,
  logger: Logger
): Promise<CreditRow[]> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return [];
  }

  // Active credits in Dust DB: started, not expired, not fully consumed.
  let activeCredits: CreditResource[] = [];
  try {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    activeCredits = await CreditResource.listActive(auth);
  } catch (err) {
    const error = normalizeError(err);
    logger.warn(
      { workspaceId: workspace.sId, err: error.message },
      "[Consistency] Failed to list active credits"
    );
    const row = buildEmptyCreditRow(workspace, metronomeCustomerId);
    row.status = "db_error";
    row.notes = error.message;
    return [row];
  }

  // Pull Metronome credits + commits once, with balance, so we can also
  // surface metronome-only entries (orphans not linked to any DB credit).
  let metronomeCredits: Credit[] = [];
  let metronomeCommits: Commit[] = [];
  try {
    const [creditsRes, commitsRes] = await Promise.all([
      listMetronomeCustomerCredits({
        metronomeCustomerId,
        includeContractCredits: true,
        includeBalance: true,
        coveringDate: new Date().toISOString(),
      }),
      listMetronomeCustomerCommits({
        metronomeCustomerId,
        includeContractCommits: true,
        includeBalance: true,
        coveringDate: new Date().toISOString(),
      }),
    ]);
    if (creditsRes.isErr()) {
      throw creditsRes.error;
    }
    if (commitsRes.isErr()) {
      throw commitsRes.error;
    }
    metronomeCredits = creditsRes.value;
    metronomeCommits = commitsRes.value;
  } catch (err) {
    const error = normalizeError(err);
    logger.warn(
      { workspaceId: workspace.sId, err: error.message },
      "[Consistency] Failed to list Metronome credits/commits"
    );
    const row = buildEmptyCreditRow(workspace, metronomeCustomerId);
    row.status = "metronome_error";
    row.notes = error.message;
    return [row];
  }

  const creditsById = new Map(metronomeCredits.map((c) => [c.id, c]));
  const commitsById = new Map(metronomeCommits.map((c) => [c.id, c]));
  const matchedMetronomeIds = new Set<string>();

  const rows: CreditRow[] = [];

  for (const credit of activeCredits) {
    const row = buildEmptyCreditRow(workspace, metronomeCustomerId);
    row.creditId = credit.sId;
    row.creditType = credit.type;
    row.creditStartDate = credit.startDate?.toISOString() ?? "";
    row.creditExpirationDate = credit.expirationDate?.toISOString() ?? "";
    row.creditInitialAmountMicroUsd = String(credit.initialAmountMicroUsd);
    row.creditConsumedAmountMicroUsd = String(credit.consumedAmountMicroUsd);
    const remainingMicroUsd =
      credit.initialAmountMicroUsd - credit.consumedAmountMicroUsd;
    row.creditRemainingMicroUsd = String(remainingMicroUsd);
    row.creditMetronomeCreditId = credit.metronomeCreditId ?? "";

    // payg / excess credits don't have a Metronome counterpart by design.
    if (credit.type === "payg" || credit.type === "excess") {
      row.status = "not_applicable";
      rows.push(row);
      continue;
    }

    if (!credit.metronomeCreditId) {
      row.status = "missing_metronome_id";
      rows.push(row);
      continue;
    }

    // metronomeCreditId may point at either a credit (free) or a commit
    // (committed). Try both.
    const metronomeCredit = creditsById.get(credit.metronomeCreditId);
    const metronomeCommit = commitsById.get(credit.metronomeCreditId);
    const metronomeEntry: Credit | Commit | undefined =
      metronomeCredit ?? metronomeCommit;

    if (!metronomeEntry) {
      row.status = "metronome_not_found";
      rows.push(row);
      continue;
    }

    matchedMetronomeIds.add(credit.metronomeCreditId);
    row.metronomeKind = metronomeCredit ? "credit" : "commit";
    row.metronomeProductId = metronomeCredit
      ? metronomeCredit.product.id
      : (metronomeCommit?.product.id ?? "");

    const metronomeInitialMicroUsd = dollarsToMicroUsd(
      sumScheduleAmount(metronomeEntry)
    );
    const metronomeBalanceMicroUsd = dollarsToMicroUsd(
      metronomeEntry.balance ?? 0
    );
    row.metronomeInitialAmountMicroUsd = String(metronomeInitialMicroUsd);
    row.metronomeBalanceMicroUsd = String(metronomeBalanceMicroUsd);

    const initialMatch =
      metronomeInitialMicroUsd === credit.initialAmountMicroUsd;
    const remainingMatch = metronomeBalanceMicroUsd === remainingMicroUsd;
    row.initialMatch = initialMatch ? "yes" : "no";
    row.remainingMatch = remainingMatch ? "yes" : "no";

    if (initialMatch && remainingMatch) {
      row.status = "ok";
    } else if (!initialMatch && !remainingMatch) {
      row.status = "mismatch_initial_and_remaining";
    } else if (!initialMatch) {
      row.status = "mismatch_initial";
    } else {
      row.status = "mismatch_remaining";
    }

    rows.push(row);
  }

  // Surface Metronome credits/commits that didn't map to any active DB credit.
  for (const metronomeCredit of metronomeCredits) {
    if (matchedMetronomeIds.has(metronomeCredit.id)) {
      continue;
    }
    const row = buildEmptyCreditRow(workspace, metronomeCustomerId);
    row.metronomeKind = "credit";
    row.metronomeProductId = metronomeCredit.product.id;
    row.creditMetronomeCreditId = metronomeCredit.id;
    row.metronomeInitialAmountMicroUsd = String(
      dollarsToMicroUsd(sumScheduleAmount(metronomeCredit))
    );
    row.metronomeBalanceMicroUsd = String(
      dollarsToMicroUsd(metronomeCredit.balance ?? 0)
    );
    row.status = "metronome_only";
    rows.push(row);
  }
  for (const metronomeCommit of metronomeCommits) {
    if (matchedMetronomeIds.has(metronomeCommit.id)) {
      continue;
    }
    const row = buildEmptyCreditRow(workspace, metronomeCustomerId);
    row.metronomeKind = "commit";
    row.metronomeProductId = metronomeCommit.product.id;
    row.creditMetronomeCreditId = metronomeCommit.id;
    row.metronomeInitialAmountMicroUsd = String(
      dollarsToMicroUsd(sumScheduleAmount(metronomeCommit))
    );
    row.metronomeBalanceMicroUsd = String(
      dollarsToMicroUsd(metronomeCommit.balance ?? 0)
    );
    row.status = "metronome_only";
    rows.push(row);
  }

  return rows;
}

makeScript(
  {
    workspaceId: {
      type: "string" as const,
      description:
        "Optional workspace sId to check (checks all workspaces if omitted)",
      required: false,
    },
    output: {
      type: "string" as const,
      description: "Path to write the invoice consistency CSV",
      default: "stripe_metronome_consistency.csv",
    },
    creditsOutput: {
      type: "string" as const,
      description: "Path to write the credits consistency CSV",
      default: "stripe_metronome_credits_consistency.csv",
    },
    concurrency: {
      type: "number" as const,
      description: "How many workspaces to process in parallel",
      default: 4,
    },
  },
  async ({ workspaceId, output, creditsOutput, concurrency }, logger) => {
    const invoiceRows: Row[] = [];
    const creditRows: CreditRow[] = [];

    await runOnAllWorkspaces(
      async (workspace) => {
        try {
          const invoiceRow = await checkInvoiceConsistency(workspace, logger);
          if (invoiceRow) {
            invoiceRows.push(invoiceRow);
          }

          const workspaceCreditRows = await checkCreditConsistency(
            workspace,
            logger
          );
          creditRows.push(...workspaceCreditRows);

          logger.info(
            {
              workspaceId: workspace.sId,
              invoiceStatus: invoiceRow?.status ?? "skipped",
              creditRows: workspaceCreditRows.length,
            },
            "[Consistency] Processed workspace"
          );
        } catch (err) {
          const error = normalizeError(err);
          logger.error(
            { workspaceId: workspace.sId, err: error.message },
            "[Consistency] Unexpected error"
          );
          const invoiceRow = buildEmptyRow(workspace);
          invoiceRow.status = "error";
          invoiceRow.notes = error.message;
          invoiceRows.push(invoiceRow);
        }
      },
      { concurrency, wId: workspaceId }
    );

    invoiceRows.sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));
    writeFileSync(
      output,
      stringify(invoiceRows, { header: true, columns: CSV_COLUMNS })
    );
    logger.info(
      { rows: invoiceRows.length, output },
      "[Consistency] Wrote invoice CSV report"
    );

    creditRows.sort(
      (a, b) =>
        a.workspaceId.localeCompare(b.workspaceId) ||
        a.creditId.localeCompare(b.creditId)
    );
    writeFileSync(
      creditsOutput,
      stringify(creditRows, { header: true, columns: CREDIT_CSV_COLUMNS })
    );
    logger.info(
      { rows: creditRows.length, output: creditsOutput },
      "[Consistency] Wrote credits CSV report"
    );
  }
);
