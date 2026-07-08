import type { ConnectorConfiguration } from "@app/types/connectors/configuration";
import { ConnectorConfigurationTypeSchema } from "@app/types/connectors/connectors_api";
import type { CoreAPILightDocument } from "@app/types/core/data_source";
import type { DataSourceType } from "@app/types/data_source";
import { CONNECTOR_PROVIDERS } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { DocumentType } from "@app/types/document";
import { z } from "zod";

export const PostDataSourceWithProviderRequestBodySchema = z.object({
  provider: z.enum(CONNECTOR_PROVIDERS),
  name: z.string().optional(),
  configuration: ConnectorConfigurationTypeSchema,
  connectionId: z.string().optional(), // Required for some providers
  relatedCredentialId: z.string().optional(), // Required for private integrations
  extraConfig: z.record(z.string(), z.string()).optional(), // Used by slack private integrations
});

const PostDataSourceWithoutProviderRequestBodySchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
});

export const PostDataSourceRequestBodySchema = z.union([
  PostDataSourceWithoutProviderRequestBodySchema,
  PostDataSourceWithProviderRequestBodySchema,
]);

export type PostDataSourceRequestBody = z.infer<
  typeof PostDataSourceRequestBodySchema
>;

export type PostSpaceDataSourceResponseBody = {
  dataSource: DataSourceType;
  dataSourceView: DataSourceViewType;
};

export type GetDataSourceConfigurationResponseBody = {
  configuration: ConnectorConfiguration;
};

export type PatchDataSourceConfigurationResponseBody =
  GetDataSourceConfigurationResponseBody;

export type PostDocumentResponseBody = {
  document: DocumentType | CoreAPILightDocument;
};

export type PatchDocumentResponseBody = {
  document: DocumentType | CoreAPILightDocument;
};
