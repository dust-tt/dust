import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PlusIcon,
} from "@dust-tt/sparkle";

import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { WorkspaceType } from "@app/types";
import type { WebhookSourceKind } from "@app/types/triggers/webhooks";
import {
  WEBHOOK_SOURCE_KIND,
  WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP,
} from "@app/types/triggers/webhooks";
type AddTriggerMenuProps = {
  owner: WorkspaceType;
  createWebhook: (kind: WebhookSourceKind) => void;
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
        {WEBHOOK_SOURCE_KIND.filter((kind) => {
          const preset = WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind];
          return (
            preset.featureFlag === undefined || hasFeature(preset.featureFlag)
          );
        })
          .sort((kindA, kindB) =>
            WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kindA].name.localeCompare(
              WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kindB].name
            )
          )
          .map((kind) => (
            <DropdownMenuItem
              key={kind}
              label={WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind].name + " Webhook"}
              icon={WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind].icon}
              onClick={() => createWebhook(kind)}
            />
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
