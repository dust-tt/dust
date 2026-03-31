import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import Metronome, { ConflictError } from "@metronome/sdk";

import type { MetronomeEvent } from "./types";

let cachedClient: Metronome | null = null;

function getClient(): Metronome {
  if (!cachedClient) {
    const bearerToken = config.getMetronomeApiKey();
    if (!bearerToken) {
      throw new Error("METRONOME_API_KEY is not set");
    }
    cachedClient = new Metronome({ bearerToken });
  }
  return cachedClient;
}

// ---------------------------------------------------------------------------
// Event ingestion
// ---------------------------------------------------------------------------

/**
 * Send usage events to Metronome's ingest API.
 * Throws on failure so callers (e.g. Temporal activities) can retry.
 */
export async function ingestMetronomeEvents(
  events: MetronomeEvent[]
): Promise<void> {
  if (!config.getMetronomeApiKey() || events.length === 0) {
    return;
  }

  await getClient().v1.usage.ingest({ usage: events });
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
    const response = await getClient().v1.customers.create({
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
    // 409 means a customer with this ingest alias already exists — extract
    // the conflicting ID and return it rather than failing.
    if (err instanceof ConflictError) {
      const body = err.error as { conflicting_id?: string } | undefined;
      if (body?.conflicting_id) {
        logger.info(
          { workspaceId, metronomeCustomerId: body.conflicting_id },
          "[Metronome] Customer already exists, reusing conflicting ID"
        );
        return new Ok({ metronomeCustomerId: body.conflicting_id });
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
    const page = await getClient().v1.customers.list({
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
 */
export async function createMetronomeContract({
  metronomeCustomerId,
  packageAlias,
}: {
  metronomeCustomerId: string;
  packageAlias: string;
}): Promise<Result<{ contractId: string }, Error>> {
  try {
    const response = await getClient().v1.contracts.create({
      customer_id: metronomeCustomerId,
      package_alias: packageAlias,
      // Metronome requires starting_at on an hour boundary — round down to current hour.
      starting_at: new Date(
        Math.floor(Date.now() / 3_600_000) * 3_600_000
      ).toISOString(),
    });

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
    const error = normalizeError(err);
    logger.error(
      { error, metronomeCustomerId, packageAlias },
      "[Metronome] Failed to create contract"
    );
    return new Err(error);
  }
}

/**
 * Ensure a Metronome customer and contract exist for a workspace.
 * Creates the customer if missing, then creates a contract via the package alias.
 * Used from both Stripe webhook (checkout) and Poke (admin upgrade).
 */
export async function provisionMetronomeCustomerAndContract({
  workspaceId,
  workspaceName,
  stripeCustomerId,
  packageAlias,
}: {
  workspaceId: string;
  workspaceName: string;
  stripeCustomerId: string | null;
  packageAlias: string;
}): Promise<
  Result<{ metronomeCustomerId: string; contractId: string }, Error>
> {
  // Find or create customer.
  let metronomeCustomerId: string | null = null;

  const findResult = await findMetronomeCustomerByAlias(workspaceId);
  if (findResult.isOk()) {
    metronomeCustomerId = findResult.value;
  }

  if (!metronomeCustomerId) {
    const createResult = await createMetronomeCustomer({
      workspaceId,
      workspaceName,
      stripeCustomerId: stripeCustomerId ?? "",
    });
    if (createResult.isErr()) {
      return new Err(createResult.error);
    }
    metronomeCustomerId = createResult.value.metronomeCustomerId;
  }

  // Create contract.
  const contractResult = await createMetronomeContract({
    metronomeCustomerId,
    packageAlias,
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }

  return new Ok({
    metronomeCustomerId,
    contractId: contractResult.value.contractId,
  });
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
    const response = await getClient().v1.contracts.list({
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
 * End (cancel) a Metronome contract.
 * Pass endingBefore to end at a specific time, or omit to make the contract open-ended.
 */
export async function endMetronomeContract({
  metronomeCustomerId,
  contractId,
  endingBefore,
}: {
  metronomeCustomerId: string;
  contractId: string;
  endingBefore?: string;
}): Promise<Result<void, Error>> {
  try {
    await getClient().v1.contracts.updateEndDate({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
      ...(endingBefore ? { ending_before: endingBefore } : {}),
    });

    logger.info(
      { metronomeCustomerId, contractId, endingBefore },
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
}: {
  metronomeCustomerId: string;
  contractId: string;
  edits: SeatSubscriptionEdit[];
}): Promise<Result<void, Error>> {
  const now = new Date().toISOString();

  try {
    await getClient().v2.contracts.edit({
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
    for await (const product of getClient().v1.contracts.products.list()) {
      products.push({ id: product.id, name: product.current.name });
    }
    return new Ok(products);
  } catch (err) {
    const error = normalizeError(err);
    logger.error({ error }, "[Metronome] Failed to list products");
    return new Err(error);
  }
}
