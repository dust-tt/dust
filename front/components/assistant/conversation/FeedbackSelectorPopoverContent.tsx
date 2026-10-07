import { useEditors } from "@app/lib/swr/agent_editors";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar, Page } from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";

interface FeedbackSelectorPopoverContentProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  isGlobalAgent: boolean;
}

export function FeedbackSelectorPopoverContent({
  owner,
  agentConfigurationId,
  isGlobalAgent,
}: FeedbackSelectorPopoverContentProps) {
  const { editors } = useEditors({
    owner,
    agentConfigurationId,
    disabled: isGlobalAgent,
  });

  if (isGlobalAgent) {
    return null;
  }

  if (editors.length === 0) {
    return null;
  }

  const avatarProps = editors.map((editor) => ({
    name: `${editor.firstName} ${editor.lastName}`,
    visual: editor.image ?? undefined,
  }));

  return (
    <div className="mb-4 mt-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Page.P variant="secondary">
          <Trans>Editors who will see this:</Trans>
        </Page.P>
        <Avatar.Stack avatars={avatarProps} size="xs" nbVisibleItems={4} />
      </div>
    </div>
  );
}
