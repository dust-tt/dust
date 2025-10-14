import {
  ContextItem,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SlackLogo,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useState } from "react";
import * as React from "react";

import { useConnectorConfig, useToggleChatBot } from "@app/lib/swr/connectors";
import type { DataSourceType, PlanType, WorkspaceType } from "@app/types";

export function SlackBotEnableView({
  owner,
  readOnly,
  isAdmin,
  dataSource,
  plan,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
  plan: PlanType;
}) {
  const { configValue } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "botEnabled",
  });
  const botEnabled = configValue === "true";

  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showNoSlackBotPopup, setShowNoSlackBotPopup] = useState(false);

  const doToggle = useToggleChatBot({
    dataSource,
    owner,
  });

  const handleSetBotEnabled = async (botEnabled: boolean) => {
    setLoading(true);

    await doToggle(botEnabled);

    setLoading(false);
  };

  return (
    <ContextItem.List>
      <ContextItem
        title="Slack Bot"
        visual={<ContextItem.Visual visual={SlackLogo} />}
        action={
          <div className="relative">
            <SliderToggle
              size="xs"
              onClick={async () => {
                if (!plan.limits.assistant.isSlackBotAllowed) {
                  setShowNoSlackBotPopup(true);
                } else {
                  await handleSetBotEnabled(!botEnabled);
                }
              }}
              selected={botEnabled}
              disabled={readOnly || !isAdmin || loading}
            />
            <Dialog open={showNoSlackBotPopup}>
              <DialogContent size="md">
                <DialogHeader hideButton={true}>
                  <DialogTitle>{`${plan.name} plan`}</DialogTitle>
                </DialogHeader>
                <DialogContainer>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    Your plan does not allow for the Slack bot to be enabled.
                    Upgrade your plan to chat with Dust agents on Slack.
                  </p>
                </DialogContainer>
                <DialogFooter
                  leftButtonProps={{
                    label: "Cancel",
                    variant: "outline",
                    onClick: () => setShowNoSlackBotPopup(false),
                  }}
                  rightButtonProps={{
                    label: "Check Dust plans",
                    variant: "primary",
                    onClick: () => {
                      void router.push(`/w/${owner.sId}/subscription`);
                    },
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            You can ask questions to your agents directly from Slack by
            mentioning @Dust.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
