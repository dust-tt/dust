import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useConversationExternalNotificationsToggle } from "@app/hooks/useConversationExternalNotificationsToggle";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface ConversationExternalNotificationsToggleProps {
  owner: WorkspaceType;
}

export function ConversationExternalNotificationsToggle({
  owner,
}: ConversationExternalNotificationsToggleProps) {
  const { t } = useLingui();
  const { isEnabled, isChanging, doToggleConversationExternalNotifications } =
    useConversationExternalNotificationsToggle({ owner });

  return (
    <GovernanceSettingRowLayout
      label={t`Email and Slack notifications`}
      description={t`Whether members can receive conversation notifications by email or Slack. In-app Dust notifications are not affected.`}
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
