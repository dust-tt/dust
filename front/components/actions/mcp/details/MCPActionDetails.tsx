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
import { MCPExtractActionDetails } from "@app/components/actions/mcp/details/MCPExtractActionDetails";
import { MCPGetDatabaseSchemaActionDetails } from "@app/components/actions/mcp/details/MCPGetDatabaseSchemaActionDetails";
import { MCPReasoningActionDetails } from "@app/components/actions/mcp/details/MCPReasoningActionDetails";
import { MCPRunAgentActionDetails } from "@app/components/actions/mcp/details/MCPRunAgentActionDetails";
import { MCPTablesQueryActionDetails } from "@app/components/actions/mcp/details/MCPTablesQueryActionDetails";
import { SearchResultDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { MCPActionType } from "@app/lib/actions/mcp";
import {
  EXECUTE_DATABASE_QUERY_TOOL_NAME,
  FILESYSTEM_CAT_TOOL_NAME,
  FILESYSTEM_FIND_TOOL_NAME,
  FILESYSTEM_LIST_TOOL_NAME,
  FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
  GET_DATABASE_SCHEMA_TOOL_NAME,
  INCLUDE_TOOL_NAME,
  isInternalMCPServerOfName,
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
import { MCP_SPECIFICATION } from "@app/lib/actions/utils";
import { isValidJSON } from "@app/lib/utils/json";
import type { LightWorkspaceType } from "@app/types";
import { asDisplayName, isSupportedImageContentType } from "@app/types";

export interface MCPActionDetailsProps {
  action: MCPActionType;
  owner: LightWorkspaceType;
  lastNotification: ProgressNotificationContentType | null;
  defaultOpen: boolean;
  messageStatus?: "created" | "succeeded" | "failed" | "cancelled";
  hideOutput?: boolean;
}

export function MCPActionDetails(props: MCPActionDetailsProps) {
  const {
    action: { output, functionCallName, mcpServerId },
    defaultOpen,
    hideOutput,
  } = props;

  const parts = functionCallName ? functionCallName.split("__") : [];
  const toolName = parts[parts.length - 1];

  if (isInternalMCPServerOfName(mcpServerId, "search")) {
    if (toolName === SEARCH_TOOL_NAME) {
      return (
        <SearchResultDetails
          actionName="Search data"
          actionOutput={output}
          defaultOpen={defaultOpen}
          visual={MagnifyingGlassIcon}
          hideOutput={hideOutput}
        />
      );
    }

    if (
      toolName === FILESYSTEM_LIST_TOOL_NAME ||
      toolName === FILESYSTEM_FIND_TOOL_NAME
    ) {
      return (
        <SearchResultDetails
          actionName="Browse data sources"
          actionOutput={output}
          defaultOpen={defaultOpen}
          visual={ActionDocumentTextIcon}
          hideOutput={hideOutput}
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

  if (isInternalMCPServerOfName(mcpServerId, "include_data")) {
    if (toolName === INCLUDE_TOOL_NAME) {
      return (
        <SearchResultDetails
          actionName="Include data"
          actionOutput={output}
          defaultOpen={defaultOpen}
          visual={ClockIcon}
        />
      );
    }
  }

  if (isInternalMCPServerOfName(mcpServerId, "web_search_&_browse")) {
    if (toolName === WEBSEARCH_TOOL_NAME) {
      return (
        <SearchResultDetails
          actionName="Web search"
          actionOutput={output}
          defaultOpen={defaultOpen}
          visual={GlobeAltIcon}
        />
      );
    }
    if (toolName === WEBBROWSER_TOOL_NAME) {
      return <MCPBrowseActionDetails {...props} />;
    }
  }

  if (isInternalMCPServerOfName(mcpServerId, "query_tables")) {
    if (toolName === QUERY_TABLES_TOOL_NAME) {
      return <MCPTablesQueryActionDetails {...props} />;
    }
  }

  if (isInternalMCPServerOfName(mcpServerId, "query_tables_v2")) {
    if (toolName === GET_DATABASE_SCHEMA_TOOL_NAME) {
      return <MCPGetDatabaseSchemaActionDetails {...props} />;
    }
    if (toolName === EXECUTE_DATABASE_QUERY_TOOL_NAME) {
      return <MCPTablesQueryActionDetails {...props} />;
    }
  }

  if (isInternalMCPServerOfName(mcpServerId, "reasoning")) {
    return <MCPReasoningActionDetails {...props} />;
  }

  if (isInternalMCPServerOfName(mcpServerId, "extract_data")) {
    if (toolName === PROCESS_TOOL_NAME) {
      return <MCPExtractActionDetails {...props} />;
    }
  }

  if (isInternalMCPServerOfName(mcpServerId, "run_agent")) {
    return <MCPRunAgentActionDetails {...props} />;
  }

  if (isInternalMCPServerOfName(mcpServerId, "agent_management")) {
    return <MCPAgentManagementActionDetails {...props} />;
  }

  return <GenericActionDetails {...props} />;
}

export function GenericActionDetails({
  owner,
  action,
  defaultOpen,
  hideOutput,
}: MCPActionDetailsProps) {
  const inputs =
    Object.keys(action.params).length > 0
      ? JSON.stringify(action.params, undefined, 2)
      : null;

  return (
    <ActionDetailsWrapper
      actionName={
        asDisplayName(action.functionCallName) ?? "Calling MCP Server"
      }
      defaultOpen={defaultOpen}
      visual={MCP_SPECIFICATION.cardIcon}
    >
      <div className="flex flex-col gap-4 py-4 pl-6">
        <CollapsibleComponent
          rootProps={{ defaultOpen: !action.generatedFiles.length }}
          triggerChildren={
            <div
              className={cn(
                "text-foreground dark:text-foreground-night",
                "flex flex-row items-center gap-x-2"
              )}
            >
              <span className="heading-base">Inputs</span>
            </div>
          }
          contentChildren={
            <RenderToolItemMarkdown text={inputs} type="input" />
          }
        />

        {!hideOutput && action.output && (
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
