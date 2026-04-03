import {
  CUSTOM_RESOURCE_ALLOWED,
  INTERNAL_ALLOWED_ICONS,
} from "@app/components/resources/resources_icon_names";
import {
  DataSourceConfigurationSchema,
  ProjectConfigurationSchema,
  TableDataSourceConfigurationSchema,
} from "@app/lib/api/assistant/configuration/types";
import { DustAppRunConfigurationSchema } from "@app/types/app";
import { DbModelIdSchema } from "@app/types/shared/model_id";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";

const ResourceIconSchema = z.enum([
  ...CUSTOM_RESOURCE_ALLOWED,
  ...INTERNAL_ALLOWED_ICONS,
]);

export const BaseMCPServerConfigurationSchema = z.object({
  id: DbModelIdSchema,
  sId: z.string(),
  type: z.literal("mcp_server_configuration"),
  name: z.string(),
  description: z.string().nullable(),
  icon: ResourceIconSchema.optional(),
});

export const ServerSideMCPServerConfigurationSchema =
  BaseMCPServerConfigurationSchema.extend({
    dataSources: z.array(DataSourceConfigurationSchema).nullable(),
    tables: z.array(TableDataSourceConfigurationSchema).nullable(),
    childAgentId: z.string().nullable(),
    timeFrame: z
      .object({
        duration: z.number(),
        unit: z.enum(["hour", "day", "week", "month", "year"]),
      })
      .nullable(),
    jsonSchema: z.custom<JSONSchema>().nullable(),
    additionalConfiguration: z.record(
      z.string(),
      z.union([z.boolean(), z.number(), z.string(), z.array(z.string())])
    ),
    mcpServerViewId: z.string(),
    dustAppConfiguration: DustAppRunConfigurationSchema.nullable(),
    secretName: z.string().nullable(),
    dustProject: ProjectConfigurationSchema.nullable(),
    internalMCPServerId: z.string().nullable(),
  });

export const ClientSideMCPServerConfigurationSchema =
  BaseMCPServerConfigurationSchema.extend({
    clientSideMcpServerId: z.string(),
  });

export const MCPServerConfigurationSchema = z.union([
  ServerSideMCPServerConfigurationSchema,
  ClientSideMCPServerConfigurationSchema,
]);

export type BaseMCPServerConfigurationType = z.infer<
  typeof BaseMCPServerConfigurationSchema
>;
export type ServerSideMCPServerConfigurationType = z.infer<
  typeof ServerSideMCPServerConfigurationSchema
>;
export type ClientSideMCPServerConfigurationType = z.infer<
  typeof ClientSideMCPServerConfigurationSchema
>;
export type MCPServerConfigurationType = z.infer<
  typeof MCPServerConfigurationSchema
>;
