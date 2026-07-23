import {
  generateCSVFileAndSnippet,
  generateSectionFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  SqlQueryOutputType,
  ThinkingOutputType,
  ToolGeneratedFilePathType,
  ToolGeneratedFileType,
  ToolMarkerResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { EXECUTE_TABLES_QUERY_MARKER } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  AgentLoopRunContext,
  SandboxFunctionRunContext,
  ToolRunContext,
} from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { CSVRecord } from "@app/lib/api/csv";
import { toCsv } from "@app/lib/api/csv";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { podScopedPath } from "@app/lib/api/file_system/types";
import { makeFileName } from "@app/lib/api/files/action_output_fs/naming";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { ConnectorProvider } from "@app/types/data_source";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

const TABLES_QUERY_SECTION_FILE_MIN_COLUMN_LENGTH = 500;

// Types for the resources that are output by the tools of this server.
type TablesQueryOutputResources =
  | ThinkingOutputType
  | SqlQueryOutputType
  | ToolGeneratedFileType
  | ToolGeneratedFilePathType
  | ToolMarkerResourceType;

type TablesQueryContentItem =
  | {
      type: "resource";
      resource: TablesQueryOutputResources;
    }
  | {
      type: "text";
      text: string;
    };

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

async function generateAgentLoopQueryResultFiles(
  auth: Authenticator,
  {
    queryTitle,
    results,
    runContext,
    connectorProvider,
  }: {
    queryTitle: string;
    results: CSVRecord[];
    runContext: AgentLoopRunContext;
    connectorProvider: ConnectorProvider | null;
  }
): Promise<TablesQueryContentItem[]> {
  const conversationId = runContext.conversation.sId;

  // Keep using the FileResource flow instead of DustFileSystem here so the file can
  // be uploaded to the conversation data source and queried by `tables_query` in
  // subsequent turns.
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
  const content: TablesQueryContentItem[] = [
    {
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
    },
  ];

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
        text: "Results are also available as a rich text file that can be viewed.",
        uri: sectionFile.getPublicUrl(auth),
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
        fileId: sectionFile.sId,
        title: `${queryTitle} (Rich Text)`,
        contentType: sectionFile.contentType,
        snippet: null,
      },
    });
  }

  return content;
}

async function writeSandboxFunctionQueryResultFile(
  auth: Authenticator,
  {
    queryTitle,
    results,
    runContext,
  }: {
    queryTitle: string;
    results: CSVRecord[];
    runContext: SandboxFunctionRunContext;
  }
): Promise<Result<ToolGeneratedFilePathType, MCPError>> {
  const fileSystemResult = await DustFileSystem.forPod(
    auth,
    runContext.invocation.sandboxFunction.space
  );
  if (fileSystemResult.isErr()) {
    return new Err(
      new MCPError(
        `Error accessing query result files: ${fileSystemResult.error.message}`,
        { cause: fileSystemResult.error }
      )
    );
  }

  const outputFileName = makeFileName({
    name: queryTitle,
    ext: ".csv",
  });
  const scopedPath = podScopedPath(
    runContext.invocation.sandboxFunction.space.sId,
    `${TOOL_OUTPUTS_FOLDER_NAME}/${runContext.invocation.sandboxFunction.slug}/${outputFileName}`
  );
  const csvContent = await toCsv(results);
  const writeResult = await fileSystemResult.value.write(
    scopedPath,
    csvContent,
    "text/csv"
  );
  if (writeResult.isErr()) {
    return new Err(
      new MCPError(
        `Error saving database query results: ${writeResult.error.message}`,
        { cause: writeResult.error }
      )
    );
  }

  return new Ok({
    text: "Your query results were generated successfully. They are available as a structured CSV file.",
    uri: scopedPath,
    path: scopedPath,
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE_PATH,
    title: outputFileName,
    contentType: "text/csv",
  });
}

export async function executeQuery(
  auth: Authenticator,
  {
    tables,
    query,
    runContext,
    fileName,
    connectorProvider,
  }: {
    tables: Array<{
      project_id: number;
      data_source_id: string;
      table_id: string;
    }>;
    query: string;
    runContext: ToolRunContext;
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

  const content: TablesQueryContentItem[] = [];

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

    switch (runContext.contextType) {
      case "agent_loop": {
        const agentLoopContent = await generateAgentLoopQueryResultFiles(auth, {
          queryTitle,
          results,
          runContext,
          connectorProvider,
        });
        content.push(...agentLoopContent);
        break;
      }
      case "sandbox_function": {
        const fileResult = await writeSandboxFunctionQueryResultFile(auth, {
          queryTitle,
          results,
          runContext,
        });
        if (fileResult.isErr()) {
          return fileResult;
        }

        content.push({
          type: "resource",
          resource: fileResult.value,
        });
        break;
      }
      default:
        return assertNever(runContext);
    }
  } else {
    content.push({
      type: "text",
      text: "Query executed successfully but returned no results. No files were generated.",
    });
  }

  return new Ok(content);
}
