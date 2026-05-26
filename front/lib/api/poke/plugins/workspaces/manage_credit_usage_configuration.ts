import { createPlugin } from "@app/lib/api/poke/types";
import { MAX_AWU_DISCOUNT_PERCENT } from "@app/lib/credits/awu_purchase_constants";
import {
  clearMetronomePaygCapAlert,
  upsertMetronomePaygCapAlert,
} from "@app/lib/metronome/payg_alerts";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { z } from "zod";

export const MAX_AWU_PAYG_CAP_CREDITS = 2_000_000;

const CreditUsageConfigurationSchema = z
  .object({
    defaultDiscountPercent: z
      .number()
      .min(0, "Discount percentage must be at least 0")
      .max(
        MAX_AWU_DISCOUNT_PERCENT,
        `Discount cannot exceed ${MAX_AWU_DISCOUNT_PERCENT}% for AWU credit purchases`
      )
      .default(0),
    paygCapEnabled: z.boolean(),
    // Lower bound is 0 (not 1) because the poke form sends `0` when the
    // toggle is off; the refine below enforces `>= 1` only when enabled.
    paygCapCredits: z
      .number()
      .int("AWU PAYG cap must be an integer number of credits")
      .min(0, "AWU PAYG cap must be non-negative")
      .max(
        MAX_AWU_PAYG_CAP_CREDITS,
        `AWU PAYG cap cannot exceed ${MAX_AWU_PAYG_CAP_CREDITS.toLocaleString()} credits`
      )
      .optional(),
  })
  .refine(
    (data) =>
      !(
        data.paygCapEnabled &&
        (data.paygCapCredits === undefined || data.paygCapCredits < 1)
      ),
    {
      message: "AWU PAYG cap must be at least 1 credit when the cap is enabled",
      path: ["paygCapCredits"],
    }
  );

export const manageCreditUsageConfigurationPlugin = createPlugin({
  manifest: {
    id: "manage-credit-usage-configuration",
    name: "Manage Credit Usage Configuration",
    description:
      "Configure AWU credit usage settings for this workspace: the default " +
      "discount applied to AWU credit purchases and the PAYG cap on AWU " +
      "consumption (in credits) used to drive the Metronome spend-threshold alert.",
    resourceTypes: ["workspaces"],
    args: {
      defaultDiscountPercent: {
        type: "number",
        variant: "text",
        label: "Default Discount (%)",
        description: `Discount applied to AWU credit purchases (0-${MAX_AWU_DISCOUNT_PERCENT}%).`,
        async: true,
      },
      paygCapEnabled: {
        type: "boolean",
        variant: "toggle",
        label: "AWU PAYG Cap",
        description:
          "Enable a Metronome spend-threshold alert when AWU consumption " +
          "reaches the configured cap (Metronome-billed workspaces only).",
        async: true,
      },
      paygCapCredits: {
        type: "number",
        variant: "text",
        label: "AWU PAYG Cap (credits)",
        description: `Maximum AWU consumption (in credits) before the spend-threshold alert fires. Range: 1-${MAX_AWU_PAYG_CAP_CREDITS.toLocaleString()}.`,
        async: true,
        dependsOn: { field: "paygCapEnabled", value: true },
      },
    },
  },

  populateAsyncArgs: async (auth) => {
    const config =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

    if (!config) {
      return new Ok({
        defaultDiscountPercent: 0,
        paygCapEnabled: false,
        paygCapCredits: 0,
      });
    }

    return new Ok({
      defaultDiscountPercent: config.defaultDiscountPercent,
      paygCapEnabled: config.paygCapCredits !== null,
      paygCapCredits: config.paygCapCredits ?? 0,
    });
  },

  execute: async (auth, _, args) => {
    const parseResult = CreditUsageConfigurationSchema.safeParse(args);

    if (!parseResult.success) {
      return new Err(
        new Error(
          `Invalid arguments: ${parseResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`
        )
      );
    }

    const { defaultDiscountPercent, paygCapEnabled, paygCapCredits } =
      parseResult.data;

    const workspace = auth.getNonNullableWorkspace();

    const resolvedPaygCapCredits = paygCapEnabled
      ? (() => {
          assert(
            paygCapCredits !== undefined,
            "[Unreachable] paygCapEnabled but paygCapCredits undefined"
          );
          return paygCapCredits;
        })()
      : null;

    const existingConfig =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

    if (existingConfig) {
      const updateResult = await existingConfig.updateConfiguration(auth, {
        defaultDiscountPercent,
        paygCapCredits: resolvedPaygCapCredits,
      });
      if (updateResult.isErr()) {
        return updateResult;
      }
    } else {
      const createResult = await CreditUsageConfigurationResource.makeNew(
        auth,
        {
          defaultDiscountPercent,
          paygCapCredits: resolvedPaygCapCredits,
        }
      );
      if (createResult.isErr()) {
        return createResult;
      }
    }

    if (workspace.metronomeCustomerId) {
      const alertResult =
        resolvedPaygCapCredits !== null
          ? await upsertMetronomePaygCapAlert({
              metronomeCustomerId: workspace.metronomeCustomerId,
              paygCapCredits: resolvedPaygCapCredits,
              workspaceId: workspace.sId,
            })
          : await clearMetronomePaygCapAlert({
              metronomeCustomerId: workspace.metronomeCustomerId,
              workspaceId: workspace.sId,
            });
      if (alertResult.isErr()) {
        return new Err(
          new Error(
            `Failed to sync Metronome PAYG cap alert: ${alertResult.error.message}`
          )
        );
      }
    }

    const discountStatus = `Discount: ${defaultDiscountPercent}%`;
    const paygStatus =
      resolvedPaygCapCredits !== null
        ? `AWU PAYG cap: ${resolvedPaygCapCredits.toLocaleString()} credits`
        : "AWU PAYG cap: disabled";

    return new Ok({
      display: "text",
      value: `${existingConfig ? "Changes saved" : "Configuration created"}. ${discountStatus}. ${paygStatus}.`,
    });
  },
});
