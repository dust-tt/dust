import { SliderToggle } from "@dust-tt/sparkle";
import type { WhitelistableFeature, WorkspaceType } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useContext } from "react";

import type { NotificationType } from "@app/components/sparkle/Notification";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useSubmitFunction } from "@app/lib/client/utils";

interface DataSourceDataTableProps {
  owner: WorkspaceType;
  whitelistableFeatures: WhitelistableFeature[];
}

function Separator() {
  return (
    <div className="s-w-full s-py-2">
      <div className="s-h-px s-w-full s-bg-structure-200" />
    </div>
  );
}

export function FeatureFlagsList({
  owner,
  whitelistableFeatures,
}: DataSourceDataTableProps) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);

  const { submit: onToggleFeature, isSubmitting: isTogglingFeature } =
    useSubmitFunction(toggleFeatureFlag);

  return (
    <div className="w-124 h-72 overflow-auto rounded-md border p-4">
      <h4 className="text-md mb-4 font-bold leading-none">Features:</h4>
      {whitelistableFeatures.map((ff) => {
        const isEnabledForWorkspace = owner.flags.some((f) => f === ff);

        return (
          <div key={ff} className="flex flex-col text-sm">
            <div className="flex flex-row space-x-4">
              <span>{ff}</span>
              <SliderToggle
                size="xs"
                key={`${ff}_toggle`}
                selected={isEnabledForWorkspace}
                disabled={isTogglingFeature}
                onClick={async () =>
                  onToggleFeature(
                    owner,
                    ff,
                    isEnabledForWorkspace,
                    router.reload,
                    sendNotification
                  )
                }
              />
            </div>
            <Separator />
          </div>
        );
      })}
    </div>
  );
}

async function toggleFeatureFlag(
  owner: WorkspaceType,
  feature: WhitelistableFeature,
  enabled: boolean,
  reload: () => void,
  sendNotification: (n: NotificationType) => void
) {
  try {
    const r = await fetch(`/api/poke/workspaces/${owner.sId}/features`, {
      method: enabled ? "DELETE" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: feature,
      }),
    });
    if (!r.ok) {
      throw new Error("Failed to disable feature.");
    }

    reload();
  } catch (e) {
    sendNotification({
      title: "Error",
      description: `An error occurred while toggling feature "${feature}": ${JSON.stringify(
        e,
        null,
        2
      )}`,
      type: "error",
    });
  }
}
