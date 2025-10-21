import { Avatar, ContentMessage, Markdown } from "@dust-tt/sparkle";
import { useMemo } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import {
  getMentionPlugin,
  mentionDirective,
} from "@app/components/markdown/MentionBlock";
import { isAgentPauseOutputResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { DEEP_DIVE_AVATAR_URL } from "@app/lib/api/assistant/global_agents/configurations/dust/consts";
export function MCPDeepDiveActionDetails({
  owner,
  toolOutput,
  viewType,
}: ToolExecutionDetailsProps) {
  const handoffResource =
    toolOutput?.find(isAgentPauseOutputResourceType) ?? null;

  const isBusy = useMemo(() => {
    return !handoffResource;
  }, [handoffResource]);

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [getCiteDirective(), mentionDirective],
    []
  );

  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      mention: getMentionPlugin(owner),
    }),
    [owner]
  );

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName="Hand off to Deep dive"
      visual={() => (
        <Avatar visual={DEEP_DIVE_AVATAR_URL} size="xs" busy={isBusy} />
      )}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-4">
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            <ContentMessage variant="primary" size="lg">
              <Markdown
                content={
                  handoffResource
                    ? handoffResource.resource.text
                    : "Launching the deep dive..."
                }
                additionalMarkdownPlugins={additionalMarkdownPlugins}
                additionalMarkdownComponents={additionalMarkdownComponents}
                isStreaming={!handoffResource}
              />
            </ContentMessage>
          </div>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
