import { Markdown } from "@dust-tt/sparkle";
import React, { useMemo } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

import {
  CiteBlock,
  getCiteDirective,
} from "@app/components/markdown/CiteBlock";
import {
  ContentNodeMentionBlock,
  contentNodeMentionDirective,
} from "@app/components/markdown/ContentNodeMentionBlock";
import {
  PastedAttachmentBlock,
  pastedAttachmentDirective,
} from "@app/components/markdown/PastedAttachmentBlock";
import {
  agentMentionDirective,
  getAgentMentionPlugin,
  getUserMentionPlugin,
  userMentionDirective,
} from "@app/lib/mentions/markdown/plugin";
import type { UserMessageType, WorkspaceType } from "@app/types";

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
  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      // Warning: we can't rename easily `mention` to agent_mention, because the messages DB contains this name
      mention: getAgentMentionPlugin(owner),
      mention_user: getUserMentionPlugin(owner),
      content_node_mention: ContentNodeMentionBlock,
      pasted_attachment: PastedAttachmentBlock,
    }),
    [owner]
  );

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [
      getCiteDirective(),
      agentMentionDirective,
      userMentionDirective,
      contentNodeMentionDirective,
      pastedAttachmentDirective,
    ],
    []
  );

  return (
    <Markdown
      content={message.content}
      isStreaming={false}
      isLastMessage={isLastMessage}
      additionalMarkdownComponents={additionalMarkdownComponents}
      additionalMarkdownPlugins={additionalMarkdownPlugins}
      compactSpacing
      canCopyQuotes={false}
    />
  );
};
