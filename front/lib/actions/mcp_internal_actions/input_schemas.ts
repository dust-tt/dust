import { MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

export const DataSourceConfigurationInputSchema = z.object({
  type: z.literal("object"),
  inputSchema: z.object({
    uri: z.literal(
      "data_source_configuration://dust/w/{wId}/data_source_configurations/{dscId}"
    ),
    mimeType: z.literal(MIME_TYPES.DATA_SOURCE_CONFIGURATION),
  }),
});
