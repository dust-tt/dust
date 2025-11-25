import { z } from "zod";

import { createPlugin } from "@app/lib/api/poke/types";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { Err, Ok } from "@app/types";

const MAX_FREE_CREDITS_DOLLARS = 10000;

const ManageProgrammaticUsageConfigurationSchema = z.object({
  freeCreditsDollars: z
    .number()
    .min(0, "Free credits must positive")
    .max(
      MAX_FREE_CREDITS_DOLLARS,
      `Free credits cannot exceed $${MAX_FREE_CREDITS_DOLLARS.toLocaleString()}`
    )
    .optional(),
  defaultDiscountPercent: z
    .number()
    .min(0, "Discount percentage must be at least 0")
    .max(100, "Discount percentage cannot exceed 100")
    .optional()
    .default(0),
});

export const manageProgrammaticUsageConfigurationPlugin = createPlugin({
  manifest: {
    id: "manage-programmatic-usage-configuration",
    name: "Manage Programmatic Usage Configuration",
    description:
      "View and configure programmatic usage settings for this workspace. " +
      "Set monthly recurring free credits and default discount percentage applied when computing usage costs.",
    resourceTypes: ["workspaces"],
    args: {
      freeCreditsDollars: {
        type: "number",
        label: "Free Credits (USD)",
        description: `Monthly recurring free credits (0-$${MAX_FREE_CREDITS_DOLLARS.toLocaleString()}). Set to 0 to REMOVE and instead use automatic free credits based on user count brackets.`,
        async: true,
      },
      defaultDiscountPercent: {
        type: "number",
        label: "Default Discount (%)",
        description:
          "Discount percentage applied when computing usage costs (0-100%). Defaults to 0.",
        async: true,
      },
    },
  },

  populateAsyncArgs: async (auth) => {
    const config =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

    if (!config) {
      return new Ok({
        freeCreditsDollars: undefined,
        defaultDiscountPercent: 0,
      });
    }

    return new Ok({
      freeCreditsDollars:
        config.freeCreditCents !== null
          ? config.freeCreditCents / 100
          : undefined,
      defaultDiscountPercent: config.defaultDiscountPercent,
    });
  },

  execute: async (auth, _, args) => {
    const parseResult =
      ManageProgrammaticUsageConfigurationSchema.safeParse(args);

    if (!parseResult.success) {
      return new Err(
        new Error(
          `Invalid arguments: ${parseResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`
        )
      );
    }

    const { freeCreditsDollars, defaultDiscountPercent } = parseResult.data;

    // 0 means REMOVE overidden freeCreditCents (and instead use brackets algorithm)
    const freeCreditCents = freeCreditsDollars
      ? Math.round(freeCreditsDollars * 100)
      : undefined;

    const existingConfig =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

    if (existingConfig) {
      const updateResult = await existingConfig.updateConfiguration(auth, {
        freeCreditCents,
        defaultDiscountPercent,
      });

      if (updateResult.isErr()) {
        return updateResult;
      }

      return new Ok({
        display: "text",
        value: "Changes saved.",
      });
    } else {
      const createResult = await ProgrammaticUsageConfigurationResource.makeNew(
        auth,
        {
          freeCreditCents,
          defaultDiscountPercent,
          paygCapCents: null,
        }
      );

      if (createResult.isErr()) {
        return createResult;
      }

      return new Ok({
        display: "text",
        value: "Changes saved.",
      });
    }
  },
});
