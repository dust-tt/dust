import type { AdditionalConfigurationType } from "@app/lib/models/agent/actions/mcp";
import { z } from "zod";

export const additionalConfigurationSchema = z.record(
  z.string(),
  z.union([
    z.boolean(),
    z.number(),
    z.string(),
    z.array(z.string()),
    // Allow only one level of nesting
    z.record(
      z.string(),
      z.union([z.boolean(), z.number(), z.string(), z.array(z.string())])
    ),
  ])
);

export type AdditionalConfigurationInBuilderType = z.infer<
  typeof additionalConfigurationSchema
>;

export function processAdditionalConfiguration(
  additionalConfiguration: AdditionalConfigurationInBuilderType
): AdditionalConfigurationType {
  // In agent builder v2, the additional configuration can be nested.
  // However, in the database, we store the additional configuration as a flat object with the nested objects flattened using the dot notation.
  // We need to flatten the additional configuration back into a nested object.

  const flattenConfig = (
    config: AdditionalConfigurationInBuilderType,
    output: AdditionalConfigurationType,
    prefix?: string
  ): AdditionalConfigurationType => {
    for (const [key, value] of Object.entries(config)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && !Array.isArray(value)) {
        output = flattenConfig(value, output, path);
      } else {
        output[path] = value;
      }
    }

    return output;
  };

  return flattenConfig(additionalConfiguration, {});
}
