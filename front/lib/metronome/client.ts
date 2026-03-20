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
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
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
