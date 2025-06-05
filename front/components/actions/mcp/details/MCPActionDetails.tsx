import { cn, CodeBlock, CollapsibleComponent } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { MCPBrowseActionDetails } from "@app/components/actions/mcp/details/MCPBrowseActionDetails";
import { MCPExtractActionDetails } from "@app/components/actions/mcp/details/MCPExtractActionDetails";
import { MCPIncludeActionDetails } from "@app/components/actions/mcp/details/MCPIncludeActionDetails";
import { MCPReasoningActionDetails } from "@app/components/actions/mcp/details/MCPReasoningActionDetails";
import { MCPSearchActionDetails } from "@app/components/actions/mcp/details/MCPSearchActionDetails";
import { MCPTablesQueryActionDetails } from "@app/components/actions/mcp/details/MCPTablesQueryActionDetails";
import { MCPWebsearchActionDetails } from "@app/components/actions/mcp/details/MCPWebsearchActionDetails";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import {
  isBrowseResultResourceType,
  isExtractResultResourceType,
  isIncludeResultResourceType,
  isReasoningSuccessOutput,
  isRunAgentProgressOutput,
  isRunAgentResultResourceType,
  isSearchResultResourceType,
  isSqlQueryOutput,
  isWebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { ACTION_SPECIFICATIONS } from "@app/lib/actions/utils";
import { isSupportedImageContentType } from "@app/types";

import { MCPRunAgentActionDetails } from "./MCPRunAgentActionDetails";

export function MCPActionDetails(
  props: ActionDetailsComponentBaseProps<MCPActionType>
) {
  const isSearch = props.action.output?.some(isSearchResultResourceType);
  const isInclude = props.action.output?.some(isIncludeResultResourceType);
  const isWebsearch = props.action.output?.some(isWebsearchResultResourceType);
  const isBrowse = props.action.output?.some(isBrowseResultResourceType);
  const isTablesQuery = props.action.output?.some(isSqlQueryOutput);
  const isExtract = props.action.output?.some(isExtractResultResourceType);
  const isRunAgent =
    props.action.output?.some(isRunAgentResultResourceType) ||
    isRunAgentProgressOutput(props.lastNotification?.data.output);

  // TODO(mcp): rationalize the display of results for MCP to remove the need for specific checks.
  // Hack to find out whether the output comes from the reasoning tool, links back to the TODO above.
  const isReasoning = props.action.output?.some(isReasoningSuccessOutput);

  if (isSearch) {
    return <MCPSearchActionDetails {...props} />;
  } else if (isInclude) {
    return <MCPIncludeActionDetails {...props} />;
  } else if (isWebsearch) {
    return <MCPWebsearchActionDetails {...props} />;
  } else if (isBrowse) {
    return <MCPBrowseActionDetails {...props} />;
  } else if (isTablesQuery) {
    return <MCPTablesQueryActionDetails {...props} />;
  } else if (isReasoning) {
    return <MCPReasoningActionDetails {...props} />;
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
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  return (
    <ActionDetailsWrapper
      actionName={action.functionCallName ?? "Calling MCP Server"}
      defaultOpen={defaultOpen}
      visual={ACTION_SPECIFICATIONS["MCP"].cardIcon}
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
            <CodeBlock wrapLongLines className="language-json">
              {JSON.stringify(action.params, undefined, 2) ?? ""}
            </CodeBlock>
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
              <CodeBlock wrapLongLines>
                {action.output
                  // @ts-expect-error TODO(mcp): fixing typing resulting to unknown type
                  .filter((o) => o.text || o.resource.text)
                  // @ts-expect-error TODO(mcp): fixing typing resulting to unknown type
                  .map((o) => o.text || o.resource.text)
                  .join("\n")}
              </CodeBlock>
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
