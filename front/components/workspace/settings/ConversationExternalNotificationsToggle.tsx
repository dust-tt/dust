import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useConversationExternalNotificationsToggle } from "@app/hooks/useConversationExternalNotificationsToggle";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";

const LABEL = "Email and Slack notifications";
const DESCRIPTION =
  "Whether members can receive conversation notifications by email or Slack. In-app Dust notifications are not affected.";

interface ConversationExternalNotificationsToggleProps {
  owner: WorkspaceType;
}

export function ConversationExternalNotificationsToggle({
  owner,
}: ConversationExternalNotificationsToggleProps) {
  const { isEnabled, isChanging, doToggleConversationExternalNotifications } =
    useConversationExternalNotificationsToggle({ owner });

  return (
    <GovernanceSettingRowLayout
      label={LABEL}
      description={DESCRIPTION}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleConversationExternalNotifications}
        />
      }
    />
  );
}
