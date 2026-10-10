import { MentionDisplay } from "@app/components/mentions/MentionDisplay";
import {
  agentMentionDirective,
  getUserMentionPlugin,
  userMentionDirective,
} from "@app/lib/mentions/markdown/plugin";
import type { LightWorkspaceType } from "@app/types/user";
import { Markdown } from "@dust-tt/sparkle";
import { memo, useMemo } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

const COMMENT_MARKDOWN_PLUGINS: PluggableList = [
  agentMentionDirective,
  userMentionDirective,
];

interface AgentMentionProps {
  agentName: string;
  agentId: string;
}

interface CommentBodyMarkdownProps {
  owner: LightWorkspaceType;
  body: string;
}

/**
 * @cc [owner:tdraier,label:react] comment-body-mentions
 * A comment message body MUST render as Markdown with agent and user mention directives shown as
 * mention chips, as in a conversation message, without depending on the conversation side
 * panel, so it works wherever a document opens.
 */
export const CommentBodyMarkdown = memo(function CommentBodyMarkdown({
  owner,
  body,
}: CommentBodyMarkdownProps) {
  // Only directive tags, which react-markdown's Components does not name.
  const components: Components & Record<string, unknown> = useMemo(
    () => ({
      mention: ({ agentName, agentId }: AgentMentionProps) => (
        <MentionDisplay
          mention={{
            id: agentId,
            label: agentName,
            type: "agent",
            pictureUrl: "",
            description: "",
          }}
          interactive
          owner={owner}
          showTooltip={false}
        />
      ),
      mention_user: getUserMentionPlugin(owner),
    }),
    [owner]
  );

  return (
    <Markdown
      content={body}
      isStreaming={false}
      forcedTextSize="text-sm"
      compactSpacing
      canCopyQuotes={false}
      additionalMarkdownComponents={components}
      additionalMarkdownPlugins={COMMENT_MARKDOWN_PLUGINS}
    />
  );
});
