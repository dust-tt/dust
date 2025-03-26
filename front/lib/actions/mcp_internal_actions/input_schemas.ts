import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

export const DataSourceConfigurationInputSchema = z.object({
  uri: z
    .string()
    .regex(
      /^data_source_configuration:\/\/dust\/w\/(\w+)\/data_source_configurations\/(\w+)$/
    ),
  mimeType: z.literal(INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE),
});
