import {
  ActionDocumentTextIcon,
  ClockIcon,
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  Markdown,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import {
  makeQueryTextForDataSourceSearch,
  makeQueryTextForFind,
  makeQueryTextForInclude,
  makeQueryTextForList,
} from "@app/components/actions/mcp/details/input_rendering";
import { MCPAgentManagementActionDetails } from "@app/components/actions/mcp/details/MCPAgentManagementActionDetails";
import {
  MCPAgentMemoryEditActionDetails,
  MCPAgentMemoryEraseActionDetails,
  MCPAgentMemoryRecordActionDetails,
  MCPAgentMemoryRetrieveActionDetails,
} from "@app/components/actions/mcp/details/MCPAgentMemoryActionDetails";
import { MCPBrowseActionDetails } from "@app/components/actions/mcp/details/MCPBrowseActionDetails";
import { MCPConversationCatFileDetails } from "@app/components/actions/mcp/details/MCPConversationFilesActionDetails";
import {
  DataSourceNodeContentDetails,
  FilesystemPathDetails,
} from "@app/components/actions/mcp/details/MCPDataSourcesFileSystemActionDetails";
import { MCPDataWarehousesBrowseDetails } from "@app/components/actions/mcp/details/MCPDataWarehousesBrowseDetails";
import { MCPDeepDiveActionDetails } from "@app/components/actions/mcp/details/MCPDeepDiveActionDetails";
import { MCPExtractActionDetails } from "@app/components/actions/mcp/details/MCPExtractActionDetails";
import { MCPGetDatabaseSchemaActionDetails } from "@app/components/actions/mcp/details/MCPGetDatabaseSchemaActionDetails";
import {
  MCPImageEditingActionDetails,
  MCPImageGenerationActionDetails,
} from "@app/components/actions/mcp/details/MCPImageGenerationActionDetails";
import { MCPListToolsActionDetails } from "@app/components/actions/mcp/details/MCPListToolsActionDetails";
import { MCPRunAgentActionDetails } from "@app/components/actions/mcp/details/MCPRunAgentActionDetails";
import { MCPSkillEnableActionDetails } from "@app/components/actions/mcp/details/MCPSkillEnableActionDetails";
import { MCPTablesQueryActionDetails } from "@app/components/actions/mcp/details/MCPTablesQueryActionDetails";
import { SearchResultDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import { MCPToolsetsEnableActionDetails } from "@app/components/actions/mcp/details/MCPToolsetsEnableActionDetails";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { InternalActionIcons } from "@app/components/resources/resources_icons";
import {
  DEFAULT_CONVERSATION_CAT_FILE_ACTION_NAME,
  ENABLE_SKILL_TOOL_NAME,
} from "@app/lib/actions/constants";
import {
  AGENT_MEMORY_COMPACT_TOOL_NAME,
  AGENT_MEMORY_EDIT_TOOL_NAME,
  AGENT_MEMORY_ERASE_TOOL_NAME,
  AGENT_MEMORY_RECORD_TOOL_NAME,
  AGENT_MEMORY_RETRIEVE_TOOL_NAME,
  DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME,
  DATA_WAREHOUSES_FIND_TOOL_NAME,
  DATA_WAREHOUSES_LIST_TOOL_NAME,
  DATA_WAREHOUSES_QUERY_TOOL_NAME,
  EDIT_IMAGE_TOOL_NAME,
  EXECUTE_DATABASE_QUERY_TOOL_NAME,
  FILESYSTEM_CAT_TOOL_NAME,
  FILESYSTEM_FIND_TOOL_NAME,
  FILESYSTEM_LIST_TOOL_NAME,
  FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
  GENERATE_IMAGE_TOOL_NAME,
  GET_DATABASE_SCHEMA_TOOL_NAME,
  getInternalMCPServerIconByName,
  INCLUDE_TOOL_NAME,
  INTERNAL_SERVERS_WITH_WEBSEARCH,
  PROCESS_TOOL_NAME,
  SEARCH_TOOL_NAME,
  SKILL_MANAGEMENT_SERVER_NAME,
  TABLE_QUERY_V2_SERVER_NAME,
  TOOLSETS_ENABLE_TOOL_NAME,
  TOOLSETS_LIST_TOOL_NAME,
  WEBBROWSER_TOOL_NAME,
  WEBSEARCH_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getOutputText,
  isResourceContentWithText,
  isTextContent,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isDataSourceFilesystemFindInputType,
  isDataSourceFilesystemListInputType,
  isIncludeInputType,
  isSearchInputType,
  isWebsearchInputType,
} from "@app/lib/actions/mcp_internal_actions/types";
import { MCP_SPECIFICATION } from "@app/lib/actions/utils";
import { isValidJSON } from "@app/lib/utils/json";
import type { LightWorkspaceType } from "@app/types";
import { asDisplayName, isSupportedImageContentType } from "@app/types";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";

export interface MCPActionDetailsProps {
  action: AgentMCPActionWithOutputType;
  owner: LightWorkspaceType;
  lastNotification: ProgressNotificationContentType | null;
  messageStatus?: "created" | "succeeded" | "failed" | "cancelled";
  viewType: "conversation" | "sidebar";
}

export function MCPActionDetails({
  action,
  viewType,
  owner,
  lastNotification,
  messageStatus,
}: MCPActionDetailsProps) {
  const {
    params,
    status,
    output: baseOutput,
    internalMCPServerName,
    toolName,
  } = action;

  const [output, setOutput] = useState(baseOutput);

  useEffect(() => {
    if (status === "denied") {
      const deniedMessage = {
        type: "text" as const,
        text: "Tool execution rejected by the user.",
      };

      if (baseOutput === null) {
        setOutput([deniedMessage]);
      } else {
        setOutput([...baseOutput, deniedMessage]);
      }
    } else {
      setOutput(baseOutput);
    }
  }, [status, baseOutput]);

  const toolOutputDetailsProps: ToolExecutionDetailsProps = {
    lastNotification,
    messageStatus,
    owner,
    toolOutput: output,
    toolParams: params,
    viewType,
  };

  if (
    internalMCPServerName === "search" ||
    internalMCPServerName === "data_sources_file_system"
  ) {
    switch (toolName) {
      case SEARCH_TOOL_NAME:
        return (
          <SearchResultDetails
            viewType={viewType}
            actionName={
              viewType === "conversation" ? "Searching data" : "Search data"
            }
            actionOutput={output}
            visual={MagnifyingGlassIcon}
            query={
              isSearchInputType(params)
                ? makeQueryTextForDataSourceSearch(params)
                : null
            }
          />
        );
      case FILESYSTEM_LIST_TOOL_NAME:
      case FILESYSTEM_FIND_TOOL_NAME:
        return (
          <SearchResultDetails
            viewType={viewType}
            actionName={
              viewType === "conversation"
                ? "Browsing data sources"
                : "Browse data sources"
            }
            actionOutput={output}
            query={
              isDataSourceFilesystemFindInputType(params)
                ? makeQueryTextForFind(params)
                : isDataSourceFilesystemListInputType(params)
                  ? makeQueryTextForList(params)
                  : null
            }
            visual={ActionDocumentTextIcon}
          />
        );
      case FILESYSTEM_CAT_TOOL_NAME:
        return <DataSourceNodeContentDetails {...toolOutputDetailsProps} />;
      case FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME:
        return <FilesystemPathDetails {...toolOutputDetailsProps} />;
    }
  }

  if (
    internalMCPServerName === "include_data" &&
    toolName === INCLUDE_TOOL_NAME
  ) {
    return (
      <SearchResultDetails
        viewType={viewType}
        actionName={
          viewType === "conversation" ? "Including data" : "Include data"
        }
        actionOutput={output}
        visual={ClockIcon}
        query={
          isIncludeInputType(params) ? makeQueryTextForInclude(params) : null
        }
      />
    );
  }

  if (
    INTERNAL_SERVERS_WITH_WEBSEARCH.some(
      (name) => internalMCPServerName === name
    )
  ) {
    switch (toolName) {
      case WEBSEARCH_TOOL_NAME:
        return (
          <SearchResultDetails
            viewType={viewType}
            query={isWebsearchInputType(params) ? params.query : null}
            actionName={
              viewType === "conversation" ? "Searching the web" : "Web search"
            }
            actionOutput={output}
            visual={GlobeAltIcon}
          />
        );
      case WEBBROWSER_TOOL_NAME:
        return <MCPBrowseActionDetails {...toolOutputDetailsProps} />;
    }
  }

  if (internalMCPServerName === TABLE_QUERY_V2_SERVER_NAME) {
    switch (toolName) {
      case GET_DATABASE_SCHEMA_TOOL_NAME:
        return (
          <MCPGetDatabaseSchemaActionDetails {...toolOutputDetailsProps} />
        );
      case EXECUTE_DATABASE_QUERY_TOOL_NAME:
        return <MCPTablesQueryActionDetails {...toolOutputDetailsProps} />;
    }
  }

  if (
    internalMCPServerName === "extract_data" &&
    toolName === PROCESS_TOOL_NAME
  ) {
    return <MCPExtractActionDetails {...toolOutputDetailsProps} />;
  }

  if (internalMCPServerName === "image_generation") {
    switch (toolName) {
      case GENERATE_IMAGE_TOOL_NAME:
        return <MCPImageGenerationActionDetails {...toolOutputDetailsProps} />;
      case EDIT_IMAGE_TOOL_NAME:
        return <MCPImageEditingActionDetails {...toolOutputDetailsProps} />;
    }
  }

  if (internalMCPServerName === "run_agent") {
    return <MCPRunAgentActionDetails {...toolOutputDetailsProps} />;
  }

  if (internalMCPServerName === "deep_dive") {
    return <MCPDeepDiveActionDetails {...toolOutputDetailsProps} />;
  }

  if (internalMCPServerName === "agent_memory") {
    switch (toolName) {
      case AGENT_MEMORY_RETRIEVE_TOOL_NAME:
        return (
          <MCPAgentMemoryRetrieveActionDetails {...toolOutputDetailsProps} />
        );
      case AGENT_MEMORY_RECORD_TOOL_NAME:
        return (
          <MCPAgentMemoryRecordActionDetails {...toolOutputDetailsProps} />
        );
      case AGENT_MEMORY_ERASE_TOOL_NAME:
        return <MCPAgentMemoryEraseActionDetails {...toolOutputDetailsProps} />;
      case AGENT_MEMORY_EDIT_TOOL_NAME:
      case AGENT_MEMORY_COMPACT_TOOL_NAME:
        return (
          <MCPAgentMemoryEditActionDetails
            {...toolOutputDetailsProps}
            toolName={toolName}
          />
        );
    }
  }

  if (internalMCPServerName === "toolsets") {
    switch (toolName) {
      case TOOLSETS_ENABLE_TOOL_NAME:
        return <MCPToolsetsEnableActionDetails {...toolOutputDetailsProps} />;
      case TOOLSETS_LIST_TOOL_NAME:
        return <MCPListToolsActionDetails {...toolOutputDetailsProps} />;
    }
  }

  if (
    internalMCPServerName === SKILL_MANAGEMENT_SERVER_NAME &&
    toolName === ENABLE_SKILL_TOOL_NAME
  ) {
    return <MCPSkillEnableActionDetails {...toolOutputDetailsProps} />;
  }

  if (internalMCPServerName === "agent_management") {
    return <MCPAgentManagementActionDetails {...toolOutputDetailsProps} />;
  }

  if (internalMCPServerName === "data_warehouses") {
    switch (toolName) {
      case DATA_WAREHOUSES_LIST_TOOL_NAME:
      case DATA_WAREHOUSES_FIND_TOOL_NAME:
        return <MCPDataWarehousesBrowseDetails {...toolOutputDetailsProps} />;
      case DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME:
        return (
          <MCPGetDatabaseSchemaActionDetails {...toolOutputDetailsProps} />
        );
      case DATA_WAREHOUSES_QUERY_TOOL_NAME:
        return <MCPTablesQueryActionDetails {...toolOutputDetailsProps} />;
    }
  }

  if (
    internalMCPServerName === "conversation_files" &&
    toolName === DEFAULT_CONVERSATION_CAT_FILE_ACTION_NAME
  ) {
    return <MCPConversationCatFileDetails {...toolOutputDetailsProps} />;
  }

  return (
    <GenericActionDetails
      owner={owner}
      lastNotification={lastNotification}
      messageStatus={messageStatus}
      viewType={viewType}
      action={{ ...action, output }}
    />
  );
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

  const actionIcon =
    action.internalMCPServerName &&
    InternalActionIcons[
      getInternalMCPServerIconByName(action.internalMCPServerName)
    ];

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={actionName}
      visual={actionIcon ?? MCP_SPECIFICATION.cardIcon}
    >
      {viewType !== "conversation" && (
        <div className="dd-privacy-mask flex flex-col gap-4 py-4 pl-6">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger>
              <div
                className={cn(
                  "text-foreground dark:text-foreground-night",
                  "flex flex-row items-center gap-x-2"
                )}
              >
                <span className="heading-base">Inputs</span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <RenderToolItemMarkdown text={inputs} type="input" />
            </CollapsibleContent>
          </Collapsible>

          {action.output && (
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger>
                <div
                  className={cn(
                    "text-foreground dark:text-foreground-night",
                    "flex flex-row items-center gap-x-2"
                  )}
                >
                  <span className="heading-base">Output</span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
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
              </CollapsibleContent>
            </Collapsible>
          )}

          {action.generatedFiles.filter((f) => !f.hidden).length > 0 && (
            <>
              <span className="heading-base">Generated Files</span>
              <div className="flex flex-col gap-1">
                {action.generatedFiles
                  .filter((file) => !file.hidden)
                  .map((file) => {
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
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
