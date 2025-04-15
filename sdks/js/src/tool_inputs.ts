import {z} from "zod";

import type {InternalConfigurationMimeType} from "./internal_mime_types";
import {INTERNAL_MIME_TYPES} from "./internal_mime_types";

export const DATA_SOURCE_CONFIGURATION_URI_PATTERN =
  /^data_source_configuration:\/\/dust\/w\/(\w+)\/data_source_configurations\/(\w+)$/;

export const TABLE_CONFIGURATION_URI_PATTERN =
  /^table_configuration:\/\/dust\/w\/(\w+)\/table_configurations\/(\w+)$/;

// URI pattern for configuring the agent to use within an action (agent calls agent, sort of Russian doll situation).
export const CHILD_AGENT_CONFIGURATION_URI_PATTERN =
  /^agent:\/\/dust\/w\/(\w+)\/agents\/(\w+)$/;

/**
 * Mapping between the mime types we used to identify a configurable resource and the Zod schema used to validate it.
 */
export const ConfigurableToolInputSchemas = {
  [INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE]: z.array(
    z.object({
      uri: z.string().regex(DATA_SOURCE_CONFIGURATION_URI_PATTERN),
      mimeType: z.literal(INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE),
    })
  ),
  [INTERNAL_MIME_TYPES.CONFIGURATION.TABLE]: z.array(
    z.object({
      uri: z.string().regex(TABLE_CONFIGURATION_URI_PATTERN),
      mimeType: z.literal(INTERNAL_MIME_TYPES.CONFIGURATION.TABLE),
    })
  ),
  [INTERNAL_MIME_TYPES.CONFIGURATION.CHILD_AGENT]: z.object({
    uri: z.string().regex(CHILD_AGENT_CONFIGURATION_URI_PATTERN),
    mimeType: z.literal(INTERNAL_MIME_TYPES.CONFIGURATION.CHILD_AGENT),
  }),
  [INTERNAL_MIME_TYPES.CONFIGURATION.STRING]: z.object({
    value: z.string(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.CONFIGURATION.STRING),
  }),
  [INTERNAL_MIME_TYPES.CONFIGURATION.NUMBER]: z.object({
    value: z.number(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.CONFIGURATION.NUMBER),
  }),
  [INTERNAL_MIME_TYPES.CONFIGURATION.BOOLEAN]: z.object({
    value: z.boolean(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.CONFIGURATION.BOOLEAN),
  }),
  // We use a satisfies here to ensure that all the InternalConfigurationMimeType are covered whilst preserving the type
  // inference in tools definitions (server.tool is templated).
} as const satisfies Record<InternalConfigurationMimeType, z.ZodSchema>;

export type ConfigurableToolInputType = z.infer<
  (typeof ConfigurableToolInputSchemas)[InternalConfigurationMimeType]
>;
