import type {
  ConnectorProvider,
  ConnectorType,
  CoreAPIDataSource,
  CoreAPIDocument,
  CoreAPILightDocument,
  DataSourceType,
  DataSourceWithConnectorDetailsType,
  FrontDataSourceDocumentSectionType,
  Result,
  WithConnector,
} from "@dust-tt/types";
import {
  ConnectorsAPI,
  CoreAPI,
  dustManagedCredentials,
  Err,
  Ok,
  sectionFullText,
} from "@dust-tt/types";

import { default as apiConfig, default as config } from "@app/lib/api/config";
import { rowsFromCsv, upsertTableFromCsv } from "@app/lib/api/tables";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { sendGithubDeletionEmail } from "@app/lib/email";
import { DustError } from "@app/lib/error";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import { enqueueUpsertTable } from "@app/lib/upsert_queue";
import { validateUrl } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";

export const MANAGED_DS_DELETABLE_AS_BUILDER: ConnectorProvider[] = [
  "webcrawler",
];

export async function getDataSource(
  auth: Authenticator,
  nameOrId: string,
  { includeEditedBy }: { includeEditedBy: boolean } = {
    includeEditedBy: false,
  }
): Promise<DataSourceResource | null> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return null;
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(auth, nameOrId, {
    includeEditedBy,
    // TODO(DATASOURCE_SID): clean-up
    origin: "lib_api_get_data_source",
  });

  if (!dataSource) {
    return null;
  }

  return dataSource;
}

export async function getDataSources(
  auth: Authenticator,
  { includeEditedBy }: { includeEditedBy: boolean } = {
    includeEditedBy: false,
  }
): Promise<DataSourceResource[]> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return [];
  }

  return DataSourceResource.listByWorkspace(auth, {
    includeEditedBy,
  });
}

export async function deleteDataSource(
  auth: Authenticator,
  dataSource: DataSourceResource
): Promise<
  Result<DataSourceType, { code: "unauthorized_deletion"; message: string }>
> {
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isBuilder()) {
    return new Err({
      code: "unauthorized_deletion",
      message: "Only builders can delete data sources.",
    });
  }

  const dustAPIProjectId = dataSource.dustAPIProjectId;

  if (dataSource.connectorId && dataSource.connectorProvider) {
    if (
      !MANAGED_DS_DELETABLE_AS_BUILDER.includes(dataSource.connectorProvider) &&
      !auth.isAdmin()
    ) {
      return new Err({
        code: "unauthorized_deletion",
        message:
          "Only users that are `admins` for the current workspace can delete connections.",
      });
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connDeleteRes = await connectorsAPI.deleteConnector(
      dataSource.connectorId.toString(),
      true
    );
    if (connDeleteRes.isErr()) {
      // If we get a not found we proceed with the deletion of the data source. This will enable
      // us to retry deletion of the data source if it fails at a later stage. Otherwise we throw
      // as this is unexpected.
      if (connDeleteRes.error.type !== "connector_not_found") {
        throw new Error(
          "Unexpected error deleting connector: " + connDeleteRes.error.message
        );
      }
    }
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const coreDeleteRes = await coreAPI.deleteDataSource({
    projectId: dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
  });
  if (coreDeleteRes.isErr()) {
    // Same as above we proceed with the deletion if the data source is not found in core. Otherwise
    // we throw as this is unexpected.
    if (coreDeleteRes.error.code !== "data_source_not_found") {
      throw new Error(
        "Unexpected error deleting data source: " + coreDeleteRes.error.message
      );
    }
  }

  await dataSource.delete(auth);

  await launchScrubDataSourceWorkflow({
    wId: owner.sId,
    dustAPIProjectId,
  });
  if (dataSource.connectorProvider) {
    await warnPostDeletion(auth, dataSource.connectorProvider);
  }

  return new Ok(dataSource.toJSON());
}

async function warnPostDeletion(
  auth: Authenticator,
  dataSourceProvider: ConnectorProvider
) {
  // if the datasource is Github, send an email inviting to delete the Github app
  switch (dataSourceProvider) {
    case "github":
      // get admin emails
      const adminEmails = (await getMembers(auth, { roles: ["admin"] })).map(
        (u) => u.email
      );
      // send email to admins
      for (const email of adminEmails) {
        await sendGithubDeletionEmail(email);
      }
      break;
    default:
      break;
  }
}

export async function augmentDataSourceWithConnectorDetails(
  dataSource: DataSourceType & WithConnector
): Promise<DataSourceWithConnectorDetailsType> {
  let connector: ConnectorType | null = null;
  let fetchConnectorError = false;
  let fetchConnectorErrorMessage: string | null = null;
  try {
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const statusRes = await connectorsAPI.getConnector(dataSource.connectorId);
    if (statusRes.isErr()) {
      fetchConnectorError = true;
      fetchConnectorErrorMessage = statusRes.error.message;
    } else {
      connector = statusRes.value;
    }
  } catch (e) {
    // Probably means `connectors` is down, we don't fail to avoid a 500 when just displaying
    // the datasources (eventual actions will fail but a 500 just at display is not desirable).
    // When that happens the managed data sources are shown as failed.
    fetchConnectorError = true;
    fetchConnectorErrorMessage = "Synchonization service is down";
  }

  return {
    ...dataSource,
    connector,
    fetchConnectorError,
    fetchConnectorErrorMessage,
  };
}

export async function upsertDocument({
  name,
  source_url,
  text,
  section,
  tags,
  parents,
  timestamp,
  light_document_output,
  dataSource,
  auth,
}: {
  name: string;
  source_url?: string | null;
  text?: string | null;
  section?: FrontDataSourceDocumentSectionType | null;
  tags?: string[] | null;
  parents?: string[] | null;
  timestamp?: number | null;
  light_document_output?: boolean;
  dataSource: DataSourceResource;
  auth: Authenticator;
}): Promise<
  Result<
    {
      document:
        | CoreAPIDocument
        // if lightDocumentOutput is true, we return this type
        | CoreAPILightDocument;

      data_source: CoreAPIDataSource;
    },
    DustError
  >
> {
  let sourceUrl: string | null = null;
  if (source_url) {
    const { valid: isSourceUrlValid, standardized: standardizedSourceUrl } =
      validateUrl(source_url);

    if (!isSourceUrlValid) {
      return new Err(
        new DustError(
          "invalid_url",
          "Invalid request body, `source_url` if provided must be a valid URL."
        )
      );
    }
    sourceUrl = standardizedSourceUrl;
  }

  const generatedSection =
    typeof text === "string"
      ? {
          prefix: null,
          content: text,
          sections: [],
        }
      : section || null;

  const nonNullTags = tags || [];

  // Add selection of tags as prefix to the section if they are present.
  let tagsPrefix = "";
  ["title", "author"].forEach((t) => {
    nonNullTags.forEach((tag) => {
      if (tag.startsWith(t + ":") && tag.length > t.length + 1) {
        tagsPrefix += `$${t} : ${tag.slice(t.length + 1)}\n`;
      }
    });
  });
  if (tagsPrefix && generatedSection) {
    generatedSection.prefix = tagsPrefix;
  }

  if (!generatedSection) {
    return new Err(
      new DustError(
        "text_or_section_required",
        "Invalid request body, `text` or `section` must be provided."
      )
    );
  }

  const fullText = sectionFullText(generatedSection);

  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
  const plan = auth.getNonNullablePlan();
  // Enforce plan limits: DataSource documents count.
  // We only load the number of documents if the limit is not -1 (unlimited).
  // the `getDataSourceDocuments` query involves a SELECT COUNT(*) in the DB that is not
  // optimized, so we avoid it for large workspaces if we know we're unlimited anyway
  if (plan.limits.dataSources.documents.count !== -1) {
    const documents = await coreAPI.getDataSourceDocuments(
      {
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
      },
      { limit: 1, offset: 0 }
    );
    if (documents.isErr()) {
      return new Err(
        new DustError(
          "core_api_error",
          "There was an error retrieving the data source."
        )
      );
    }

    if (
      plan.limits.dataSources.documents.count != -1 &&
      documents.value.total >= plan.limits.dataSources.documents.count
    ) {
      return new Err(
        new DustError(
          "data_source_quota_error",
          `Data sources are limited to ${plan.limits.dataSources.documents.count} ` +
            `documents on your current plan. Contact support@dust.tt if you want to increase this limit.`
        )
      );
    }
  }

  // Enforce plan limits: DataSource document size.
  if (
    plan.limits.dataSources.documents.sizeMb != -1 &&
    fullText.length > 1024 * 1024 * plan.limits.dataSources.documents.sizeMb
  ) {
    return new Err(
      new DustError(
        "data_source_quota_error",
        `Data sources document upload size is limited to ` +
          `${plan.limits.dataSources.documents.sizeMb}MB on your current plan. ` +
          `You are attempting to upload ${fullText.length} bytes. ` +
          `Contact support@dust.tt if you want to increase it.`
      )
    );
  }

  // Data source operations are performed with our credentials.
  const credentials = dustManagedCredentials();

  // Create document with the Dust internal API.
  const upsertRes = await coreAPI.upsertDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId: name,
    tags: nonNullTags,
    parents: parents || [],
    sourceUrl,
    timestamp: timestamp || null,
    section: generatedSection,
    credentials,
    lightDocumentOutput: light_document_output === true,
  });

  if (upsertRes.isErr()) {
    return new Err(
      new DustError(
        "core_api_error",
        "There was an error upserting the document."
      )
    );
  }

  return new Ok(upsertRes.value);
}

export async function upsertTable({
  tableId,
  name,
  description,
  truncate,
  csv,
  tags,
  parents,
  timestamp,
  async,
  dataSource,
  auth,
}: {
  tableId?: string | null;
  name: string;
  description: string;
  truncate: boolean;
  csv?: string | null;
  tags?: string[] | null;
  parents?: string[] | null;
  timestamp?: number | null;
  async: boolean;
  dataSource: DataSourceResource;
  auth: Authenticator;
}) {
  const nonNullTableId = tableId ?? generateLegacyModelSId();
  const tableParents: string[] = parents ?? [];

  if (!tableParents.includes(nonNullTableId)) {
    tableParents.push(nonNullTableId);
  }

  const useAppForHeaderDetection = auth
    .getNonNullableWorkspace()
    .flags.includes("use_app_for_header_detection");

  if (async) {
    // Ensure the CSV is valid before enqueuing the upsert.
    const csvRowsRes = csv ? await rowsFromCsv(auth, csv, false) : null;
    if (csvRowsRes?.isErr()) {
      return csvRowsRes;
    }

    const enqueueRes = await enqueueUpsertTable({
      upsertTable: {
        workspaceId: auth.getNonNullableWorkspace().sId,
        dataSourceId: dataSource.sId,
        tableId: nonNullTableId,
        tableName: name,
        tableDescription: description,
        tableTimestamp: timestamp ?? null,
        tableTags: tags ?? [],
        tableParents,
        csv: csv ?? null,
        truncate,
        useAppForHeaderDetection,
      },
    });
    if (enqueueRes.isErr()) {
      return enqueueRes;
    }

    return new Ok(undefined);
  }

  const tableRes = await upsertTableFromCsv({
    auth,
    dataSource: dataSource,
    tableId: nonNullTableId,
    tableName: name,
    tableDescription: description,
    tableTimestamp: timestamp ?? null,
    tableTags: tags || [],
    tableParents,
    csv: csv ?? null,
    truncate,
    useAppForHeaderDetection,
  });

  return tableRes;
}
