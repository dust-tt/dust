import { actionCardDirective } from "@app/components/markdown/ActionCardDirective";
import {
  BuildSkillDirectiveBlock,
  buildAgentDirective,
  buildSkillDirective,
  getBuildAgentDirectivePlugin,
} from "@app/components/markdown/BuildEntityDirectives";
import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import {
  filePreviewDirective,
  getFilePreviewPlugin,
} from "@app/components/markdown/FilePreviewBlock";
import { getImgPlugin, imgDirective } from "@app/components/markdown/Image";
import {
  InstructionBlock,
  instructionBlockDirective,
  preprocessInstructionBlocks,
} from "@app/components/markdown/InstructionBlock";
import { quickReplyDirective } from "@app/components/markdown/QuickReplyBlock";
import {
  getConversationAgentSuggestionPlugin,
  sidekickSuggestionDirective,
} from "@app/components/markdown/suggestion/SidekickSuggestionDirective";
import {
  getSkillSuggestionPlugin,
  skillSuggestionDirective,
} from "@app/components/markdown/suggestion/SkillSuggestionDirective";
import {
  getTaskDirectiveBlock,
  taskDirective,
} from "@app/components/markdown/TaskDirectiveBlock";
import { toolDirective } from "@app/components/markdown/tool/tool";
import { visualizationDirective } from "@app/components/markdown/VisualizationBlock";
import {
  agentMentionDirective,
  getAgentMentionPlugin,
  getUserMentionPlugin,
  userMentionDirective,
} from "@app/lib/mentions/markdown/plugin";
import type { WorkspaceType } from "@app/types/user";
import type { StreamingState } from "@dust-tt/sparkle";
import { Markdown } from "@dust-tt/sparkle";
import React from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

export const AgentMessageMarkdown = ({
  owner,
  conversationId,
  content,
  additionalMarkdownComponents = {} as Components,
  additionalMarkdownPlugins = [] as PluggableList,
  isLastMessage = false,
  streamingState,
  isInstructions = false,
  textColor,
  compactSpacing,
  forcedTextSize,
  canCopyQuotes,
}: {
  owner: WorkspaceType;
  conversationId?: string;
  content: string;
  isLastMessage?: boolean;
  streamingState?: StreamingState;
  isInstructions?: boolean;
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
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
      project_task: getTaskDirectiveBlock(owner),
      dustimg: getImgPlugin(owner),
      file_preview: getFilePreviewPlugin(),
      instruction_block: InstructionBlock,
      build_skill: BuildSkillDirectiveBlock,
      build_agent: getBuildAgentDirectivePlugin(owner),
      skill_suggestion: getSkillSuggestionPlugin(owner, conversationId),
      agent_suggestion: getConversationAgentSuggestionPlugin(
        owner,
        conversationId
      ),
      ...additionalMarkdownComponents,
    }),
    [owner, conversationId, additionalMarkdownComponents]
  );

  const markdownPlugins = React.useMemo(() => {
    const baseDirectives = [
      agentMentionDirective,
      userMentionDirective,
      taskDirective,
      getCiteDirective(),
      visualizationDirective,
      imgDirective,
      filePreviewDirective,
      toolDirective,
      quickReplyDirective,
      actionCardDirective,
      buildSkillDirective,
      buildAgentDirective,
      skillSuggestionDirective,
      sidekickSuggestionDirective,
      ...additionalMarkdownPlugins,
    ];

    return isInstructions
      ? [...baseDirectives, instructionBlockDirective]
      : baseDirectives;
  }, [isInstructions, additionalMarkdownPlugins]);

  return (
    <Markdown
      content={processedContentIfIsInstructions}
      additionalMarkdownComponents={markdownComponents}
      additionalMarkdownPlugins={markdownPlugins}
      isLastMessage={isLastMessage}
      streamingState={streamingState}
      enableAnimation
      textColor={textColor}
      compactSpacing={compactSpacing}
      forcedTextSize={forcedTextSize}
      canCopyQuotes={canCopyQuotes}
      // Agent output is read-only, so task lists render as step badges rather than checkboxes.
      taskListVariant="step"
    />
  );
};
