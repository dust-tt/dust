import { Markdown } from "@dust-tt/sparkle";
import React, { useContext } from "react";
import type { Components } from "react-markdown";

import { CopilotSuggestionsContext } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
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
import {
  copilotSuggestionDirective,
  getCopilotSuggestionPlugin,
} from "@app/components/markdown/suggestion/CopilotSuggestionDirective";
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
  isInstructions = false,
  textColor,
  compactSpacing,
  forcedTextSize,
  canCopyQuotes,
}: {
  owner: WorkspaceType;
  content: string;
  isLastMessage?: boolean;
  isStreaming?: boolean;
  isInstructions?: boolean;
  additionalMarkdownComponents?: Components;
  textColor?: string;
  compactSpacing?: boolean;
  forcedTextSize?: string;
  canCopyQuotes?: boolean;
}) => {
  // Check if we're inside the copilot context to enable copilot-specific directives
  const copilotContext = useContext(CopilotSuggestionsContext);
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
      // Add copilot-specific components when inside copilot context
      ...(copilotContext
        ? { agentSuggestion: getCopilotSuggestionPlugin() }
        : {}),
      ...additionalMarkdownComponents,
    }),
    [owner, additionalMarkdownComponents, copilotContext]
  );

  const additionalMarkdownPlugins = React.useMemo(() => {
    const baseDirectives = [
      agentMentionDirective,
      userMentionDirective,
      getCiteDirective(),
      visualizationDirective,
      imgDirective,
      toolDirective,
      quickReplyDirective,
    ];

    // Add copilot-specific directives when inside copilot context
    if (copilotContext) {
      baseDirectives.push(copilotSuggestionDirective);
    }

    return isInstructions
      ? [...baseDirectives, instructionBlockDirective]
      : baseDirectives;
  }, [isInstructions, copilotContext]);

  return (
    <Markdown
      content={processedContentIfIsInstructions}
      additionalMarkdownComponents={markdownComponents}
      additionalMarkdownPlugins={additionalMarkdownPlugins}
      isLastMessage={isLastMessage}
      isStreaming={isStreaming}
      textColor={textColor}
      compactSpacing={compactSpacing}
      forcedTextSize={forcedTextSize}
      canCopyQuotes={canCopyQuotes}
    />
  );
};
