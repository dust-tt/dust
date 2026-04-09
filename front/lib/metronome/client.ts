import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import Metronome, { ConflictError } from "@metronome/sdk";

import type {
  MetronomeBalance,
  MetronomeEvent,
  MetronomeUsageListResponse,
  MetronomeUsageWithGroupsResponse,
} from "./types";

let cachedClient: Metronome | null = null;

export function getMetronomeClient(): Metronome {
  if (!cachedClient) {
    const bearerToken = config.getMetronomeApiKey();
    if (!bearerToken) {
      throw new Error("METRONOME_API_KEY is not set");
    }
    cachedClient = new Metronome({ bearerToken });
  }
  return cachedClient;
}

// Metronome requires dates on specific boundaries (hour for contracts, midnight for usage).
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function floorToHourISO(date: Date): string {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS).toISOString();
}

export function ceilToHourISO(date: Date): string {
  return new Date(Math.ceil(date.getTime() / HOUR_MS) * HOUR_MS).toISOString();
}

export function floorToMidnightUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

export function ceilToMidnightUTC(d: Date): Date {
  const floored = floorToMidnightUTC(d);
  return floored.getTime() < d.getTime()
    ? new Date(floored.getTime() + DAY_MS)
    : floored;
}

// ---------------------------------------------------------------------------
// Event ingestion
// ---------------------------------------------------------------------------

const METRONOME_INGEST_BATCH_SIZE = 100;

/**
 * Send usage events to Metronome's ingest API.
 * Batches into chunks of 100 (Metronome's max per request).
 * Throws on failure so callers (e.g. Temporal activities) can retry.
 */
export async function ingestMetronomeEvents(
  events: MetronomeEvent[]
): Promise<void> {
  if (!config.getMetronomeApiKey() || events.length === 0) {
    return;
  }

  // Metronome rejects events older than 34 days — filter them out before
  // sending to avoid rejecting the entire batch. This happens when Temporal
  // retries old workflows.
  const maxAgeMs = 34 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;
  const validEvents = events.filter((e) => {
    const ts = new Date(e.timestamp).getTime();
    if (ts < cutoff) {
      logger.warn(
        { transactionId: e.transaction_id, timestamp: e.timestamp },
        "[Metronome] Dropping event — older than 34 days"
      );
      return false;
    }
    return true;
  });

  if (validEvents.length === 0) {
    return;
  }

  const client = getMetronomeClient();
  for (let i = 0; i < validEvents.length; i += METRONOME_INGEST_BATCH_SIZE) {
    const batch = validEvents.slice(i, i + METRONOME_INGEST_BATCH_SIZE);
    await client.v1.usage.ingest({ usage: batch });
  }
}

// ---------------------------------------------------------------------------
// Customer management
// ---------------------------------------------------------------------------

/**
 * Create a customer in Metronome, linked to an existing Stripe customer.
 * The workspace sId is set as an ingest alias so that usage events
 * with `customer_id: workspaceId` are automatically matched.
 *
 * Handles 409 conflict by extracting the existing customer's ID.
 */
export async function createMetronomeCustomer({
  workspaceId,
  workspaceName,
  stripeCustomerId,
}: {
  workspaceId: string;
  workspaceName: string;
  stripeCustomerId: string;
}): Promise<Result<{ metronomeCustomerId: string }, Error>> {
  try {
    const response = await getMetronomeClient().v1.customers.create({
      name: workspaceName,
      ingest_aliases: [workspaceId],
      ...(stripeCustomerId
        ? {
            customer_billing_provider_configurations: [
              {
                billing_provider: "stripe",
                delivery_method: "direct_to_billing_provider",
                configuration: {
                  stripe_customer_id: stripeCustomerId,
                  stripe_collection_method: "charge_automatically",
                },
              },
            ],
          }
        : {}),
    });

    logger.info(
      { workspaceId, metronomeCustomerId: response.data.id },
      "[Metronome] Customer created"
    );
    return new Ok({ metronomeCustomerId: response.data.id });
  } catch (err) {
    if (err instanceof ConflictError) {
      const findResult = await findMetronomeCustomerByAlias(workspaceId);
      if (findResult.isOk() && findResult.value) {
        return new Ok({ metronomeCustomerId: findResult.value });
      }
    }

    const error = normalizeError(err);
    logger.error(
      { error, workspaceId },
      "[Metronome] Failed to create customer"
    );
    return new Err(error);
  }
}

/**
 * Find a Metronome customer by ingest alias (workspace sId).
 * Returns the Metronome customer ID if found, null if not.
 */
export async function findMetronomeCustomerByAlias(
  workspaceId: string
): Promise<Result<string | null, Error>> {
  try {
    const page = await getMetronomeClient().v1.customers.list({
      ingest_alias: workspaceId,
    });
    const first = page.data[0];
    return new Ok(first?.id ?? null);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, workspaceId },
      "[Metronome] Failed to find customer by alias"
    );
    return new Err(error);
  }
}

// ---------------------------------------------------------------------------
// Contract management
// ---------------------------------------------------------------------------

/**
 * Create a contract for a Metronome customer using a package alias.
 * The package defines the rate card, seat subscriptions, and credit allocations.
 *
 * Handles 409 conflict by extracting the existing contract's ID.
 */
export async function createMetronomeContract({
  metronomeCustomerId,
  packageAlias,
  uniquenessKey,
}: {
  metronomeCustomerId: string;
  packageAlias: string;
  uniquenessKey: string;
}): Promise<Result<{ contractId: string; startingAt: string }, Error>> {
  // Metronome requires starting_at on an hour boundary — round down to current hour.
  const startingAt = floorToHourISO(new Date());

  try {
    const response = await getMetronomeClient().v1.contracts.create({
      customer_id: metronomeCustomerId,
      package_alias: packageAlias,
      starting_at: startingAt,
      uniqueness_key: uniquenessKey,
    });

    logger.info(
      {
        metronomeCustomerId,
        packageAlias,
        metronomeContractId: response.data.id,
      },
      "[Metronome] Contract created"
    );
    return new Ok({ contractId: response.data.id, startingAt });
  } catch (err) {
    if (err instanceof ConflictError) {
      const existingContract =
        await getMetronomeActiveContract(metronomeCustomerId);
      if (existingContract.isOk() && existingContract.value) {
        return new Ok({
          contractId: existingContract.value.contractId,
          startingAt,
        });
      }
    }

    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, packageAlias },
      "[Metronome] Failed to create contract"
    );
    return new Err(error);
  }
}

/**
 * Get the active contract and subscription IDs for a Metronome customer.
 * Returns the contract ID and a map of product_id -> subscription_id
 * for seat-based subscriptions.
 */
export async function getMetronomeActiveContract(
  metronomeCustomerId: string
): Promise<
  Result<
    {
      contractId: string;
      seatSubscriptions: Record<string, string>;
    } | null,
    Error
  >
> {
  try {
    const response = await getMetronomeClient().v2.contracts.list({
      customer_id: metronomeCustomerId,
    });

    if (response.data.length === 0) {
      return new Ok(null);
    }

    // Take the most recent contract.
    const contract = response.data[0];
    const subscriptions = contract.subscriptions ?? [];
    const seatSubscriptions: Record<string, string> = {};
    for (const sub of subscriptions) {
      if (sub.quantity_management_mode === "SEAT_BASED" && sub.id) {
        seatSubscriptions[sub.subscription_rate.product.id] = sub.id;
      }
    }

    return new Ok({
      contractId: contract.id,
      seatSubscriptions,
    });
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId },
      "[Metronome] Failed to list contracts"
    );
    return new Err(error);
  }
}

/**
 * End (cancel) a Metronome contract at the next hour boundary.
 * Metronome requires ending_before on an hour boundary; we ceil to avoid
 * dropping usage in the current partial hour.
 */
export async function endMetronomeContract({
  metronomeCustomerId,
  contractId,
}: {
  metronomeCustomerId: string;
  contractId: string;
}): Promise<Result<void, Error>> {
  try {
    await getMetronomeClient().v1.contracts.updateEndDate({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      ending_before: ceilToHourISO(new Date()),
    });

    logger.info(
      { metronomeCustomerId, contractId },
      "[Metronome] Contract ended"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId },
      "[Metronome] Failed to end contract"
    );
    return new Err(error);
  }
}

/**
 * Get the package aliases for a contract.
 * Retrieves the contract to get its package_id, then retrieves the package
 * to get its aliases.
 */
export async function getMetronomeContractPackageAliases({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<string[], Error>> {
  try {
    const contractResponse = await getMetronomeClient().v1.contracts.retrieve({
      customer_id: metronomeCustomerId,
      contract_id: metronomeContractId,
    });

    const packageId = contractResponse.data.package_id;
    if (!packageId) {
      return new Ok([]);
    }

    const packageResponse = await getMetronomeClient().v1.packages.retrieve({
      package_id: packageId,
    });

    const aliases = packageResponse.data.aliases?.map((a) => a.name) ?? [];

    return new Ok(aliases);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, metronomeContractId },
      "[Metronome] Failed to get contract package aliases"
    );
    return new Err(error);
  }
}

// ---------------------------------------------------------------------------
// Seat management
// ---------------------------------------------------------------------------

interface SeatSubscriptionEdit {
  subscriptionId: string;
  addSeatIds?: string[];
  removeSeatIds?: string[];
  addUnassignedSeats?: number;
}

/**
 * Add or remove seat IDs on a Metronome contract subscription.
 * Used when members join/leave or change seat type.
 */
export async function editMetronomeContractSeats({
  metronomeCustomerId,
  contractId,
  edits,
  startingAt,
}: {
  metronomeCustomerId: string;
  contractId: string;
  edits: SeatSubscriptionEdit[];
  startingAt?: string;
}): Promise<Result<void, Error>> {
  // Metronome requires starting_at on an hour boundary — round down to current hour.
  const now = startingAt ?? floorToHourISO(new Date());

  try {
    await getMetronomeClient().v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      update_subscriptions: edits.map((edit) => ({
        subscription_id: edit.subscriptionId,
        seat_updates: {
          ...(edit.addSeatIds
            ? {
                add_seat_ids: edit.addSeatIds.map((id) => ({
                  seat_ids: [id],
                  starting_at: now,
                })),
              }
            : {}),
          ...(edit.removeSeatIds
            ? {
                remove_seat_ids: edit.removeSeatIds.map((id) => ({
                  seat_ids: [id],
                  starting_at: now,
                })),
              }
            : {}),
          ...(edit.addUnassignedSeats !== undefined
            ? {
                add_unassigned_seats: [
                  {
                    quantity: edit.addUnassignedSeats,
                    starting_at: now,
                  },
                ],
              }
            : {}),
        },
      })),
    });

    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId },
      "[Metronome] Failed to edit contract seats"
    );
    return new Err(error);
  }
}

// ---------------------------------------------------------------------------
// Commits
// ---------------------------------------------------------------------------

/**
 * Add paid credits (=commits) to a Metronome contract via a contract edit.
 */
export async function createMetronomeCommit({
  metronomeCustomerId,
  contractId,
  productId,
  amountCents,
  startingAt,
  endingBefore,
  name,
  idempotencyKey,
  priority,
}: {
  metronomeCustomerId: string;
  contractId: string;
  productId: string;
  amountCents: number;
  startingAt: Date;
  endingBefore: Date;
  idempotencyKey: string;
  name?: string;
  priority?: number;
}): Promise<Result<void, Error>> {
  // Metronome requires dates on hour boundaries — round down start, round up end.
  const roundedStartingAt = floorToHourISO(startingAt);
  const roundedEndingBefore = ceilToHourISO(endingBefore);
  try {
    logger.info(
      {
        metronomeCustomerId,
        contractId,
        productId,
        amountCents,
        roundedStartingAt,
        roundedEndingBefore,
      },
      "[Metronome] Adding commits to contract"
    );

    await getMetronomeClient().v2.contracts.edit(
      {
        customer_id: metronomeCustomerId,
        contract_id: contractId,
        add_commits: [
          {
            type: "PREPAID",
            product_id: productId,
            name: name ?? "Commit purchase",
            applicable_product_tags: ["usage"],
            priority,
            access_schedule: {
              schedule_items: [
                {
                  amount: amountCents,
                  starting_at: roundedStartingAt,
                  ending_before: roundedEndingBefore,
                },
              ],
            },
          },
        ],
      },
      { idempotencyKey }
    );

    logger.info(
      {
        metronomeCustomerId,
        contractId,
        productId,
        amountCents,
        roundedStartingAt,
        roundedEndingBefore,
      },
      "[Metronome] Commits added to contract"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      {
        error,
        metronomeCustomerId,
        contractId,
        productId,
        amountCents,
        roundedStartingAt,
        roundedEndingBefore,
      },
      "[Metronome] Failed to add commits to contract"
    );
    return new Err(error);
  }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

interface MetronomeProduct {
  id: string;
  name: string;
}

/**
 * List all products from Metronome.
 * Used to resolve product IDs by name (e.g. "Pro Seat", "Max Seat").
 */
export async function listMetronomeProducts(): Promise<
  Result<MetronomeProduct[], Error>
> {
  try {
    const products: MetronomeProduct[] = [];
    for await (const product of getMetronomeClient().v1.contracts.products.list()) {
      products.push({ id: product.id, name: product.current.name });
    }
    return new Ok(products);
  } catch (err) {
    const error = normalizeError(err);
    logger.error({ error }, "[Metronome] Failed to list products");
    return new Err(error);
  }
}

export async function listMetronomeBalances(
  metronomeCustomerId: string
): Promise<Result<MetronomeBalance[], Error>> {
  if (!config.getMetronomeApiKey()) {
    return new Ok([]);
  }

  const client = getMetronomeClient();

  try {
    const balances: MetronomeBalance[] = [];
    for await (const entry of client.v1.contracts.listBalances({
      customer_id: metronomeCustomerId,
      include_balance: true,
      include_contract_balances: true,
      covering_date: new Date().toISOString(),
      exclude_zero_balances: true,
    })) {
      balances.push(entry);
    }
    return new Ok(balances);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId },
      "[Metronome] Failed to list balances"
    );
    return new Err(error);
  }
}

type WindowSize = "HOUR" | "DAY" | "NONE";

export async function listMetronomeUsage({
  customerIds,
  billableMetricIds,
  startingOn,
  endingBefore,
  windowSize,
}: {
  customerIds: string[];
  billableMetricIds?: string[];
  startingOn: string;
  endingBefore: string;
  windowSize: WindowSize;
}): Promise<Result<MetronomeUsageListResponse[], Error>> {
  if (!config.getMetronomeApiKey()) {
    return new Ok([]);
  }

  const client = getMetronomeClient();

  try {
    const results: MetronomeUsageListResponse[] = [];
    for await (const entry of client.v1.usage.list({
      starting_on: startingOn,
      ending_before: endingBefore,
      window_size: windowSize,
      customer_ids: customerIds,
      ...(billableMetricIds
        ? { billable_metrics: billableMetricIds.map((id) => ({ id })) }
        : {}),
    })) {
      results.push({
        billableMetricId: entry.billable_metric_id,
        billableMetricName: entry.billable_metric_name,
        customerId: entry.customer_id,
        startTimestamp: entry.start_timestamp,
        endTimestamp: entry.end_timestamp,
        value: entry.value,
      });
    }
    return new Ok(results);
  } catch (err) {
    const error = normalizeError(err);
    logger.error({ error }, "[Metronome] Failed to list usage");
    return new Err(error);
  }
}

export async function listMetronomeUsageWithGroups({
  customerId,
  billableMetricId,
  startingOn,
  endingBefore,
  windowSize,
  groupKey,
}: {
  customerId: string;
  billableMetricId: string;
  startingOn: string;
  endingBefore: string;
  windowSize: WindowSize;
  groupKey: string[];
}): Promise<Result<MetronomeUsageWithGroupsResponse[], Error>> {
  if (!config.getMetronomeApiKey()) {
    return new Ok([]);
  }

  const client = getMetronomeClient();

  try {
    const results: MetronomeUsageWithGroupsResponse[] = [];
    for await (const entry of client.v1.usage.listWithGroups({
      customer_id: customerId,
      billable_metric_id: billableMetricId,
      starting_on: startingOn,
      ending_before: endingBefore,
      window_size: windowSize,
      group_key: groupKey,
    })) {
      results.push({
        startingOn: entry.starting_on,
        endingBefore: entry.ending_before,
        value: entry.value,
        group: entry.group ?? null,
      });
    }
    return new Ok(results);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, customerId, billableMetricId },
      "[Metronome] Failed to list usage with groups"
    );
    return new Err(error);
  }
}

/**
 * Create a credit grant on a Metronome customer.
 * Used for monthly free programmatic credits on legacy plans.
 */
export async function createMetronomeCredit({
  metronomeCustomerId,
  contractId,
  productId,
  amountCents,
  startingAt,
  endingBefore,
  name,
  idempotencyKey,
}: {
  metronomeCustomerId: string;
  contractId: string;
  productId: string;
  amountCents: number;
  startingAt: string;
  endingBefore: string;
  name: string;
  idempotencyKey: string;
}): Promise<Result<{ creditId: string }, Error>> {
  // Metronome requires dates on hour boundaries — round down start, round up end.
  const roundedStartingAt = floorToHourISO(new Date(startingAt));
  const roundedEndingBefore = ceilToHourISO(new Date(endingBefore));

  try {
    const response = await getMetronomeClient().v2.contracts.edit(
      {
        customer_id: metronomeCustomerId,
        contract_id: contractId,
        add_credits: [
          {
            product_id: productId,
            name,
            priority: 1, // Apply credits before any prepaid commits
            applicable_product_tags: ["usage"],
            access_schedule: {
              schedule_items: [
                {
                  amount: amountCents,
                  starting_at: roundedStartingAt,
                  ending_before: roundedEndingBefore,
                },
              ],
            },
          },
        ],
      },
      { idempotencyKey }
    );

    return new Ok({ creditId: response.data.id });
  } catch (err) {
    if (err instanceof ConflictError) {
      // Idempotency key conflict — credit already granted, safe to ignore.
      logger.info(
        { metronomeCustomerId, idempotencyKey },
        "[Metronome] Credit grant already exists (idempotent)"
      );
      return new Ok({ creditId: "already-exists" });
    }

    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, name, idempotencyKey },
      "[Metronome] Failed to create credit grant"
    );
    return new Err(error);
  }
}
