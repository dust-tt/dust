import { Markdown } from "@dust-tt/sparkle";
import React from "react";
import type { Components } from "react-markdown";

import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import { getImgPlugin, imgDirective } from "@app/components/markdown/Image";
import { quickReplyDirective } from "@app/components/markdown/QuickReplyBlock";
import { toolDirective } from "@app/components/markdown/tool/tool";
import { visualizationDirective } from "@app/components/markdown/VisualizationBlock";
import {
  agentMentionDirective,
  getAgentMentionPlugin,
  getUserMentionPlugin,
  userMentionDirective,
} from "@app/lib/mentions/markdown/plugin";
import type { WorkspaceType } from "@app/types";

export const AgentMessageMarkdown = ({
  owner,
  content,
  additionalMarkdownComponents = {} as Components,
  isLastMessage = false,
  isStreaming = false,
}: {
  owner: WorkspaceType;
  content: string;
  isLastMessage?: boolean;
  isStreaming?: boolean;
  additionalMarkdownComponents?: Components;
}) => {
  const markdownComponents: Components = React.useMemo(
    () => ({
      sup: CiteBlock,
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
      mention: getAgentMentionPlugin(owner),
      mention_user: getUserMentionPlugin(owner),
      dustimg: getImgPlugin(owner),
      ...additionalMarkdownComponents,
    }),
    [owner, additionalMarkdownComponents]
  );

  const additionalMarkdownPlugins = React.useMemo(
    () => [
      agentMentionDirective,
      userMentionDirective,
      getCiteDirective(),
      visualizationDirective,
      imgDirective,
      toolDirective,
      quickReplyDirective,
    ],
    []
  );

  return (
    <Markdown
      content={content}
      additionalMarkdownComponents={markdownComponents}
      additionalMarkdownPlugins={additionalMarkdownPlugins}
      isLastMessage={isLastMessage}
      isStreaming={isStreaming}
    />
  );
};
