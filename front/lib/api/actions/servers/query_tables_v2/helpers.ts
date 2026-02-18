import {
  generateCSVFileAndSnippet,
  generateSectionFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  SqlQueryOutputType,
  ThinkingOutputType,
  ToolGeneratedFileType,
  ToolMarkerResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { EXECUTE_TABLES_QUERY_MARKER } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import config from "@app/lib/api/config";
import type { CSVRecord } from "@app/lib/api/csv";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { ConnectorProvider } from "@app/types/data_source";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

const TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH = 500;

// Types for the resources that are output by the tools of this server.
type TablesQueryOutputResources =
  | ThinkingOutputType
  | SqlQueryOutputType
  | ToolGeneratedFileType
  | ToolMarkerResourceType;

/**
 * Get the prefix for a row in a section file.
 * This prefix is used to identify the row in the section file.
 * We currently only support Salesforce since it's the only connector for which we can generate a prefix.
 */
export function getSectionColumnsPrefix(
  provider: ConnectorProvider | null
): string[] | null {
  switch (provider) {
    case "salesforce":
      return ["Id", "Name"];
    case "confluence":
    case "github":
    case "google_drive":
    case "intercom":
    case "notion":
    case "slack_bot":
    case "slack":
    case "microsoft":
    case "microsoft_bot":
    case "webcrawler":
    case "snowflake":
    case "zendesk":
    case "bigquery":
    case "gong":
    case "discord_bot":
    case "dust_project":
    case null:
      return null;
    default:
      assertNever(provider);
  }
}

/**
 * Verifies that the user has read access to all provided data source views.
 * @returns null if user has access to all views, MCPError if access is denied
 */
export function verifyDataSourceViewReadAccess(
  auth: Authenticator,
  dataSourceViews: DataSourceViewResource[]
): MCPError | null {
  const unreadableViews = dataSourceViews.filter((dsv) => !dsv.canRead(auth));
  if (unreadableViews.length > 0) {
    return new MCPError(
      `Access denied: You do not have read permission to all the required documents.`
    );
  }
  return null;
}

export async function executeQuery(
  auth: Authenticator,
  {
    tables,
    query,
    conversationId,
    fileName,
    connectorProvider,
  }: {
    tables: Array<{
      project_id: number;
      data_source_id: string;
      table_id: string;
    }>;
    query: string;
    conversationId: string;
    fileName: string;
    connectorProvider: ConnectorProvider | null;
  }
) {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const queryResult = await coreAPI.queryDatabase({
    tables,
    query,
  });
  if (queryResult.isErr()) {
    return new Err(
      // Certain errors we don't track as they can occur in the context of a normal execution.
      new MCPError(
        "Error executing database query: " + queryResult.error.message,
        { tracked: false }
      )
    );
  }

  const content: {
    type: "resource";
    resource: TablesQueryOutputResources;
  }[] = [];

  const results: CSVRecord[] = queryResult.value.results
    .map((r) => r.value)
    .filter(
      (record) =>
        record !== undefined && record !== null && typeof record === "object"
    );

  content.push({
    type: "resource",
    resource: {
      text: EXECUTE_TABLES_QUERY_MARKER,
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOL_MARKER,
      uri: "",
    },
  });

  if (results.length > 0) {
    // date in yyyy-mm-dd
    const humanReadableDate = new Date().toISOString().split("T")[0];
    const queryTitle = `${fileName} (${humanReadableDate})`;

    // Generate the CSV file.
    const { csvFile, csvSnippet } = await generateCSVFileAndSnippet(auth, {
      title: queryTitle,
      conversationId,
      results,
    });

    // Upload the CSV file to the conversation data source.
    await uploadFileToConversationDataSource({
      auth,
      file: csvFile,
    });

    // Append the CSV file to the output of the tool as an agent-generated file.
    content.push({
      type: "resource",
      resource: {
        text: "Your query results were generated successfully. They are available as a structured CSV file.",
        uri: csvFile.getPublicUrl(auth),
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
        fileId: csvFile.sId,
        title: queryTitle,
        contentType: csvFile.contentType,
        snippet: csvSnippet,
      },
    });

    // Check if we should generate a section JSON file.
    const shouldGenerateSectionFile = results.some((result) =>
      Object.values(result).some(
        (value) =>
          typeof value === "string" &&
          value.length > TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH
      )
    );

    if (shouldGenerateSectionFile) {
      // First, we fetch the connector provider for the data source, cause the chunking
      // strategy of the section file depends on it: Since all tables are from the same
      // data source, we can just take the first table's data source view id.
      const sectionColumnsPrefix = getSectionColumnsPrefix(connectorProvider);

      // Generate the section file.
      const sectionFile = await generateSectionFile(auth, {
        title: queryTitle,
        conversationId,
        results,
        sectionColumnsPrefix,
      });

      // Upload the section file to the conversation data source.
      await uploadFileToConversationDataSource({
        auth,
        file: sectionFile,
      });

      // Append the section file to the output of the tool as an agent-generated file.
      content.push({
        type: "resource",
        resource: {
          text: "Results are also available as a rich text file that can be searched.",
          uri: sectionFile.getPublicUrl(auth),
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
          fileId: sectionFile.sId,
          title: `${queryTitle} (Rich Text)`,
          contentType: sectionFile.contentType,
          snippet: null,
        },
      });
    }
  }

  return new Ok(content);
}
