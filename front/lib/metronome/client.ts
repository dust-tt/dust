import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const METRONOME_BASE_URL = "https://api.metronome.com/v1";

export interface MetronomeEvent {
  transaction_id: string;
  customer_id: string;
  event_type: string;
  timestamp: string;
  properties: Record<string, string | number>;
}

export interface MetronomeCustomer {
  id: string;
  name: string;
  ingest_aliases: string[];
  custom_fields: Record<string, string>;
}

export interface MetronomeContract {
  id: string;
  subscriptions: MetronomeSubscription[];
}

export interface MetronomeSubscription {
  id: string;
  subscription_rate: {
    product_id: string;
    billing_frequency: string;
  };
  quantity_management_mode: string;
}

/**
 * Send usage events to Metronome's ingest API.
 * Fire-and-forget: logs errors but never throws.
 */
export async function ingestMetronomeEvents(
  events: MetronomeEvent[]
): Promise<void> {
  const apiKey = config.getMetronomeApiKey();
  if (!config.isMetronomeEnabled() || !apiKey || events.length === 0) {
    return;
  }

  try {
    const response = await fetch(`${METRONOME_BASE_URL}/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(events),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.warn(
        {
          status: response.status,
          body,
          eventCount: events.length,
        },
        "[Metronome] Ingest API returned non-OK status"
      );
    }
  } catch (err) {
    logger.warn(
      { error: normalizeError(err), eventCount: events.length },
      "[Metronome] Failed to call ingest API"
    );
  }
}

/**
 * Create a customer in Metronome, linked to an existing Stripe customer.
 * The workspace sId is set as an ingest alias so that usage events
 * with `customer_id: workspaceSId` are automatically matched.
 */
export async function createMetronomeCustomer({
  workspaceSId,
  workspaceName,
  stripeCustomerId,
}: {
  workspaceSId: string;
  workspaceName: string;
  stripeCustomerId: string;
}): Promise<Result<MetronomeCustomer, Error>> {
  const apiKey = config.getMetronomeApiKey();
  if (!config.isMetronomeEnabled() || !apiKey) {
    return new Err(new Error("Metronome is not enabled"));
  }

  try {
    const response = await fetch(`${METRONOME_BASE_URL}/customers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: workspaceName,
        ingest_aliases: [workspaceSId],
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
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // 409 means a customer with this ingest alias already exists — extract
      // the conflicting ID and return it rather than failing.
      if (response.status === 409) {
        try {
          const parsed = JSON.parse(body) as { conflicting_id?: string };
          if (parsed.conflicting_id) {
            logger.info(
              { workspaceSId, metronomeCustomerId: parsed.conflicting_id },
              "[Metronome] Customer already exists, reusing conflicting ID"
            );
            return new Ok({ id: parsed.conflicting_id } as MetronomeCustomer);
          }
        } catch {
          // fall through to generic error
        }
      }
      logger.error(
        {
          status: response.status,
          body,
          workspaceSId,
        },
        "[Metronome] Failed to create customer"
      );
      return new Err(
        new Error(`Metronome customer creation failed: ${response.status}`)
      );
    }

    const result = (await response.json()) as { data: MetronomeCustomer };
    logger.info(
      {
        workspaceSId,
        metronomeCustomerId: result.data.id,
      },
      "[Metronome] Customer created"
    );

    return new Ok(result.data);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, workspaceSId },
      "[Metronome] Failed to create customer"
    );
    return new Err(error);
  }
}

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
}): Promise<Result<MetronomeContract, Error>> {
  const apiKey = config.getMetronomeApiKey();
  if (!config.isMetronomeEnabled() || !apiKey) {
    return new Err(new Error("Metronome is not enabled"));
  }

  try {
    const response = await fetch(`${METRONOME_BASE_URL}/contracts/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: metronomeCustomerId,
        package_alias: packageAlias,
        // Metronome requires starting_at on an hour boundary — round down to current hour.
        starting_at: new Date(
          Math.floor(Date.now() / 3_600_000) * 3_600_000
        ).toISOString(),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error(
        {
          status: response.status,
          body,
          metronomeCustomerId,
          packageAlias,
        },
        "[Metronome] Failed to create contract"
      );
      return new Err(
        new Error(`Metronome contract creation failed: ${response.status}`)
      );
    }

    const result = (await response.json()) as { data: MetronomeContract };
    logger.info(
      {
        metronomeCustomerId,
        packageAlias,
        metronomeContractId: result.data.id,
      },
      "[Metronome] Contract created"
    );

    return new Ok(result.data);
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
 * Find a Metronome customer by ingest alias (workspace sId).
 * Returns the Metronome customer ID if found.
 */
export async function findMetronomeCustomerByAlias(
  workspaceSId: string
): Promise<Result<string | null, Error>> {
  const apiKey = config.getMetronomeApiKey();
  if (!config.isMetronomeEnabled() || !apiKey) {
    return new Err(new Error("Metronome is not enabled"));
  }

  try {
    const response = await fetch(
      `${METRONOME_BASE_URL}/customers?ingest_alias=${encodeURIComponent(workspaceSId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error(
        { status: response.status, body, workspaceSId },
        "[Metronome] Failed to find customer by alias"
      );
      return new Err(
        new Error(`Metronome customer lookup failed: ${response.status}`)
      );
    }

    const result = (await response.json()) as {
      data: MetronomeCustomer[];
    };
    return new Ok(result.data[0]?.id ?? null);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { error, workspaceSId },
      "[Metronome] Failed to find customer by alias"
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
  workspaceSId,
  workspaceName,
  stripeCustomerId,
  packageAlias,
}: {
  workspaceSId: string;
  workspaceName: string;
  stripeCustomerId: string | null;
  packageAlias: string;
}): Promise<
  Result<{ metronomeCustomerId: string; contract: MetronomeContract }, Error>
> {
  // Find or create customer.
  let metronomeCustomerId: string | null = null;

  const findResult = await findMetronomeCustomerByAlias(workspaceSId);
  if (findResult.isOk()) {
    metronomeCustomerId = findResult.value;
  }

  if (!metronomeCustomerId) {
    const createResult = await createMetronomeCustomer({
      workspaceSId,
      workspaceName,
      stripeCustomerId: stripeCustomerId ?? "",
    });
    if (createResult.isErr()) {
      return new Err(createResult.error);
    }
    metronomeCustomerId = createResult.value.id;
  }

  // Create contract.
  const contractResult = await createMetronomeContract({
    metronomeCustomerId,
    packageAlias,
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }

  return new Ok({ metronomeCustomerId, contract: contractResult.value });
}

/**
 * Add or remove seat IDs on a Metronome contract subscription.
 * Used when members join/leave or change seat type.
 */
export async function editMetronomeContractSeats({
  metronomeCustomerId,
  contractId,
  subscriptionEdits,
}: {
  metronomeCustomerId: string;
  contractId: string;
  subscriptionEdits: Array<{
    subscription_id: string;
    add_seat_ids?: string[];
    remove_seat_ids?: string[];
    add_unassigned_seats?: number;
  }>;
}): Promise<Result<void, Error>> {
  const apiKey = config.getMetronomeApiKey();
  if (!config.isMetronomeEnabled() || !apiKey) {
    return new Err(new Error("Metronome is not enabled"));
  }

  try {
    const response = await fetch(`${METRONOME_BASE_URL}/contracts/edit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: metronomeCustomerId,
        contract_id: contractId,
        subscription_edits: subscriptionEdits,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error(
        {
          status: response.status,
          body,
          metronomeCustomerId,
          contractId,
        },
        "[Metronome] Failed to edit contract seats"
      );
      return new Err(
        new Error(`Metronome seat edit failed: ${response.status}`)
      );
    }

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

/**
 * End (cancel) a Metronome contract at the end of the current billing period.
 * Pass endingBefore to end at a specific time, or omit for end-of-period.
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
  const apiKey = config.getMetronomeApiKey();
  if (!config.isMetronomeEnabled() || !apiKey) {
    return new Err(new Error("Metronome is not enabled"));
  }

  try {
    const response = await fetch(`${METRONOME_BASE_URL}/contracts/end`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: metronomeCustomerId,
        contract_id: contractId,
        ...(endingBefore ? { ending_before: endingBefore } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error(
        { status: response.status, body, metronomeCustomerId, contractId },
        "[Metronome] Failed to end contract"
      );
      return new Err(
        new Error(`Metronome contract end failed: ${response.status}`)
      );
    }

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

/**
 * Get the active contract and subscription IDs for a Metronome customer.
 * Returns the contract ID and a map of product_id → subscription_id for seat subscriptions.
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
  const apiKey = config.getMetronomeApiKey();
  if (!config.isMetronomeEnabled() || !apiKey) {
    return new Err(new Error("Metronome is not enabled"));
  }

  try {
    const response = await fetch(`${METRONOME_BASE_URL}/contracts/list`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customer_id: metronomeCustomerId }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error(
        { status: response.status, body, metronomeCustomerId },
        "[Metronome] Failed to list contracts"
      );
      return new Err(
        new Error(`Metronome contract list failed: ${response.status}`)
      );
    }

    const result = (await response.json()) as {
      data: MetronomeContract[];
    };

    if (result.data.length === 0) {
      return new Ok(null);
    }

    // Take the most recent contract.
    const contract = result.data[0];
    const seatSubscriptions: Record<string, string> = {};
    for (const sub of contract.subscriptions) {
      if (sub.quantity_management_mode === "SEAT_BASED") {
        seatSubscriptions[sub.subscription_rate.product_id] = sub.id;
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

export interface MetronomeProduct {
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
  const apiKey = config.getMetronomeApiKey();
  if (!config.isMetronomeEnabled() || !apiKey) {
    return new Err(new Error("Metronome is not enabled"));
  }

  try {
    const response = await fetch(`${METRONOME_BASE_URL}/products/list`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error(
        { status: response.status, body },
        "[Metronome] Failed to list products"
      );
      return new Err(
        new Error(`Metronome products list failed: ${response.status}`)
      );
    }

    const result = (await response.json()) as {
      data: Array<{ id: string; current: { name: string } }>;
    };
    return new Ok(result.data.map((p) => ({ id: p.id, name: p.current.name })));
  } catch (err) {
    const error = normalizeError(err);
    logger.error({ error }, "[Metronome] Failed to list products");
    return new Err(error);
  }
}
