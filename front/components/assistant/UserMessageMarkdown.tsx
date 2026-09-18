import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { getToolIcon } from "@app/components/editor/extensions/skill_builder/ToolChip";
import type {
  AttachmentChipDirectiveProps,
  KnowledgeChipDirectiveProps,
} from "@app/components/markdown/AttachmentChipDirective";
import {
  AttachmentChipDirectiveBlock,
  createAttachmentChipDirective,
  getKnowledgeIcon,
} from "@app/components/markdown/AttachmentChipDirective";
import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import type { ContentNodeMentionBlockProps } from "@app/components/markdown/ContentNodeMentionBlock";
import {
  ContentNodeMentionBlock,
  contentNodeMentionDirective,
} from "@app/components/markdown/ContentNodeMentionBlock";
import { createTextDirective } from "@app/components/markdown/directives";
import {
  filePreviewDirective,
  getFilePreviewPlugin,
} from "@app/components/markdown/FilePreviewBlock";
import {
  PastedAttachmentBlock,
  pastedAttachmentDirective,
} from "@app/components/markdown/PastedAttachmentBlock";
import {
  getTaskDirectiveBlock,
  taskDirective,
} from "@app/components/markdown/TaskDirectiveBlock";
import {
  KNOWLEDGE_TAG_REGEX,
  parseKnowledgeTag,
} from "@app/lib/knowledge/format";
import {
  agentMentionDirective,
  getAgentMentionPlugin,
  getUserMentionPlugin,
  userMentionDirective,
} from "@app/lib/mentions/markdown/plugin";
import { getSkillIcon } from "@app/lib/skill";
import { parseSkillTag, SKILL_TAG_REGEX } from "@app/lib/skills/format";
import { parseToolTag, TOOL_TAG_REGEX } from "@app/lib/tools/format";
import type { UserMessageTypeWithContentFragments } from "@app/types/assistant/conversation";
import { isContentNodeContentFragment } from "@app/types/content_fragment";
import {
  SKILL_SIDE_PANEL_TYPE,
  TOOL_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";
import type { WorkspaceType } from "@app/types/user";
import { Markdown } from "@dust-tt/sparkle";
import { useMemo } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

interface UserMessageMarkdownProps {
  owner: WorkspaceType;
  message: UserMessageTypeWithContentFragments;
  isLastMessage: boolean;
}

const skillDirective = createAttachmentChipDirective("skill");

const toolDirective = createAttachmentChipDirective("tool");

const knowledgeDirective = createTextDirective(
  "knowledge",
  (title, { id, space, dsv }) => ({
    id,
    title,
    space,
    dsv,
  })
);

export const UserMessageMarkdown = ({
  owner,
  message,
  isLastMessage,
}: UserMessageMarkdownProps) => {
  const { togglePanel } = useConversationSidePanelContext();

  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
      mention: getAgentMentionPlugin(owner),
      mention_user: getUserMentionPlugin(owner),
      content_node_mention: ({ title, url }: ContentNodeMentionBlockProps) => {
        // The directive carries no url; the attached fragment has the source url.
        const fragment = message.contentFragments
          .filter(isContentNodeContentFragment)
          .find((f) => f.title === title && f.sourceUrl);

        return (
          <ContentNodeMentionBlock
            title={title}
            url={fragment?.sourceUrl ?? url}
          />
        );
      },
      pasted_attachment: PastedAttachmentBlock,
      file_preview: getFilePreviewPlugin(),
      skill: ({ id, icon, name }: AttachmentChipDirectiveProps) => {
        return (
          <AttachmentChipDirectiveBlock
            label={name}
            icon={getSkillIcon(icon ?? null)}
            onClick={() =>
              togglePanel({ type: SKILL_SIDE_PANEL_TYPE, skillId: id })
            }
          />
        );
      },
      tool: ({ id, icon, name }: AttachmentChipDirectiveProps) => (
        <AttachmentChipDirectiveBlock
          label={name}
          icon={getToolIcon(icon ?? null)}
          onClick={() =>
            togglePanel({ type: TOOL_SIDE_PANEL_TYPE, toolId: id })
          }
        />
      ),
      knowledge: ({ id, title, dsv }: KnowledgeChipDirectiveProps) => {
        const fragment = message.contentFragments
          .filter(isContentNodeContentFragment)
          .find(
            (f) => f.nodeId === id && (!dsv || f.nodeDataSourceViewId === dsv)
          );

        return (
          <AttachmentChipDirectiveBlock
            label={title}
            icon={getKnowledgeIcon(fragment?.contentNodeData ?? null)}
            href={fragment?.sourceUrl ?? undefined}
          />
        );
      },
      project_task: getTaskDirectiveBlock(owner),
    }),
    [owner, togglePanel, message.contentFragments]
  );

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [
      getCiteDirective(),
      agentMentionDirective,
      userMentionDirective,
      taskDirective,
      contentNodeMentionDirective,
      pastedAttachmentDirective,
      filePreviewDirective,
      skillDirective,
      toolDirective,
      knowledgeDirective,
    ],
    []
  );

  const displayContent = useMemo(
    () =>
      message.content
        .replace(SKILL_TAG_REGEX, (match) => {
          const skill = parseSkillTag(match);
          if (!skill) {
            return match;
          }

          const iconAttribute = skill.icon ? ` icon=${skill.icon}` : "";

          return `:skill[${skill.name}]{sId=${skill.id}${iconAttribute}}`;
        })
        .replace(TOOL_TAG_REGEX, (match) => {
          const tool = parseToolTag(match);
          if (!tool) {
            return match;
          }

          const iconAttribute = tool.icon ? ` icon=${tool.icon}` : "";

          return `:tool[${tool.name}]{sId=${tool.id}${iconAttribute}}`;
        })
        .replace(KNOWLEDGE_TAG_REGEX, (match) => {
          const knowledge = parseKnowledgeTag(match);
          if (!knowledge) {
            return match;
          }

          const spaceAttribute = knowledge.spaceId
            ? ` space=${knowledge.spaceId}`
            : "";
          const dsvAttribute = knowledge.dataSourceViewId
            ? ` dsv=${knowledge.dataSourceViewId}`
            : "";

          return `:knowledge[${knowledge.title}]{id=${knowledge.id}${spaceAttribute}${dsvAttribute}}`;
        }),
    [message.content]
  );

  return (
    <Markdown
      content={displayContent}
      isStreaming={false}
      isLastMessage={isLastMessage}
      additionalMarkdownComponents={additionalMarkdownComponents}
      additionalMarkdownPlugins={additionalMarkdownPlugins}
      compactSpacing
      canCopyQuotes={false}
    />
  );
};
