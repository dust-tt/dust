import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PlusIcon,
} from "@dust-tt/sparkle";

import { getIcon } from "@app/components/resources/resources_icons";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { WorkspaceType } from "@app/types";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import {
  WEBHOOK_PRESETS,
  WEBHOOK_PROVIDERS,
} from "@app/types/triggers/webhooks";

type AddTriggerMenuProps = {
  owner: WorkspaceType;
  createWebhook: (provider: WebhookProvider) => void;
};

export const AddTriggerMenu = ({
  owner,
  createWebhook,
}: AddTriggerMenuProps) => {
  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label="Add Trigger"
          variant="primary"
          icon={PlusIcon}
          size="sm"
          onClick={withTracking(TRACKING_AREAS.TRIGGERS, "add_trigger_menu")}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* TODO(HOOTL): use the object directly instead */}
        {WEBHOOK_PROVIDERS.filter((provider) => {
          const preset = WEBHOOK_PRESETS[provider];
          return (
            preset.featureFlag === undefined || hasFeature(preset.featureFlag)
          );
        })
          .sort((kindA, kindB) =>
            WEBHOOK_PRESETS[kindA].name.localeCompare(
              WEBHOOK_PRESETS[kindB].name
            )
          )
          .map((kind) => (
            <DropdownMenuItem
              key={kind}
              label={WEBHOOK_PRESETS[kind].name + " Webhook"}
              icon={getIcon(WEBHOOK_PRESETS[kind].icon)}
              onClick={() => createWebhook(kind)}
            />
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
