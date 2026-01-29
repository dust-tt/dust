import type { StreamingState } from "@dust-tt/sparkle";
import {
  StreamingAnimationMarkdown
} from "@dust-tt/sparkle";
import React from "react";
import type { Components } from "react-markdown";

import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import { getImgPlugin, imgDirective } from "@app/components/markdown/Image";
import {
  InstructionBlock,
  instructionBlockDirective,
  preprocessInstructionBlocks,
} from "@app/components/markdown/InstructionBlock";
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
  streamingState = "ended",
  isInstructions = false,
  textColor,
  compactSpacing,
  forcedTextSize,
  canCopyQuotes,
}: {
  owner: WorkspaceType;
  content: string;
  isLastMessage?: boolean;
  streamingState?: StreamingState;
  isInstructions?: boolean;
  additionalMarkdownComponents?: Components;
  textColor?: string;
  compactSpacing?: boolean;
  forcedTextSize?: string;
  canCopyQuotes?: boolean;
}) => {
  // Preprocess content to handle instruction blocks
  const processedContentIfIsInstructions = React.useMemo(() => {
    return isInstructions ? preprocessInstructionBlocks(content) : content;
  }, [content, isInstructions]);

  const markdownComponents: Components = React.useMemo(
    () => ({
      sup: CiteBlock,
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
      mention: getAgentMentionPlugin(owner),
      mention_user: getUserMentionPlugin(owner),
      dustimg: getImgPlugin(owner),
      instruction_block: InstructionBlock,
      ...additionalMarkdownComponents,
    }),
    [owner, additionalMarkdownComponents]
  );

  const additionalMarkdownPlugins = React.useMemo(() => {
    const directives = [
      agentMentionDirective,
      userMentionDirective,
      getCiteDirective(),
      visualizationDirective,
      imgDirective,
      toolDirective,
      quickReplyDirective,
    ];

    return isInstructions
      ? [...directives, instructionBlockDirective]
      : directives;
  }, [isInstructions]);

  return (
    <StreamingAnimationMarkdown
      content={processedContentIfIsInstructions}
      additionalMarkdownComponents={markdownComponents}
      additionalMarkdownPlugins={additionalMarkdownPlugins}
      isLastMessage={isLastMessage}
      streamingState={streamingState}
      textColor={textColor}
      compactSpacing={compactSpacing}
      forcedTextSize={forcedTextSize}
      canCopyQuotes={canCopyQuotes}
    />
  );
};
