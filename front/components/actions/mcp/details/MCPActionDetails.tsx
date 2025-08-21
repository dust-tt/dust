import {
  ActionDocumentTextIcon,
  ClockIcon,
  cn,
  CollapsibleComponent,
  ContentMessage,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  Markdown,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { MCPAgentManagementActionDetails } from "@app/components/actions/mcp/details/MCPAgentManagementActionDetails";
import { MCPBrowseActionDetails } from "@app/components/actions/mcp/details/MCPBrowseActionDetails";
import {
  DataSourceNodeContentDetails,
  FilesystemPathDetails,
} from "@app/components/actions/mcp/details/MCPDataSourcesFileSystemActionDetails";
import { MCPDataWarehousesBrowseDetails } from "@app/components/actions/mcp/details/MCPDataWarehousesBrowseDetails";
import { MCPExtractActionDetails } from "@app/components/actions/mcp/details/MCPExtractActionDetails";
import { MCPGetDatabaseSchemaActionDetails } from "@app/components/actions/mcp/details/MCPGetDatabaseSchemaActionDetails";
import { MCPReasoningActionDetails } from "@app/components/actions/mcp/details/MCPReasoningActionDetails";
import { MCPRunAgentActionDetails } from "@app/components/actions/mcp/details/MCPRunAgentActionDetails";
import { MCPTablesQueryActionDetails } from "@app/components/actions/mcp/details/MCPTablesQueryActionDetails";
import { SearchResultDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { MCPActionType } from "@app/lib/actions/mcp";
import {
  DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME,
  DATA_WAREHOUSES_FIND_TOOL_NAME,
  DATA_WAREHOUSES_LIST_TOOL_NAME,
  DATA_WAREHOUSES_QUERY_TOOL_NAME,
  EXECUTE_DATABASE_QUERY_TOOL_NAME,
  FILESYSTEM_CAT_TOOL_NAME,
  FILESYSTEM_FIND_TOOL_NAME,
  FILESYSTEM_LIST_TOOL_NAME,
  FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
  GET_DATABASE_SCHEMA_TOOL_NAME,
  INCLUDE_TOOL_NAME,
  PROCESS_TOOL_NAME,
  QUERY_TABLES_TOOL_NAME,
  SEARCH_TOOL_NAME,
  WEBBROWSER_TOOL_NAME,
  WEBSEARCH_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getOutputText,
  isResourceContentWithText,
  isTextContent,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { makeQueryResource } from "@app/lib/actions/mcp_internal_actions/rendering";
import { MCP_SPECIFICATION } from "@app/lib/actions/utils";
import { isValidJSON } from "@app/lib/utils/json";
import type { LightWorkspaceType } from "@app/types";
import {
  asDisplayName,
  isSupportedImageContentType,
  parseTimeFrame,
} from "@app/types";

export interface MCPActionDetailsProps {
  action: MCPActionType;
  owner: LightWorkspaceType;
  lastNotification: ProgressNotificationContentType | null;
  messageStatus?: "created" | "succeeded" | "failed" | "cancelled";
  viewType: "conversation" | "sidebar";
}

export function MCPActionDetails(props: MCPActionDetailsProps) {
  const {
    action: { output, functionCallName, internalMCPServerName, params },
    viewType,
  } = props;

  const parts = functionCallName ? functionCallName.split("__") : [];
  const toolName = parts[parts.length - 1];

  if (
    internalMCPServerName === "search" ||
    internalMCPServerName === "data_sources_file_system"
  ) {
    if (toolName === SEARCH_TOOL_NAME) {
      const timeFrame = parseTimeFrame(params.relativeTimeFrame as string);
      const queryResource = makeQueryResource({
        query: params.query as string,
        timeFrame: timeFrame,
        tagsIn: params.tagsIn as string[],
        tagsNot: params.tagsNot as string[],
        nodeIds: params.nodeIds as string[],
      });

      return (
        <SearchResultDetails
          viewType={viewType}
          defaultQuery={queryResource.text}
          actionName={
            viewType === "conversation" ? "Searching data" : "Search data"
          }
          actionOutput={output}
          visual={MagnifyingGlassIcon}
        />
      );
    }

    if (
      toolName === FILESYSTEM_LIST_TOOL_NAME ||
      toolName === FILESYSTEM_FIND_TOOL_NAME
    ) {
      return (
        <SearchResultDetails
          viewType={viewType}
          actionName={
            viewType === "conversation"
              ? "Browsing data sources"
              : "Browse data sources"
          }
          actionOutput={output}
          visual={ActionDocumentTextIcon}
        />
      );
    }

    if (toolName === FILESYSTEM_CAT_TOOL_NAME) {
      return <DataSourceNodeContentDetails {...props} />;
    }

    if (toolName === FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME) {
      return <FilesystemPathDetails {...props} />;
    }
  }

  if (internalMCPServerName === "include_data") {
    if (toolName === INCLUDE_TOOL_NAME) {
      return (
        <SearchResultDetails
          viewType={viewType}
          actionName={
            viewType === "conversation" ? "Including data" : "Include data"
          }
          actionOutput={output}
          visual={ClockIcon}
        />
      );
    }
  }

  if (internalMCPServerName === "web_search_&_browse") {
    if (toolName === WEBSEARCH_TOOL_NAME) {
      return (
        <SearchResultDetails
          viewType={viewType}
          defaultQuery={params.query as string}
          actionName={
            viewType === "conversation" ? "Searching the web" : "Web search"
          }
          actionOutput={output}
          visual={GlobeAltIcon}
        />
      );
    }
    if (toolName === WEBBROWSER_TOOL_NAME) {
      return <MCPBrowseActionDetails {...props} />;
    }
  }

  if (internalMCPServerName === "query_tables") {
    if (toolName === QUERY_TABLES_TOOL_NAME) {
      return <MCPTablesQueryActionDetails {...props} />;
    }
  }

  if (internalMCPServerName === "query_tables_v2") {
    if (toolName === GET_DATABASE_SCHEMA_TOOL_NAME) {
      return <MCPGetDatabaseSchemaActionDetails {...props} />;
    }
    if (toolName === EXECUTE_DATABASE_QUERY_TOOL_NAME) {
      return <MCPTablesQueryActionDetails {...props} />;
    }
  }

  if (internalMCPServerName === "reasoning") {
    return <MCPReasoningActionDetails {...props} />;
  }

  if (internalMCPServerName === "extract_data") {
    if (toolName === PROCESS_TOOL_NAME) {
      return <MCPExtractActionDetails {...props} />;
    }
  }

  if (internalMCPServerName === "run_agent") {
    return <MCPRunAgentActionDetails {...props} />;
  }

  if (internalMCPServerName === "agent_management") {
    return <MCPAgentManagementActionDetails {...props} />;
  }

  if (internalMCPServerName === "data_warehouses") {
    if (
      [DATA_WAREHOUSES_LIST_TOOL_NAME, DATA_WAREHOUSES_FIND_TOOL_NAME].includes(
        toolName
      )
    ) {
      return <MCPDataWarehousesBrowseDetails {...props} />;
    }
    if (toolName === DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME) {
      return <MCPGetDatabaseSchemaActionDetails {...props} />;
    }
    if (toolName === DATA_WAREHOUSES_QUERY_TOOL_NAME) {
      return <MCPTablesQueryActionDetails {...props} />;
    }
  }

  return <GenericActionDetails {...props} />;
}

export function GenericActionDetails({
  owner,
  action,
  viewType,
}: MCPActionDetailsProps) {
  const inputs =
    Object.keys(action.params).length > 0
      ? JSON.stringify(action.params, undefined, 2)
      : null;

  const actionName =
    (viewType === "conversation" ? "Running a tool" : "Run a tool") +
    (action.functionCallName
      ? `: ${asDisplayName(action.functionCallName)}`
      : "");

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={actionName}
      visual={MCP_SPECIFICATION.cardIcon}
    >
      {viewType !== "conversation" && (
        <div className="dd-privacy-mask flex flex-col gap-4 py-4 pl-6">
          <span className="heading-base">Inputs</span>
          <RenderToolItemMarkdown text={inputs} type="input" />

          {action.output && (
            <CollapsibleComponent
              rootProps={{ defaultOpen: !action.generatedFiles.length }}
              triggerChildren={
                <div
                  className={cn(
                    "text-foreground dark:text-foreground-night",
                    "flex flex-row items-center gap-x-2"
                  )}
                >
                  <span className="heading-base">Output</span>
                </div>
              }
              contentChildren={
                <div className="flex flex-col gap-2">
                  {action.output
                    .filter(
                      (o) => isTextContent(o) || isResourceContentWithText(o)
                    )
                    .map((o, index) => (
                      <RenderToolItemMarkdown
                        key={index}
                        text={getOutputText(o)}
                        type="output"
                      />
                    ))}
                </div>
              }
            />
          )}

          {action.generatedFiles.length > 0 && (
            <>
              <span className="heading-base">Generated Files</span>
              <div className="flex flex-col gap-1">
                {action.generatedFiles.map((file) => {
                  if (isSupportedImageContentType(file.contentType)) {
                    return (
                      <div key={file.fileId} className="mr-5">
                        <img
                          className="rounded-xl"
                          src={`/api/w/${owner.sId}/files/${file.fileId}`}
                          alt={`${file.title}`}
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={file.fileId}>
                      <a
                        href={`/api/w/${owner.sId}/files/${file.fileId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {file.title}
                      </a>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </ActionDetailsWrapper>
  );
}

const RenderToolItemMarkdown = ({
  text,
  type,
}: {
  text: string | null;
  type: "input" | "output";
}) => {
  if (!text) {
    text =
      type === "input"
        ? "*The tool was called with no specified inputs.*"
        : "*The tool completed with no output.*";
  }

  if (isValidJSON(text)) {
    return <Markdown content={`\`\`\`json\n${text}\n\`\`\``} />;
  }

  return (
    <ContentMessage variant="primary" size="lg">
      <Markdown content={text} />
    </ContentMessage>
  );
};
