import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { getToolIcon } from "@app/components/editor/extensions/skill_builder/ToolChip";
import type { AttachmentChipDirectiveProps } from "@app/components/markdown/AttachmentChipDirective";
import {
  AttachmentChipDirectiveBlock,
  createAttachmentChipDirective,
} from "@app/components/markdown/AttachmentChipDirective";
import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import {
  ContentNodeMentionBlock,
  contentNodeMentionDirective,
} from "@app/components/markdown/ContentNodeMentionBlock";
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
  agentMentionDirective,
  getAgentMentionPlugin,
  getUserMentionPlugin,
  userMentionDirective,
} from "@app/lib/mentions/markdown/plugin";
import { getSkillIcon } from "@app/lib/skill";
import { parseSkillTag, SKILL_TAG_REGEX } from "@app/lib/skills/format";
import { parseToolTag, TOOL_TAG_REGEX } from "@app/lib/tools/format";
import type { UserMessageType } from "@app/types/assistant/conversation";
import { SKILL_SIDE_PANEL_TYPE } from "@app/types/conversation_side_panel";
import type { WorkspaceType } from "@app/types/user";
import { Markdown } from "@dust-tt/sparkle";
import { useMemo } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

interface UserMessageMarkdownProps {
  owner: WorkspaceType;
  message: UserMessageType;
  isLastMessage: boolean;
}

const skillDirective = createAttachmentChipDirective("skill");

const toolDirective = createAttachmentChipDirective("tool");

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
      content_node_mention: ContentNodeMentionBlock,
      pasted_attachment: PastedAttachmentBlock,
      file_preview: getFilePreviewPlugin(),
      skill: ({ id, icon, name }: AttachmentChipDirectiveProps) => {
        return (
          <AttachmentChipDirectiveBlock
            label={name}
            icon={icon ?? null}
            getIcon={getSkillIcon}
            onClick={() =>
              togglePanel({ type: SKILL_SIDE_PANEL_TYPE, skillId: id })
            }
          />
        );
      },
      tool: ({ icon, name }: AttachmentChipDirectiveProps) => (
        <AttachmentChipDirectiveBlock
          label={name}
          icon={icon ?? null}
          getIcon={getToolIcon}
        />
      ),
      project_task: getTaskDirectiveBlock(owner),
    }),
    [owner, togglePanel]
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
