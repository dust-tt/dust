import { ContextItem, Popup, SlackLogo, SliderToggle } from "@dust-tt/sparkle";
import type {
  APIError,
  DataSourceType,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import { useContext, useState } from "react";
import * as React from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useConnectorConfig } from "@app/lib/swr/connectors";

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
  const { configValue, mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "botEnabled",
  });
  const botEnabled = configValue === "true";

  const sendNotification = useContext(SendNotificationsContext);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showNoSlackBotPopup, setShowNoSlackBotPopup] = useState(false);

  const handleSetBotEnabled = async (botEnabled: boolean) => {
    setLoading(true);
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/config/botEnabled`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: botEnabled.toString() }),
      }
    );
    if (res.ok) {
      await mutateConfig();
      setLoading(false);
    } else {
      setLoading(false);
      const err = (await res.json()) as { error: APIError };
      sendNotification({
        type: "error",
        title: "Failed to enable the Slack bot",
        description: err.error.message,
      });
    }
    return true;
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
            <Popup
              show={showNoSlackBotPopup}
              className="absolute bottom-8 right-0"
              chipLabel={`${plan.name} plan`}
              description="Your plan does not allow for the Slack bot to be enabled. Upgrade your plan to chat with Dust assistants on Slack."
              buttonLabel="Check Dust plans"
              buttonClick={() => {
                void router.push(`/w/${owner.sId}/subscription`);
              }}
              onClose={() => {
                setShowNoSlackBotPopup(false);
              }}
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-element-700">
            You can ask questions to your assistants directly from Slack by
            mentioning @Dust.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
