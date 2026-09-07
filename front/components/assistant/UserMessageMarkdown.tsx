import { ToolChip } from "@app/components/editor/extensions/skill_builder/ToolChip";
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
import type { SkillDirectiveProps } from "@app/components/markdown/SkillBlock";
import {
  SkillBlock,
  skillDirective,
} from "@app/components/markdown/SkillBlock";
import {
  getTaskDirectiveBlock,
  taskDirective,
} from "@app/components/markdown/TaskDirectiveBlock";
import { CapabilityDetailsSheets } from "@app/components/shared/CapabilityDetailsSheets";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  agentMentionDirective,
  getAgentMentionPlugin,
  getUserMentionPlugin,
  userMentionDirective,
} from "@app/lib/mentions/markdown/plugin";
import { parseSkillTag, SKILL_TAG_REGEX } from "@app/lib/skills/format";
import type { ToolDirectiveProps } from "@app/lib/tools/markdown";
import { toolDirective } from "@app/lib/tools/markdown";
import type { UserMessageType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import { Markdown } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

interface UserMessageMarkdownProps {
  owner: WorkspaceType;
  message: UserMessageType;
  isLastMessage: boolean;
}

export const UserMessageMarkdown = ({
  owner,
  message,
  isLastMessage,
}: UserMessageMarkdownProps) => {
  const { user } = useAuth();
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
      mention: getAgentMentionPlugin(owner),
      mention_user: getUserMentionPlugin(owner),
      content_node_mention: ContentNodeMentionBlock,
      pasted_attachment: PastedAttachmentBlock,
      file_preview: getFilePreviewPlugin(),
      skill: ({ skillIcon, skillId, skillName }: SkillDirectiveProps) => (
        <SkillBlock
          skillIcon={skillIcon ?? null}
          skillId={skillId}
          skillName={skillName}
        />
      ),
      tool: ({ toolId, toolIcon, toolName }: ToolDirectiveProps) => (
        <ToolChip
          title={toolName}
          toolIcon={toolIcon ?? null}
          onClick={() => setSelectedToolId(toolId)}
        />
      ),
      project_task: getTaskDirectiveBlock(owner),
    }),
    [owner]
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
      message.content.replace(SKILL_TAG_REGEX, (match) => {
        const skill = parseSkillTag(match);
        if (!skill) {
          return match;
        }

        const iconAttribute = skill.icon ? ` icon=${skill.icon}` : "";

        return `:skill[${skill.name}]{sId=${skill.id}${iconAttribute}}`;
      }),
    [message.content]
  );

  return (
    <>
      <Markdown
        content={displayContent}
        isStreaming={false}
        isLastMessage={isLastMessage}
        additionalMarkdownComponents={additionalMarkdownComponents}
        additionalMarkdownPlugins={additionalMarkdownPlugins}
        compactSpacing
        canCopyQuotes={false}
      />
      {selectedToolId && (
        <CapabilityDetailsSheets
          owner={owner}
          user={user}
          selectedSkillId={null}
          selectedMCPServerView={null}
          selectedMCPServerViewId={selectedToolId}
          onCloseSkill={() => {}}
          onCloseTool={() => setSelectedToolId(null)}
        />
      )}
    </>
  );
};
