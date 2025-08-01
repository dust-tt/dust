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
import { SEARCH_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getOutputText,
  isBrowseResultResourceType,
  isDataSourceNodeContentType,
  isDataSourceNodeListType,
  isExecuteTablesQueryMarkerResourceType,
  isExtractResultResourceType,
  isFilesystemPathType,
  isGetDatabaseSchemaMarkerResourceType,
  isIncludeResultResourceType,
  isReasoningSuccessOutput,
  isResourceContentWithText,
  isRunAgentProgressOutput,
  isRunAgentResultResourceType,
  isSearchResultResourceType,
  isSqlQueryOutput,
  isTextContent,
  isWebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { MCP_SPECIFICATION } from "@app/lib/actions/utils";
import { isValidJSON } from "@app/lib/utils/json";
import type { LightWorkspaceType } from "@app/types";
import { isSupportedImageContentType } from "@app/types";

export interface MCPActionDetailsProps {
  action: MCPActionType;
  owner: LightWorkspaceType;
  lastNotification: ProgressNotificationContentType | null;
  defaultOpen: boolean;
}

export function MCPActionDetails(props: MCPActionDetailsProps) {
  const isSearch = props.action.output?.some(isSearchResultResourceType);
  const isInclude = props.action.output?.some(isIncludeResultResourceType);
  const isWebsearch = props.action.output?.some(isWebsearchResultResourceType);
  const isBrowse = props.action.output?.some(isBrowseResultResourceType);
  const isTablesQuery =
    props.action.output?.some(isSqlQueryOutput) ||
    props.action.output?.some(isExecuteTablesQueryMarkerResourceType);
  const isGetDatabaseSchema = props.action.output?.some(
    isGetDatabaseSchemaMarkerResourceType
  );

  const isExtract = props.action.output?.some(isExtractResultResourceType);
  const isRunAgent =
    props.action.output?.some(isRunAgentResultResourceType) ||
    isRunAgentProgressOutput(props.lastNotification?.data.output);

  // TODO(mcp): rationalize the display of results for MCP to remove the need for specific checks.
  // Hack to find out whether the output comes from the reasoning tool, links back to the TODO above.
  const isReasoning = props.action.output?.some(isReasoningSuccessOutput);
  const isDataSourceFileSystem = props.action.output?.some(
    isDataSourceNodeListType
  );

  const isCat = props.action.output?.some(isDataSourceNodeContentType);
  const isFilesystemPath = props.action.output?.some(isFilesystemPathType);

  if (isSearch) {
    const fcName = props.action.functionCallName;
    const isSearchTool = fcName?.endsWith(SEARCH_TOOL_NAME);
    const actionName = fcName && !isSearchTool ? fcName : "Search data";
    const visual = isSearchTool
      ? MagnifyingGlassIcon
      : MCP_SPECIFICATION.cardIcon;
    return (
      <SearchResultDetails
        actionName={actionName}
        actionOutput={props.action.output}
        defaultOpen={props.defaultOpen}
        visual={visual}
      />
    );
  } else if (isInclude) {
    return (
      <SearchResultDetails
        actionName="Include data"
        actionOutput={props.action.output}
        defaultOpen={props.defaultOpen}
        visual={ClockIcon}
      />
    );
  } else if (isWebsearch) {
    return (
      <SearchResultDetails
        actionName="Web search"
        actionOutput={props.action.output}
        defaultOpen={props.defaultOpen}
        visual={GlobeAltIcon}
      />
    );
  } else if (isBrowse) {
    return <MCPBrowseActionDetails {...props} />;
  } else if (isGetDatabaseSchema) {
    return <MCPGetDatabaseSchemaActionDetails {...props} />;
  } else if (isTablesQuery) {
    return <MCPTablesQueryActionDetails {...props} />;
  } else if (isReasoning) {
    return <MCPReasoningActionDetails {...props} />;
  } else if (isDataSourceFileSystem) {
    return (
      <SearchResultDetails
        actionName="Browse data sources"
        actionOutput={props.action.output}
        defaultOpen={props.defaultOpen}
        visual={ActionDocumentTextIcon}
      />
    );
  } else if (isCat) {
    return <DataSourceNodeContentDetails {...props} />;
  } else if (isFilesystemPath) {
    return <FilesystemPathDetails {...props} />;
  } else if (isExtract) {
    return <MCPExtractActionDetails {...props} />;
  } else if (isRunAgent) {
    return <MCPRunAgentActionDetails {...props} />;
  } else {
    return <GenericActionDetails {...props} />;
  }
}

export function GenericActionDetails({
  owner,
  action,
  defaultOpen,
}: MCPActionDetailsProps) {
  const inputs =
    Object.keys(action.params).length > 0
      ? JSON.stringify(action.params, undefined, 2)
      : null;

  return (
    <ActionDetailsWrapper
      actionName={action.functionCallName ?? "Calling MCP Server"}
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
