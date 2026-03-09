import { getIcon } from "@app/components/resources/resources_icons";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { DEFAULT_WEBHOOK_ICON } from "@app/lib/webhookSource";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import {
  isWebhookProvider,
  WEBHOOK_PRESETS,
} from "@app/types/triggers/webhooks";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PlusIcon,
} from "@dust-tt/sparkle";

type AddTriggerMenuProps = {
  owner: WorkspaceType;
  createWebhook: (provider: WebhookProvider | null) => void;
};

export const AddTriggerMenu = ({
  owner,
  createWebhook,
}: AddTriggerMenuProps) => {
  const { hasFeature } = useFeatureFlags();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label="Add Source"
          variant="primary"
          icon={PlusIcon}
          size="sm"
          onClick={withTracking(TRACKING_AREAS.TRIGGERS, "add_trigger_menu")}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(WEBHOOK_PRESETS)
          .filter(([_, { featureFlag }]) => {
            return featureFlag === undefined || hasFeature(featureFlag);
          })
          .map(([provider, preset]) => (
            <DropdownMenuItem
              key={`trigger-${provider}`}
              label={preset.name + (preset.featureFlag ? " (Preview)" : "")}
              icon={getIcon(preset.icon)}
              onClick={() =>
                isWebhookProvider(provider) && createWebhook(provider)
              }
            />
          ))}
        <DropdownMenuItem
          key="custom"
          label="Custom Webhook"
          icon={getIcon(DEFAULT_WEBHOOK_ICON)}
          onClick={() => createWebhook(null)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
