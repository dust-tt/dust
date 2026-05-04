import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import Metronome, { ConflictError } from "@metronome/sdk";
import type { Commit, ContractV2, Credit } from "@metronome/sdk/resources";
import type { RateCardRetrieveResponse } from "@metronome/sdk/resources/v1/contracts/rate-cards";
import type { Invoice } from "@metronome/sdk/resources/v1/customers";
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

/** Convert an epoch-seconds timestamp (e.g. from Stripe) to an hour-floored ISO string. */
export function epochSecondsToFloorHourISO(epochSeconds: number): string {
  return floorToHourISO(new Date(epochSeconds * 1000));
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
  stripeCustomerId?: string;
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
 * Update the display name of an existing Metronome customer.
 * Used to keep the Metronome customer name in sync when a workspace is renamed.
 */
export async function updateMetronomeCustomerName(
  workspace: LightWorkspaceType
): Promise<Result<void, Error>> {
  const { metronomeCustomerId, name } = workspace;
  if (!metronomeCustomerId) {
    return new Ok(undefined);
  }

  try {
    await getMetronomeClient().v1.customers.setName({
      customer_id: metronomeCustomerId,
      name,
    });
    logger.info(
      { metronomeCustomerId, name },
      "[Metronome] Customer name updated"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, name },
      "[Metronome] Failed to update customer name"
    );
    return new Err(error);
  }
}

/**
 * Idempotently ensure a Metronome customer has a Stripe billing
 * configuration pointing to the given `stripeCustomerId`.
 *
 * - No active Stripe config: adds one.
 * - Active Stripe config already pointing to `stripeCustomerId`: no-op.
 * - Active Stripe config pointing to a different `stripeCustomerId`: archives
 *   the stale config(s) and adds a new one (defensive: should be rare, but
 *   covers cases like a recreated Stripe customer).
 */
export async function ensureMetronomeStripeBillingConfig({
  metronomeCustomerId,
  stripeCustomerId,
}: {
  metronomeCustomerId: string;
  stripeCustomerId: string;
}): Promise<Result<void, Error>> {
  try {
    const existing =
      await getMetronomeClient().v1.customers.retrieveBillingConfigurations({
        customer_id: metronomeCustomerId,
      });

    const activeStripeConfigs = existing.data.filter(
      (c) => c.billing_provider === "stripe" && !c.archived_at
    );

    const alreadyCorrect = activeStripeConfigs.some(
      (c) => c.configuration?.stripe_customer_id === stripeCustomerId
    );
    if (alreadyCorrect) {
      return new Ok(undefined);
    }

    if (activeStripeConfigs.length > 0) {
      const staleIds = activeStripeConfigs.map((c) => c.id);
      await getMetronomeClient().v1.customers.archiveBillingConfigurations({
        customer_id: metronomeCustomerId,
        customer_billing_provider_configuration_ids: staleIds,
      });
      logger.warn(
        {
          metronomeCustomerId,
          stripeCustomerId,
          archivedConfigIds: staleIds,
          stalestripeCustomerIds: activeStripeConfigs.map(
            (c) => c.configuration?.stripe_customer_id
          ),
        },
        "[Metronome] Archived stale Stripe billing config(s) before re-adding"
      );
    }

    await getMetronomeClient().v1.customers.setBillingConfigurations({
      data: [
        {
          customer_id: metronomeCustomerId,
          billing_provider: "stripe",
          delivery_method: "direct_to_billing_provider",
          configuration: {
            stripe_customer_id: stripeCustomerId,
            stripe_collection_method: "charge_automatically",
          },
        },
      ],
    });

    logger.info(
      { metronomeCustomerId, stripeCustomerId },
      "[Metronome] Stripe billing config added to customer"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, stripeCustomerId },
      "[Metronome] Failed to ensure Stripe billing config on customer"
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

/**
 * Add Stripe billing configuration from the Metronome customer to the contract
 * Idempotent: if Stripe billing is already configured, logs and returns Ok.
 */
export async function addStripeMetronomeBillingConfig({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<void, Error>> {
  try {
    await getMetronomeClient().v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: metronomeContractId,
      add_billing_provider_configuration_update: {
        billing_provider_configuration: {
          billing_provider: "stripe",
          delivery_method: "direct_to_billing_provider",
        },
        schedule: {
          effective_at: "START_OF_CURRENT_PERIOD",
        },
      },
    });

    logger.info(
      {
        metronomeCustomerId,
        metronomeContractId,
      },
      "[Metronome] Stripe billing provider linked to contract"
    );

    return new Ok(undefined);
  } catch (err) {
    if (err instanceof ConflictError) {
      logger.info(
        { metronomeCustomerId, metronomeContractId },
        "[Metronome] Contract billing provider already configured, skipping"
      );

      return new Ok(undefined);
    }

    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, metronomeContractId },
      "[Metronome] Failed to link Stripe billing provider to contract"
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
  startingAt,
  enableStripeBilling,
}: {
  metronomeCustomerId: string;
  packageAlias: string;
  uniquenessKey?: string;
  // Must already be on an hour boundary (Metronome requirement).
  startingAt: Date;
  enableStripeBilling: boolean;
}): Promise<Result<{ contractId: string }, Error>> {
  const startingAtISO = startingAt.toISOString();

  try {
    const response = await getMetronomeClient().v1.contracts.create({
      customer_id: metronomeCustomerId,
      package_alias: packageAlias,
      starting_at: startingAtISO,
      ...(uniquenessKey ? { uniqueness_key: uniquenessKey } : {}),
    });

    if (enableStripeBilling) {
      addStripeMetronomeBillingConfig({
        metronomeCustomerId,
        metronomeContractId: response.data.id,
      });
    }

    logger.info(
      {
        metronomeCustomerId,
        packageAlias,
        metronomeContractId: response.data.id,
      },
      "[Metronome] Contract created"
    );
    return new Ok({ contractId: response.data.id });
  } catch (err) {
    if (err instanceof ConflictError) {
      const existingContract =
        await getMetronomeActiveContract(metronomeCustomerId);
      if (existingContract.isOk() && existingContract.value) {
        return new Ok({ contractId: existingContract.value.contractId });
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
 * Get the active contract for a Metronome customer.
 * Returns the contract ID if found.
 */
export async function getMetronomeActiveContract(
  metronomeCustomerId: string
): Promise<
  Result<
    {
      contractId: string;
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

    return new Ok({
      contractId: contract.id,
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
 * Retrieve a specific Metronomome rate card by ID.
 */
export async function getMetronomeRateCardById({
  rateCardId,
}: {
  rateCardId: string;
}): Promise<Result<RateCardRetrieveResponse.Data, Error>> {
  try {
    const response = await getMetronomeClient().v1.contracts.rateCards.retrieve(
      { id: rateCardId }
    );
    return new Ok(response.data);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Retrieve a specific Metronome contract by customer + contract ID.
 */
export async function getMetronomeContractById({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<ContractV2, Error>> {
  try {
    const response = await getMetronomeClient().v2.contracts.retrieve({
      customer_id: metronomeCustomerId,
      contract_id: metronomeContractId,
    });

    return new Ok(response.data);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Schedule a Metronome contract to end at the given date (defaults to now).
 * Metronome requires ending_before on an hour boundary; we ceil to avoid
 * dropping usage in the current partial hour.
 */
export async function scheduleMetronomeContractEnd({
  metronomeCustomerId,
  contractId,
  endingBefore,
}: {
  metronomeCustomerId: string;
  contractId: string;
  endingBefore?: Date;
}): Promise<Result<void, Error>> {
  const endDate = ceilToHourISO(endingBefore ?? new Date());
  try {
    await getMetronomeClient().v1.contracts.updateEndDate({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      ending_before: endDate,
    });

    logger.info(
      { metronomeCustomerId, contractId, endingBefore: endDate },
      "[Metronome] Contract end date scheduled"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId, endingBefore: endDate },
      "[Metronome] Failed to schedule contract end date"
    );
    return new Err(error);
  }
}

/**
 * Remove the scheduled end date on a Metronome contract, making it open-ended.
 * Used when a subscription is reactivated after cancellation.
 */
export async function reactivateMetronomeContract({
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
    });

    logger.info(
      { metronomeCustomerId, contractId },
      "[Metronome] Contract reactivated (end date removed)"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId },
      "[Metronome] Failed to reactivate contract"
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
    // Use v1.contracts.retrieve: only v1 exposes package_id on the response
    // (Shared.Contract.package_id). v2.contracts.retrieve omits it.
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

/**
 * Set the absolute quantity on a QUANTITY_ONLY subscription.
 * Always sets the total — safe against race conditions.
 */
export async function updateSubscriptionQuantity({
  metronomeCustomerId,
  contractId,
  subscriptionId,
  quantity,
  startingAt,
  uniquenessKey,
}: {
  metronomeCustomerId: string;
  contractId: string;
  subscriptionId: string;
  quantity: number;
  startingAt?: string;
  uniquenessKey?: string;
}): Promise<Result<void, Error>> {
  const now = startingAt ?? floorToHourISO(new Date());

  try {
    await getMetronomeClient().v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      ...(uniquenessKey ? { uniqueness_key: uniquenessKey } : {}),
      update_subscriptions: [
        {
          subscription_id: subscriptionId,
          quantity_updates: [
            {
              starting_at: now,
              quantity,
            },
          ],
        },
      ],
    });

    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId, subscriptionId },
      "[Metronome] Failed to update subscription quantity"
    );
    return new Err(error);
  }
}

// ---------------------------------------------------------------------------
// Commits
// ---------------------------------------------------------------------------

/**
 * Add paid credits (=commits) to a Metronome customer.
 */
export async function createMetronomeCommit({
  metronomeCustomerId,
  productId,
  creditTypeId,
  amount,
  startingAt,
  endingBefore,
  name,
  idempotencyKey,
  priority,
}: {
  metronomeCustomerId: string;
  productId: string;
  creditTypeId: string;
  amount: number;
  startingAt: Date;
  endingBefore: Date;
  idempotencyKey: string;
  name?: string;
  priority?: number;
}): Promise<Result<{ id: string } | null, Error>> {
  // Metronome requires dates on hour boundaries — round down start, round up end.
  const roundedStartingAt = floorToHourISO(startingAt);
  const roundedEndingBefore = ceilToHourISO(endingBefore);
  try {
    logger.info(
      {
        metronomeCustomerId,
        productId,
        creditTypeId,
        amount,
        roundedStartingAt,
        roundedEndingBefore,
      },
      "[Metronome] Adding commits to customer"
    );

    const response = await getMetronomeClient().v1.customers.commits.create({
      customer_id: metronomeCustomerId,
      type: "PREPAID",
      product_id: productId,
      name: name ?? "Commit purchase",
      applicable_product_tags: ["usage"],
      priority: priority ?? 2, // Apply after any free credits
      access_schedule: {
        credit_type_id: creditTypeId,
        schedule_items: [
          {
            amount,
            starting_at: roundedStartingAt,
            ending_before: roundedEndingBefore,
          },
        ],
      },
      uniqueness_key: idempotencyKey,
    });

    logger.info(
      {
        metronomeCustomerId,
        productId,
        amount,
        roundedStartingAt,
        roundedEndingBefore,
      },
      "[Metronome] Commits added to customer"
    );
    return new Ok(response.data);
  } catch (err) {
    if (err instanceof ConflictError) {
      // Idempotency key conflict — commit already created, look it up by
      // uniqueness_key so the caller can persist the existing id.
      const existing = await findMetronomeCommitByUniquenessKey({
        metronomeCustomerId,
        uniquenessKey: idempotencyKey,
        coveringDate: roundedStartingAt,
      });
      if (existing.isOk() && existing.value) {
        logger.info(
          {
            metronomeCustomerId,
            idempotencyKey,
            metronomeCommitId: existing.value.id,
          },
          "[Metronome] Commit already exists (idempotent), reusing id"
        );
        return new Ok({ id: existing.value.id });
      }
      logger.info(
        { metronomeCustomerId, idempotencyKey },
        "[Metronome] Commit already exists (idempotent) but lookup did not find it"
      );
      return new Ok(null);
    }

    const error = normalizeError(err);
    logger.error(
      {
        error,
        metronomeCustomerId,
        productId,
        amount,
        roundedStartingAt,
        roundedEndingBefore,
      },
      "[Metronome] Failed to add commits to customer"
    );
    return new Err(error);
  }
}

/**
 * Find a customer-level commit by its uniqueness_key.
 * Used to recover the id after a 409 conflict on creation.
 * Scoped via covering_date so we don't paginate through expired commits.
 */
export async function findMetronomeCommitByUniquenessKey({
  metronomeCustomerId,
  uniquenessKey,
  coveringDate,
}: {
  metronomeCustomerId: string;
  uniquenessKey: string;
  coveringDate: string;
}): Promise<Result<{ id: string } | null, Error>> {
  const result = await listMetronomeCustomerCommits({
    metronomeCustomerId,
    coveringDate,
  });
  if (result.isErr()) {
    return result;
  }
  const match = result.value.find((c) => c.uniqueness_key === uniquenessKey);
  return new Ok(match ? { id: match.id } : null);
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

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

/**
 * List draft invoices for a Metronome customer.
 * Draft invoices reflect up-to-date spend for the current billing period
 * before final billing. Used to compute estimated current-period billing.
 */
export async function listMetronomeDraftInvoices(
  metronomeCustomerId: string
): Promise<Result<Invoice[], Error>> {
  try {
    const invoices: Invoice[] = [];
    for await (const entry of getMetronomeClient().v1.customers.invoices.list({
      customer_id: metronomeCustomerId,
      status: "DRAFT",
      skip_zero_qty_line_items: true,
    })) {
      invoices.push(entry);
    }
    return new Ok(invoices);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId },
      "[Metronome] Failed to list draft invoices"
    );
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
 * Update the amount of a credit segment created from a recurring credit in a package.
 * Called when a credit.segment.start webhook fires, to set the correct user-based amount.
 * The segment_id is the access schedule item ID provided in the webhook event.
 */
export async function updateMetronomeCreditSegmentAmount({
  metronomeCustomerId,
  contractId,
  creditId,
  segmentId,
  amount,
}: {
  metronomeCustomerId: string;
  contractId: string;
  creditId: string;
  segmentId: string;
  amount: number;
}): Promise<Result<{ id: string }, Error>> {
  try {
    await getMetronomeClient().v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      update_credits: [
        {
          credit_id: creditId,
          access_schedule: {
            update_schedule_items: [
              {
                id: segmentId,
                amount,
              },
            ],
          },
        },
      ],
    });

    logger.info(
      { metronomeCustomerId, contractId, creditId, segmentId, amount },
      "[Metronome] Free credit segment amount updated"
    );
    return new Ok({ id: creditId });
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId, creditId, segmentId, amount },
      "[Metronome] Failed to update free credit segment amount"
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
  productId,
  creditTypeId,
  amount,
  startingAt,
  endingBefore,
  name,
  idempotencyKey,
  applicableProductTags,
  applicableProductIds,
  priority,
}: {
  metronomeCustomerId: string;
  productId: string;
  creditTypeId: string;
  amount: number;
  startingAt: string;
  endingBefore: string;
  name: string;
  idempotencyKey: string;
  applicableProductTags?: string[];
  applicableProductIds?: string[];
  priority: number;
}): Promise<Result<{ id: string } | null, Error>> {
  // Metronome requires dates on hour boundaries — round down start, round up end.
  const roundedStartingAt = floorToHourISO(new Date(startingAt));
  const roundedEndingBefore = ceilToHourISO(new Date(endingBefore));

  try {
    const response = await getMetronomeClient().v1.customers.credits.create({
      customer_id: metronomeCustomerId,
      product_id: productId,
      name,
      priority,
      ...(applicableProductTags
        ? { applicable_product_tags: applicableProductTags }
        : {}),
      ...(applicableProductIds
        ? { applicable_product_ids: applicableProductIds }
        : {}),
      access_schedule: {
        credit_type_id: creditTypeId,
        schedule_items: [
          {
            amount,
            starting_at: roundedStartingAt,
            ending_before: roundedEndingBefore,
          },
        ],
      },
      uniqueness_key: idempotencyKey,
    });

    return new Ok(response.data);
  } catch (err) {
    if (err instanceof ConflictError) {
      // Idempotency key conflict — credit already granted, look it up by
      // uniqueness_key so the caller can persist the existing id.
      const existing = await findMetronomeCreditByUniquenessKey({
        metronomeCustomerId,
        uniquenessKey: idempotencyKey,
        coveringDate: roundedStartingAt,
      });
      if (existing.isOk() && existing.value) {
        logger.info(
          {
            metronomeCustomerId,
            idempotencyKey,
            metronomeCreditId: existing.value.id,
          },
          "[Metronome] Credit grant already exists (idempotent), reusing id"
        );
        return new Ok({ id: existing.value.id });
      }
      logger.info(
        { metronomeCustomerId, idempotencyKey },
        "[Metronome] Credit grant already exists (idempotent) but lookup did not find it"
      );
      return new Ok(null);
    }

    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, name, idempotencyKey },
      "[Metronome] Failed to create credit grant"
    );
    return new Err(error);
  }
}

/**
 * Find a customer-level credit by its uniqueness_key.
 * Used to recover the id after a 409 conflict on creation.
 * Scoped via covering_date so we don't paginate through expired credits.
 */
export async function findMetronomeCreditByUniquenessKey({
  metronomeCustomerId,
  uniquenessKey,
  coveringDate,
}: {
  metronomeCustomerId: string;
  uniquenessKey: string;
  coveringDate: string;
}): Promise<Result<{ id: string } | null, Error>> {
  const result = await listMetronomeCustomerCredits({
    metronomeCustomerId,
    coveringDate,
  });
  if (result.isErr()) {
    return result;
  }
  const match = result.value.find((c) => c.uniqueness_key === uniquenessKey);
  return new Ok(match ? { id: match.id } : null);
}

/**
 * List customer-level credits for a Metronome customer.
 * Optionally filter by a specific credit id.
 */
export async function listMetronomeCustomerCredits({
  metronomeCustomerId,
  creditId,
  includeContractCredits = false,
  includeBalance = false,
  coveringDate,
}: {
  metronomeCustomerId: string;
  creditId?: string;
  includeContractCredits?: boolean;
  includeBalance?: boolean;
  coveringDate?: string;
}): Promise<Result<Credit[], Error>> {
  try {
    const page = await getMetronomeClient().v1.customers.credits.list({
      customer_id: metronomeCustomerId,
      ...(creditId ? { credit_id: creditId } : {}),
      ...(coveringDate ? { covering_date: coveringDate } : {}),
      include_contract_credits: includeContractCredits,
      include_balance: includeBalance,
    });
    return new Ok(page.data);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, creditId },
      "[Metronome] Failed to list customer credits"
    );
    return new Err(error);
  }
}

/**
 * List customer-level commits for a Metronome customer.
 * Optionally filter by a specific commit id.
 */
export async function listMetronomeCustomerCommits({
  metronomeCustomerId,
  commitId,
  includeContractCommits = false,
  includeBalance = false,
  coveringDate,
}: {
  metronomeCustomerId: string;
  commitId?: string;
  includeContractCommits?: boolean;
  includeBalance?: boolean;
  coveringDate?: string;
}): Promise<Result<Commit[], Error>> {
  try {
    const page = await getMetronomeClient().v1.customers.commits.list({
      customer_id: metronomeCustomerId,
      ...(commitId ? { commit_id: commitId } : {}),
      ...(coveringDate ? { covering_date: coveringDate } : {}),
      include_contract_commits: includeContractCommits,
      include_balance: includeBalance,
    });
    return new Ok(page.data);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, commitId },
      "[Metronome] Failed to list customer commits"
    );
    return new Err(error);
  }
}

/**
 * Fetch a specific customer-level credit by its Metronome ID.
 */
export async function getMetronomeCredit({
  metronomeCustomerId,
  creditId,
  includeContractCredits = true,
  includeBalance = false,
}: {
  metronomeCustomerId: string;
  creditId: string;
  includeContractCredits?: boolean;
  includeBalance?: boolean;
}): Promise<Result<Credit | null, Error>> {
  const result = await listMetronomeCustomerCredits({
    metronomeCustomerId,
    creditId,
    includeContractCredits,
    includeBalance,
  });
  if (result.isErr()) {
    return result;
  }
  return new Ok(result.value[0] ?? null);
}

/**
 * Fetch a specific customer-level commit by its Metronome ID.
 */
export async function getMetronomeCommit({
  metronomeCustomerId,
  commitId,
  includeContractCommits = true,
  includeBalance = false,
}: {
  metronomeCustomerId: string;
  commitId: string;
  includeContractCommits?: boolean;
  includeBalance?: boolean;
}): Promise<Result<Commit | null, Error>> {
  const result = await listMetronomeCustomerCommits({
    metronomeCustomerId,
    commitId,
    includeContractCommits,
    includeBalance,
  });
  if (result.isErr()) {
    return result;
  }
  return new Ok(result.value[0] ?? null);
}

/**
 * Update the access end date on a customer-level credit.
 * Used when revoking a coupon to cut off the credit early.
 */
export async function updateMetronomeCreditEndDate({
  metronomeCustomerId,
  creditId,
  accessEndingBefore,
}: {
  metronomeCustomerId: string;
  creditId: string;
  accessEndingBefore: string;
}): Promise<Result<void, Error>> {
  try {
    await getMetronomeClient().v1.customers.credits.updateEndDate({
      customer_id: metronomeCustomerId,
      credit_id: creditId,
      access_ending_before: accessEndingBefore,
    });
    logger.info(
      { metronomeCustomerId, creditId, accessEndingBefore },
      "[Metronome] Credit end date updated"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, creditId, accessEndingBefore },
      "[Metronome] Failed to update credit end date"
    );
    return new Err(error);
  }
}

/**
 * Apply a manual deduction to a customer-level credit balance.
 * Used when backfilling credits that have a pre-existing consumed amount.
 * The amount parameter is a positive value and will be negated internally.
 */
export async function deductMetronomeCreditBalance({
  metronomeCustomerId,
  contractId,
  creditId,
  segmentId,
  amount,
  reason,
}: {
  metronomeCustomerId: string;
  // Pass `contractId` for contract-level credits / commits. Customer-level
  // entries (e.g., one-off poke credits) leave it undefined.
  contractId?: string;
  creditId: string;
  segmentId: string;
  amount: number;
  reason: string;
}): Promise<Result<void, Error>> {
  try {
    await getMetronomeClient().v1.contracts.addManualBalanceEntry({
      id: creditId,
      customer_id: metronomeCustomerId,
      amount: -amount, // negative to draw down the balance
      reason,
      segment_id: segmentId,
      ...(contractId ? { contract_id: contractId } : {}),
    });
    logger.info(
      { metronomeCustomerId, contractId, creditId, segmentId, amount },
      "[Metronome] Manual credit deduction applied"
    );
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, contractId, creditId, segmentId, amount },
      "[Metronome] Failed to apply manual credit deduction"
    );
    return new Err(error);
  }
}
