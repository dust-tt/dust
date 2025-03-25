import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

export const DataSourceConfigurationInputSchema = z.object({
  uri: z.literal(
    "data_source_configuration://dust/w/{wId}/data_source_configurations/{dscId}"
  ),
  mimeType: z.literal(INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE),
});
