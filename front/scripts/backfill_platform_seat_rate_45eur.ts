/**
 * For a fixed set of Metronome customers, verify that the Platform Seat
 * (Workspace Seat) monthly rate is currently 39 EUR, then add an override
 * raising it to 45 EUR.
 *
 * Idempotent: contracts already at 45 EUR are skipped.
 * Contracts whose current rate is NOT 39 EUR are skipped with a warning.
 *
 * Run with: npx tsx scripts/backfill_platform_seat_rate_45eur.ts [--execute]
 */

import { floorToHourISO, getMetronomeClient } from "@app/lib/metronome/client";
import {
  CREDIT_TYPE_EUR_ID,
  getProductWorkspaceSeatId,
} from "@app/lib/metronome/constants";
import type { Logger } from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { makeScript } from "./helpers";

const METRONOME_CUSTOMER_IDS = [
  "f110f1a6-1ad4-4707-bbed-19bafaecfc28",
  "52ef97b8-0c19-45ad-8b0f-66d516fe34b1",
  "d621044a-ac63-4bef-8667-a0bd40ef59a2",
  "67d30bb2-b21e-48c9-8da0-ca904112c00e",
  "3e0aaf11-8ffe-4ba3-ad06-c2b881e9f612",
  "13be4045-3cd0-43dc-8d41-0d1e3c6ebd74",
  "bff7b8ec-358e-48de-ab7c-2be6f4caa19a",
  "61282dae-44c4-4823-82d5-d594973793df",
  "83e44c27-7ff6-4a87-91e1-d42c8b83aa0e",
  "fdd31f38-ad76-460a-b3a9-d411c54f5ccd",
  "c9677e91-ded0-4548-9a4b-7fb938bb5dae",
  "1b5d6060-5611-4972-9a28-51030cef0484",
  "a1a2f3a8-1a19-471e-976d-0246ad7621f4",
  "c0b863f3-a0ed-4cb3-a19f-8c2d7d0c8754",
  "7c54e9de-d68a-4c9e-8ebc-af6581b2e7f1",
  "6f91ec27-47c9-4510-a934-7c203f89477a",
  "484c37c8-f6ae-4af3-92ed-3a5a6c58b91d",
  "11a4cecf-5438-4616-82bd-2e6c0a53010f",
  "8593efe5-0b8d-4331-9e22-4f202c5e4deb",
  "2947c8db-f8fa-4549-a6b3-d56612052c66",
  "2e0d95bb-d29e-4a0e-b559-99d606f3d2f6",
  "d3125813-2d5d-478e-ab0c-eb3db674d1a0",
  "8ed95320-4f3e-44c6-ae31-f7e3edd154a3",
  "a91631d7-8cdb-4d68-9a06-e7138dbd78d4",
  "93363b3e-92f4-43fe-ad07-5c350a68f336",
  "fbbd3422-d029-4b1b-939c-ef82dcc2190c",
  "34761576-4e4e-4faa-aeba-86bb957e87ae",
  "5614288d-9743-45c9-b363-0ac94b10cfe7",
  "b2766d99-9f3d-4ad8-8299-9976adb25764",
  "5577d213-5b46-444e-a638-05cacb921354",
  "7c80bd34-ac8c-44a1-bd08-e0b7375e5270",
  "d62764ba-8c89-4e45-809e-bb74f0e490b8",
  "1a6675f0-29bc-48be-82e8-9746c9c83fd3",
  "826e214e-5b58-4b3f-b007-d8572cf33b9d",
  "98488f6c-05dd-442a-8d68-68f432b42d68",
  "badd09a9-2718-4d42-b5a7-603577eab80e",
  "cb6ec794-cde1-4827-9548-d92156e932ea",
  "e789fe0f-eeba-4d11-98d1-2b1576266426",
];

const EXPECTED_PRICE_EUR = 39;
const NEW_PRICE_EUR = 45;

async function applyRateOverrideForCustomer(
  metronomeCustomerId: string,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const client = getMetronomeClient();
  const workspaceSeatProductId = getProductWorkspaceSeatId();

  let contracts;
  try {
    const response = await client.v2.contracts.list({
      customer_id: metronomeCustomerId,
    });
    contracts = response.data;
  } catch (err) {
    logger.error(
      { metronomeCustomerId, error: normalizeError(err).message },
      "[Override] Failed to list contracts"
    );
    return;
  }

  for (const contract of contracts) {
    const contractId = contract.id;

    const existingOverride = (contract.overrides ?? []).find(
      (o) =>
        o.entitled === true &&
        (o.product?.id === workspaceSeatProductId ||
          (o.override_specifiers ?? []).some(
            (s) => s.product_id === workspaceSeatProductId
          ))
    );

    if (!existingOverride) {
      logger.warn(
        { metronomeCustomerId, contractId },
        "[Override] No entitled Platform Seat override found on contract, skipping"
      );
      continue;
    }

    const currentPrice = existingOverride.overwrite_rate?.price;

    if (currentPrice === NEW_PRICE_EUR) {
      logger.info(
        { metronomeCustomerId, contractId },
        "[Override] Platform Seat already at 45 EUR, skipping"
      );
      continue;
    }

    if (currentPrice !== EXPECTED_PRICE_EUR) {
      logger.warn(
        { metronomeCustomerId, contractId, currentPrice },
        "[Override] Unexpected Platform Seat price (expected 39 EUR), skipping"
      );
      continue;
    }

    if (!execute) {
      logger.info(
        { metronomeCustomerId, contractId },
        "[Override] [DRY RUN] Would override Platform Seat from 39 EUR to 45 EUR"
      );
      continue;
    }

    try {
      await client.v2.contracts.edit({
        customer_id: metronomeCustomerId,
        contract_id: contractId,
        add_overrides: [
          {
            starting_at: floorToHourISO(new Date()),
            type: "OVERWRITE" as const,
            entitled: true,
            override_specifiers: [
              {
                product_id: workspaceSeatProductId,
                billing_frequency: "MONTHLY" as const,
              },
            ],
            overwrite_rate: {
              rate_type: "FLAT" as const,
              price: NEW_PRICE_EUR,
              credit_type_id: CREDIT_TYPE_EUR_ID,
            },
          },
        ],
      });
      logger.info(
        { metronomeCustomerId, contractId },
        "[Override] Successfully overrode Platform Seat to 45 EUR"
      );
    } catch (err) {
      logger.error(
        { metronomeCustomerId, contractId, error: normalizeError(err).message },
        "[Override] Failed to add override"
      );
    }
  }
}

makeScript({}, async ({ execute }, logger) => {
  for (const customerId of METRONOME_CUSTOMER_IDS) {
    await applyRateOverrideForCustomer(customerId, execute, logger);
  }
});
