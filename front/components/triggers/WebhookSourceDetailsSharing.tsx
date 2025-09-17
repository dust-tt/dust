import { Page, SliderToggle } from "@dust-tt/sparkle";
import { useState } from "react";

import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import { useWebhookSourceViewsByWebhookSource } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceType } from "@app/types/triggers/webhooks";

type WebhookSourceDetailsSharingProps = {
  webhookSource: WebhookSourceType;
  owner: LightWorkspaceType;
};

export function WebhookSourceDetailsSharing({
  webhookSource,
  owner,
}: WebhookSourceDetailsSharingProps) {
  const [loading, setLoading] = useState(false);
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const { webhookSourceViews, isWebhookSourceViewsLoading } =
    useWebhookSourceViewsByWebhookSource({
      owner,
      webhookSourceId: webhookSource.sId,
    });

  const globalSpace = spaces.find((space) => space.kind === "global");
  const webhookSourceViewsWithSpace = webhookSourceViews.map((view) => ({
    ...view,
    space: spaces.find((space) => space.sId === view.spaceId) ?? null,
  }));
  const globalView =
    webhookSourceViewsWithSpace.find((view) => view.space?.kind === "global") ??
    null;
  const isRestricted = globalView === null;

  return (
    <div className="flex flex-col gap-2">
      <div className="mb-2 flex w-full flex-col gap-y-2 pt-2">
        <div className="flex w-full items-center justify-between overflow-visible">
          <Page.SectionHeader title="Available to all Spaces" />
          <SliderToggle
            disabled={isWebhookSourceViewsLoading || loading}
            selected={!isRestricted}
            onClick={async () => {
              if (globalSpace !== null) {
                setLoading(true);
                // if it's restricted, we add the global view
                // if it's not restricted, we remove the global view
                setLoading(false);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
