// Okay to use public API types because here front is talking to core API.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import type {
  DataSourceFolderSpreadsheetMimeType,
  DataSourceSearchQuery,
  DataSourceSearchResponseType,
} from "@dust-tt/client";
import assert from "assert";
import type { Transaction } from "sequelize";

import { default as apiConfig, default as config } from "@app/lib/api/config";
import { UNTITLED_TITLE } from "@app/lib/api/content_nodes";
import { sendGitHubDeletionEmail } from "@app/lib/api/email";
import { upsertTableFromCsv } from "@app/lib/api/tables";
import {
  getMembers,
  getWorkspaceAdministrationVersionLock,
} from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { MAX_NODE_TITLE_LENGTH } from "@app/lib/content_nodes";
import { DustError } from "@app/lib/error";
import { getDustDataSourcesBucket } from "@app/lib/file_storage";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import { executeWithLock } from "@app/lib/lock";
import { TrackerDataSourceConfigurationModel } from "@app/lib/models/doc_tracker";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { enqueueUpsertTable } from "@app/lib/upsert_queue";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { cacheWithRedis } from "@app/lib/utils/cache";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { cleanTimestamp } from "@app/lib/utils/timestamps";
import logger from "@app/logger/logger";
import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";
import type {
  AdminCommandType,
  ConnectorProvider,
  ConnectorType,
  ConversationWithoutContentType,
  CoreAPIDataSource,
  CoreAPIDocument,
  CoreAPIError,
  CoreAPILightDocument,
  CoreAPITable,
  DataSourceType,
  DataSourceWithConnectorDetailsType,
  FrontDataSourceDocumentSectionType,
  PlanType,
  Result,
  WithConnector,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  ConnectorsAPI,
  CoreAPI,
  DEFAULT_EMBEDDING_PROVIDER_ID,
  DEFAULT_QDRANT_CLUSTER,
  dustManagedCredentials,
  EMBEDDING_CONFIGS,
  Err,
  isDataSourceNameValid,
  Ok,
  sectionFullText,
  validateUrl,
} from "@app/types";

import { ConversationResource } from "../resources/conversation_resource";

// Number of files we pull from GCS at once for deletion.
// If we have 10k documents of 100kB each (which is a lot) we are at 1GB here.
const FILE_BATCH_SIZE = 10_000;

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

/**
 * Soft delete a data source. This will mark the data source as deleted and will trigger a scrubbing.
 */
export async function softDeleteDataSourceAndLaunchScrubWorkflow(
  auth: Authenticator,
  dataSource: DataSourceResource,
  transaction?: Transaction
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

  // Soft delete all ds views for that data source.
  const views = await DataSourceViewResource.listForDataSources(auth, [
    dataSource,
  ]);
  await concurrentExecutor(
    views,
    async (view) => {
      const r = await view.delete(auth, { transaction, hardDelete: false });
      if (r.isErr()) {
        logger.error(
          { viewId: view.id, error: r.error },
          "Error deleting data source view"
        );
        throw r.error;
      }
    },
    {
      concurrency: 8,
    }
  );

  // Soft delete the data source.
  await dataSource.delete(auth, { transaction, hardDelete: false });

  // The scrubbing workflow will delete associated resources and hard delete the data source.
  await launchScrubDataSourceWorkflow(owner, dataSource);

  return new Ok(dataSource.toJSON());
}

/**
 * Performs a hard deletion of the specified data source, ensuring complete removal of the data
 * source and all its associated resources, including any existing connectors.
 */
export async function hardDeleteDataSource(
  auth: Authenticator,
  dataSource: DataSourceResource
) {
  assert(auth.isBuilder(), "Only builders can delete data sources.");

  // Delete all files in the data source's bucket.
  const { dustAPIProjectId } = dataSource;

  let files;

  do {
    files = await getDustDataSourcesBucket().getFiles({
      prefix: dustAPIProjectId,
      maxResults: FILE_BATCH_SIZE,
    });

    const chunkSize = 32;
    const chunks = [];
    for (let i = 0; i < files.length; i += chunkSize) {
      chunks.push(files.slice(i, i + chunkSize));
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) {
        continue;
      }
      await Promise.all(
        chunk.map((f) => {
          return (async () => {
            try {
              await f.delete();
            } catch (error) {
              if (isGCSNotFoundError(error)) {
                logger.warn(
                  {
                    path: f.name,
                    dataSourceId: dataSource.sId,
                    dustAPIProjectId,
                  },
                  "File not found during deletion, skipping"
                );
              } else {
                throw error;
              }
            }
          })();
        })
      );
    }
  } while (files.length === FILE_BATCH_SIZE);

  // Delete all trackers datasource configurations associated with the data source.
  await TrackerDataSourceConfigurationModel.destroy({
    where: {
      dataSourceId: dataSource.id,
    },
    hardDelete: true,
  });

  // Ensure all content fragments from dsviews are expired.
  // Only used temporarily to unstuck queues -- TODO(fontanierh)
  const views = await DataSourceViewResource.listForDataSources(
    auth,
    [dataSource],
    {
      includeDeleted: true,
    }
  );
  await concurrentExecutor(
    views,
    async (view) => {
      await view.expireContentFragments(auth);
    },
    {
      concurrency: 8,
    }
  );

  // Delete all connectors associated with the data source.
  if (dataSource.connectorId && dataSource.connectorProvider) {
    if (
      !CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider].isDeletable &&
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

  // Delete the data source from core.
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

  await dataSource.delete(auth, { hardDelete: true });

  if (dataSource.connectorProvider) {
    await warnPostDeletion(auth, dataSource.connectorProvider);
  }
}

async function warnPostDeletion(
  auth: Authenticator,
  dataSourceProvider: ConnectorProvider
) {
  // if the datasource is GitHub, send an email inviting to delete the GitHub app
  switch (dataSourceProvider) {
    case "github":
      // get admin emails
      const { members } = await getMembers(auth, {
        roles: ["admin"],
        activeOnly: true,
      });
      const adminEmails = members.map((u) => u.email);
      // send email to admins
      for (const email of adminEmails) {
        await sendGitHubDeletionEmail(email);
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
    const statusRes =
      await connectorsAPI.getConnectorFromDataSource(dataSource);
    if (statusRes.isErr()) {
      fetchConnectorError = true;
      fetchConnectorErrorMessage = statusRes.error.message;
    } else {
      connector = { ...statusRes.value, connectionId: null };
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

export interface UpsertDocumentArgs {
  document_id: string;
  source_url?: string | null;
  text?: string | null;
  section?: FrontDataSourceDocumentSectionType | null;
  tags?: string[] | null;
  parent_id?: string | null;
  parents?: string[] | null;
  timestamp?: number | null;
  light_document_output?: boolean;
  dataSource: DataSourceResource;
  auth: Authenticator;
  mime_type: string;
  title: string;
}

export async function upsertDocument({
  document_id,
  source_url,
  text,
  section,
  tags,
  parent_id,
  parents,
  timestamp,
  light_document_output,
  dataSource,
  auth,
  mime_type,
  title,
}: UpsertDocumentArgs): Promise<
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
  // enforcing validation on the parents and parent_id
  const documentId = document_id;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const documentParents = parents || [documentId];
  const documentParentId = parent_id ?? null;

  // parents must comply to the invariant parents[0] === document_id
  if (documentParents[0] !== documentId) {
    return new Err(
      new DustError(
        "invalid_parents",
        "Invalid request body, parents[0] and document_id should be equal"
      )
    );
  }
  // parents and parentId must comply to the invariant parents[1] === parentId || (parentId === null && parents.length < 2)
  if (
    (documentParents.length >= 2 || documentParentId !== null) &&
    documentParents[1] !== documentParentId
  ) {
    return new Err(
      new DustError(
        "invalid_parent_id",
        "Invalid request body, parents[1] and parent_id should be equal"
      )
    );
  }

  // Enforce a max size on the title: since these will be synced in ES we don't support arbitrarily large titles.
  if (title && title.length > MAX_NODE_TITLE_LENGTH) {
    return new Err(
      new DustError(
        "title_too_long",
        `Invalid title: title too long (max ${MAX_NODE_TITLE_LENGTH} characters).`
      )
    );
  }

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
      : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        section || null;

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const nonNullTags = tags || [];

  const titleInTags = nonNullTags
    .find((t) => t.startsWith("title:"))
    ?.substring(6);
  if (titleInTags && titleInTags !== title) {
    logger.warn(
      { dataSourceId: dataSource.sId, documentId, titleInTags, title },
      "Inconsistency between tags and title."
    );
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
    documentId,
    tags: nonNullTags,
    parentId: documentParentId,
    parents: documentParents,
    sourceUrl,
    timestamp: cleanTimestamp(timestamp),
    section: generatedSection,
    credentials,
    lightDocumentOutput: light_document_output === true,
    title,
    mimeType: mime_type,
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

export async function handleDataSourceSearch({
  searchQuery,
  dataSource,
  dataSourceView,
}: {
  searchQuery: DataSourceSearchQuery;
  dataSource: DataSourceResource;
  dataSourceView?: DataSourceViewResource;
}): Promise<
  Result<
    DataSourceSearchResponseType,
    Omit<DustError, "code"> & { code: "data_source_error" }
  >
> {
  // Dust managed credentials: all data sources.
  const credentials = dustManagedCredentials();

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const data = await coreAPI.searchDataSource(
    dataSource.dustAPIProjectId,
    dataSource.dustAPIDataSourceId,
    {
      query: searchQuery.query,
      topK: searchQuery.top_k,
      fullText: searchQuery.full_text,
      target_document_tokens: searchQuery.target_document_tokens,
      filter: {
        tags: {
          in: searchQuery.tags_in ?? null,
          not: searchQuery.tags_not ?? null,
        },
        parents: {
          in: searchQuery.parents_in ?? null,
          not: searchQuery.parents_not ?? null,
        },
        timestamp: {
          gt: searchQuery.timestamp_gt ?? null,
          lt: searchQuery.timestamp_lt ?? null,
        },
      },
      view_filter: dataSourceView
        ? {
            parents: {
              in: dataSourceView.parentsIn,
              not: [],
            },
            tags: null,
            timestamp: null,
          }
        : undefined,
      credentials: credentials,
    }
  );

  if (data.isErr()) {
    return new Err({
      name: "dust_error",
      code: "data_source_error",
      message: data.error.message,
    });
  }

  return new Ok({
    documents: data.value.documents,
  });
}

export interface UpsertTableArgs {
  tableId: string;
  name: string;
  description: string;
  truncate: boolean;
  async?: boolean;
  title: string;
  mimeType: string;
  fileId?: string;
  sourceUrl?: string | null;
  timestamp?: number | null;
  tags?: string[] | null;
  parentId?: string | null;
  parents?: string[] | null;
  allowEmptySchema?: boolean;
}

export function isUpsertDocumentArgs(
  args: UpsertTableArgs | UpsertDocumentArgs | undefined
): args is UpsertDocumentArgs {
  return args !== undefined && "document_id" in args;
}

export function isUpsertTableArgs(
  args: UpsertTableArgs | UpsertDocumentArgs | undefined
): args is UpsertTableArgs {
  return args !== undefined && "tableId" in args;
}

export async function upsertTable({
  auth,
  params,
  dataSource,
}: {
  auth: Authenticator;
  params: UpsertTableArgs;
  dataSource: DataSourceResource;
}): Promise<
  Result<
    | {
        table: {
          table_id: string;
        };
      }
    | {
        table: CoreAPITable;
      },
    DustError
  >
> {
  const owner = auth.getNonNullableWorkspace();

  const { name, description, fileId, truncate, async } = params;
  if (!fileId && truncate) {
    return new Err({
      name: "dust_error",
      code: "missing_csv",
      message: "Cannot truncate a table without providing a CSV.",
    });
  }

  const tableId = params.tableId;
  const tableParents: string[] = params.parents ?? [tableId];
  const tableParentId = params.parentId ?? null;

  // parents must comply to the invariant parents[0] === document_id
  if (tableParents[0] !== tableId) {
    return new Err({
      name: "dust_error",
      code: "invalid_parents",
      message: "Invalid parents: parents[0] and table_id should be equal",
    });
  }

  // parents and parentId must comply to the invariant parents[1] === parentId
  if (
    (tableParents.length >= 2 || tableParentId !== null) &&
    tableParents[1] !== tableParentId
  ) {
    return new Err({
      name: "dust_error",
      code: "invalid_parent_id",
      message: "Invalid parents: parents[1] and parent_id should be equal",
    });
  }

  // Enforce a max size on the title: since these will be synced in ES we don't support arbitrarily large titles.
  if (params.title && params.title.length > MAX_NODE_TITLE_LENGTH) {
    return new Err({
      name: "dust_error",
      code: "title_too_long",
      message:
        "Invalid title:" +
        `title too long (max ${MAX_NODE_TITLE_LENGTH} characters).`,
    });
  }

  const tableTags = params.tags ?? [];
  const titleInTags = tableTags
    .find((t) => t.startsWith("title:"))
    ?.substring(6);
  if (!titleInTags) {
    tableTags.push(`title:${params.title}`);
  }

  if (titleInTags && titleInTags !== params.title) {
    logger.warn(
      {
        dataSourceId: dataSource.sId,
        tableId,
        titleInTags,
        title: params.title,
      },
      "Inconsistency between tags and title."
    );
  }

  let standardizedSourceUrl: string | null = null;
  if (params.sourceUrl) {
    const { valid: isSourceUrlValid, standardized } = validateUrl(
      params.sourceUrl
    );

    if (!isSourceUrlValid) {
      return new Err({
        name: "dust_error",
        code: "invalid_url",
        message:
          "Invalid request: `source_url` if provided must be a valid URL",
      });
    }
    standardizedSourceUrl = standardized;
  }

  const title = params.title.trim() || name.trim() || UNTITLED_TITLE;

  if (fileId) {
    const file = await FileResource.fetchById(auth, fileId);
    if (!file) {
      return new Err<DustError>({
        name: "dust_error",
        code: "file_not_found",
        message:
          "The file associated with the fileId you provided was not found",
      });
    }
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    const schemaRes = await coreAPI.tableValidateCSVContent({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      bucket: file.getBucketForVersion("processed").name,
      bucketCSVPath: file.getCloudStoragePath(auth, "processed"),
    });
    if (schemaRes.isErr()) {
      if (schemaRes.error.code === "invalid_csv_content") {
        return new Err({
          name: "dust_error",
          code: "invalid_csv_content",
          message: schemaRes.error.message,
        });
      } else {
        logger.error(
          {
            bucket: file.getBucketForVersion("processed").name,
            bucketCSVPath: file.getCloudStoragePath(auth, "processed"),
            dataSourceId: dataSource.sId,
            error: schemaRes.error,
          },
          "Error validating CSV content"
        );
        return new Err({
          name: "dust_error",
          code: "internal_error",
          message: schemaRes.error.message,
        });
      }
    }
    if (!params.allowEmptySchema && schemaRes.value.schema.length === 0) {
      return new Err({
        name: "dust_error",
        code: "invalid_csv_content",
        message: "Invalid CSV content, skipping",
      });
    }
  }

  if (async) {
    const enqueueRes = await enqueueUpsertTable({
      upsertTable: {
        workspaceId: owner.sId,
        dataSourceId: dataSource.sId,
        tableId,
        tableName: name,
        tableDescription: description,
        tableTimestamp: params.timestamp ?? null,
        tableTags,
        tableParentId,
        tableParents,
        csv: null,
        fileId: fileId ?? null,
        truncate,
        title,
        mimeType: params.mimeType,
        sourceUrl: standardizedSourceUrl,
      },
    });
    if (enqueueRes.isErr()) {
      logger.error(
        {
          error: enqueueRes.error,
          workspaceId: owner.sId,
          dataSourceId: dataSource.sId,
          tableId,
        },
        "Error enqueueing the table for asynchronous upsert."
      );

      return new Err({
        name: "dust_error",
        code: "data_source_error",
        message:
          "There was an error enqueueing the table for asynchronous upsert.",
      });
    }
    return new Ok({
      table: {
        table_id: tableId,
      },
    });
  }

  const tableRes = await upsertTableFromCsv({
    auth,
    dataSource,
    tableId,
    tableName: name,
    tableDescription: description,
    tableTimestamp: params.timestamp ?? null,
    tableTags,
    tableParentId,
    tableParents,
    fileId: fileId ?? null,
    truncate,
    title,
    mimeType: params.mimeType,
    sourceUrl: standardizedSourceUrl,
  });

  if (tableRes.isErr()) {
    if (tableRes.error.type === "internal_server_error") {
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message: tableRes.error.message,
      });
    }

    if (tableRes.error.type === "invalid_request_error") {
      return new Err({
        name: "dust_error",
        code: "invalid_csv_and_file",
        message: "Invalid request body: " + tableRes.error.message,
      });
    }

    if (tableRes.error.type === "not_found_error") {
      return new Err({
        name: "dust_error",
        code: tableRes.error.notFoundError.type,
        message: tableRes.error.notFoundError.message,
      });
    }

    assertNever(tableRes.error);
  }

  return new Ok(tableRes.value);
}

export async function createDataSourceFolder(
  dataSource: DataSourceResource,
  {
    folderId,
    mimeType,
    parentId,
    parents,
    sourceUrl,
    title,
  }: {
    folderId: string;
    mimeType: DataSourceFolderSpreadsheetMimeType;
    parentId?: string | null;
    parents?: string[] | null;
    sourceUrl?: string | null;
    title: string;
  }
) {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  // Create folder with the Dust internal API.
  const upsertRes = await coreAPI.upsertDataSourceFolder({
    dataSourceId: dataSource.dustAPIDataSourceId,
    folderId,
    mimeType,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    parentId: parentId || null,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    parents: parents || [folderId],
    projectId: dataSource.dustAPIProjectId,
    providerVisibility: "public",
    sourceUrl,
    timestamp: Date.now(),
    title: title.trim() || "Untitled Folder",
  });

  if (upsertRes.isErr()) {
    return upsertRes;
  }

  return new Ok(upsertRes.value);
}

type DataSourceCreationError = Omit<DustError, "code"> & {
  code: "invalid_request_error" | "plan_limit_error" | "internal_server_error";
  dataSourceError?: CoreAPIError;
};

/**
 * Data sources without provider = folders
 */
export async function createDataSourceWithoutProvider(
  auth: Authenticator,
  {
    plan,
    owner,
    space,
    name,
    description,
    conversation,
  }: {
    plan: PlanType;
    owner: WorkspaceType;
    space: SpaceResource;
    name: string;
    description: string | null;
    conversation?: ConversationWithoutContentType;
  }
): Promise<Result<DataSourceViewResource, DataSourceCreationError>> {
  if (name.startsWith("managed-")) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "The data source name cannot start with `managed-`.",
    });
  }
  if (!isDataSourceNameValid(name)) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "Data source names cannot be empty.",
    });
  }

  return withTransaction(
    async (
      t
    ): Promise<Result<DataSourceViewResource, DataSourceCreationError>> => {
      // Only setup the lock if the workspace has a limit of data source
      if (plan.limits.dataSources.count !== -1) {
        await getWorkspaceAdministrationVersionLock(owner, t);
      }

      const dataSources = await DataSourceResource.listByWorkspace(
        auth,
        undefined,
        undefined,
        t
      );
      if (
        plan.limits.dataSources.count != -1 &&
        dataSources.length >= plan.limits.dataSources.count
      ) {
        return new Err({
          name: "dust_error",
          code: "plan_limit_error",
          message: "Your plan does not allow you to create more data sources.",
        });
      }

      if (dataSources.some((ds) => ds.name === name)) {
        return new Err({
          name: "dust_error",
          code: "invalid_request_error",
          message: "Data source with that name already exist.",
        });
      }

      const dataSourceEmbedder =
        owner.defaultEmbeddingProvider ?? DEFAULT_EMBEDDING_PROVIDER_ID;
      const embedderConfig = EMBEDDING_CONFIGS[dataSourceEmbedder];
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

      const dustProject = await coreAPI.createProject();
      if (dustProject.isErr()) {
        return new Err({
          name: "dust_error",
          code: "internal_server_error",
          message: "Failed to create internal project for the data source.",
          dataSourceError: dustProject.error,
        });
      }

      const dustDataSource = await coreAPI.createDataSource({
        projectId: dustProject.value.project.project_id.toString(),
        config: {
          qdrant_config: {
            cluster: DEFAULT_QDRANT_CLUSTER,
            shadow_write_cluster: null,
          },
          embedder_config: {
            embedder: {
              max_chunk_size: embedderConfig.max_chunk_size,
              model_id: embedderConfig.model_id,
              provider_id: embedderConfig.provider_id,
              splitter_id: embedderConfig.splitter_id,
            },
          },
        },
        credentials: dustManagedCredentials(),
        name,
      });

      if (dustDataSource.isErr()) {
        return new Err({
          name: "dust_error",
          code: "internal_server_error",
          message: "Failed to create the data source.",
          dataSourceError: dustDataSource.error,
        });
      }

      const dataSourceView =
        await DataSourceViewResource.createDataSourceAndDefaultView(
          {
            name,
            description,
            dustAPIProjectId: dustProject.value.project.project_id.toString(),
            dustAPIDataSourceId:
              dustDataSource.value.data_source.data_source_id,
            workspaceId: owner.id,
            assistantDefaultSelected: false,
            conversationId: conversation?.id,
          },
          space,
          auth.user(),
          t
        );

      try {
        // Asynchronous tracking without awaiting, handled safely
        void ServerSideTracking.trackDataSourceCreated({
          user: auth.user() ?? undefined,
          workspace: owner,
          dataSource: dataSourceView.dataSource.toJSON(),
        });
      } catch (error) {
        logger.error(
          {
            error,
          },
          "Failed to track data source creation"
        );
      }

      return new Ok(dataSourceView);
    }
  );
}

async function getOrCreateConversationDataSource(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<
  Result<
    DataSourceResource,
    Omit<DustError, "code"> & {
      code: "internal_server_error" | "invalid_request_error";
    }
  >
> {
  const lockName = "conversationDataSource" + conversation.id;

  const res = await executeWithLock(
    lockName,
    async (): Promise<
      Result<
        DataSourceResource,
        Omit<DustError, "code"> & {
          code: "internal_server_error" | "invalid_request_error";
        }
      >
    > => {
      // Fetch the datasource linked to the conversation...
      let dataSource = await DataSourceResource.fetchByConversation(
        auth,
        conversation
      );

      if (!dataSource) {
        // ...or create a new one.
        const conversationsSpace =
          await SpaceResource.fetchWorkspaceConversationsSpace(auth);

        // IMPORTANT: never use the conversation sID in the name or description, as conversation sIDs
        // are used as secrets to share the conversation within the workspace users.
        const r = await createDataSourceWithoutProvider(auth, {
          plan: auth.getNonNullablePlan(),
          owner: auth.getNonNullableWorkspace(),
          space: conversationsSpace,
          name: generateRandomModelSId("conv"),
          description: "Files uploaded to conversation",
          conversation: conversation,
        });

        if (r.isErr()) {
          return new Err({
            name: "dust_error",
            code: "internal_server_error",
            message: `Failed to create datasource : ${r.error}`,
          });
        }

        dataSource = r.value.dataSource;
      }

      return new Ok(dataSource);
    }
  );

  return res;
}

function validateFileMetadataForConversation(
  file: FileResource
): Result<string, Error> {
  const conversationId = file.useCaseMetadata?.conversationId;
  if (!conversationId) {
    return new Err(new Error("Field conversationId is missing from metadata"));
  }

  return new Ok(conversationId);
}

export async function getOrCreateConversationDataSourceFromFile(
  auth: Authenticator,
  file: FileResource
): Promise<
  Result<
    DataSourceResource,
    Omit<DustError, "code"> & {
      code: "internal_server_error" | "invalid_request_error";
    }
  >
> {
  // Note: this assume that if we don't have useCaseMetadata, the file is fine.
  const metadataResult = validateFileMetadataForConversation(file);
  if (metadataResult.isErr()) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: metadataResult.error.message,
    });
  }

  const cRes = await ConversationResource.fetchConversationWithoutContent(
    auth,
    metadataResult.value
  );
  if (cRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Failed to fetch conversation.`,
    });
  }

  return getOrCreateConversationDataSource(auth, cRes.value);
}

async function getAllManagedDataSources(auth: Authenticator) {
  const dataSources = await DataSourceResource.listByWorkspace(auth);

  return dataSources.filter((ds) => ds.connectorId !== null);
}

async function pauseAllManagedDataSources(
  auth: Authenticator,
  { markAsError }: { markAsError: boolean }
) {
  const dataSources = await getAllManagedDataSources(auth);

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const res = await concurrentExecutor(
    dataSources,
    async (ds) => {
      assert(ds.connectorId, "Connector ID is required");

      const { connectorId } = ds;

      if (markAsError) {
        const setErrorCommand: AdminCommandType = {
          majorCommand: "connectors",
          command: "set-error",
          args: {
            connectorId,
            error: "oauth_token_revoked",
            wId: auth.getNonNullableWorkspace().sId,
            dsId: ds.sId,
          },
        };

        const setErrorRes = await connectorsAPI.admin(setErrorCommand);
        if (setErrorRes.isErr()) {
          return new Err(new Error(setErrorRes.error.message));
        }
      }

      const pauseRes = await connectorsAPI.pauseConnector(ds.connectorId);
      if (pauseRes.isErr()) {
        return new Err(new Error(pauseRes.error.message));
      }

      logger.info(
        {
          connectorId: ds.connectorId,
          connectorProvider: ds.connectorProvider,
          dataSourceName: ds.name,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Paused connector"
      );

      return new Ok(pauseRes.value);
    },
    { concurrency: 5 }
  );

  const failed = res.filter((r) => r.isErr());
  if (failed.length > 0) {
    return new Err(new Error(`Failed to pause ${failed.length} connectors.`));
  }

  return new Ok(res);
}

async function unpauseAllManagedDataSources(
  auth: Authenticator,
  providers?: ConnectorProvider[]
) {
  const dataSources = await getAllManagedDataSources(auth);

  const filteredDataSources = dataSources.filter(
    // If no providers are provided, resume all data sources.
    (ds) =>
      !providers ||
      (ds.connectorProvider !== null &&
        providers.includes(ds.connectorProvider))
  );

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const res = await concurrentExecutor(
    filteredDataSources,
    async (ds) => {
      assert(ds.connectorId, "Connector ID is required");

      const unpauseRes = await connectorsAPI.unpauseConnector(ds.connectorId);
      if (unpauseRes.isErr()) {
        return new Err(new Error(unpauseRes.error.message));
      }

      return new Ok(unpauseRes.value);
    },
    { concurrency: 5 }
  );

  const failed = res.filter((r) => r.isErr());
  if (failed.length > 0) {
    return new Err(new Error(`Failed to unpause ${failed.length} connectors.`));
  }

  return new Ok(res);
}

export async function computeDataSourceStatistics(
  dataSources: DataSourceResource[]
) {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  return coreAPI.getDataSourceStats(
    dataSources.map(({ dustAPIProjectId, dustAPIDataSourceId }) => ({
      project_id: parseInt(dustAPIProjectId),
      data_source_id: dustAPIDataSourceId,
    }))
  );
}

export const computeWorkspaceOverallSizeCached = cacheWithRedis(
  async (auth: Authenticator) => {
    const dataSources = await DataSourceResource.listByWorkspace(
      auth,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_documents_document_get_or_upsert" }
    );
    const result = await computeDataSourceStatistics(dataSources);

    if (result.isErr()) {
      throw new Error(
        `Failed to get data source stats: ${result.error.message}`
      );
    }

    return result.value.overall_total_size;
  },
  (auth: Authenticator) => {
    const workspaceId = auth.getNonNullableWorkspace().sId;
    return `compute-datasource-stats:${workspaceId}`;
  },
  {
    ttlMs: 60 * 10 * 1000, // 10 minutes
  }
);
