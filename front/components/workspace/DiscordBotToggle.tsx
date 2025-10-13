import {
  ArrowPathIcon,
  Button,
  ContextItem,
  DiscordLogo,
  SliderToggle,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { updateConnectorConnectionId } from "@app/components/data_source/ConnectorPermissionsModal";
import { setupConnection } from "@app/components/spaces/AddConnectionMenu";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  useConnectorConfig,
  useToggleDiscordChatBot,
} from "@app/lib/swr/connectors";
import type { PostDataSourceRequestBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources";
import type { DataSourceType, SpaceType, WorkspaceType } from "@app/types";

export function DiscordBotToggle({
  owner,
  discordBotDataSource,
  systemSpace,
}: {
  owner: WorkspaceType;
  discordBotDataSource: DataSourceType | null;
  systemSpace: SpaceType;
}) {
  const { configValue } = useConnectorConfig({
    configKey: "botEnabled",
    dataSource: discordBotDataSource ?? null,
    owner,
  });
  const isDiscordBotEnabled = configValue === "true";

  const toggleDiscordBotOnExistingDataSource = useToggleDiscordChatBot({
    dataSource: discordBotDataSource ?? null,
    owner,
  });

  const [isChangingDiscordBot, setIsChangingDiscordBot] = useState(false);
  const sendNotification = useSendNotification();

  const createDiscordBotConnectionAndDataSource = async () => {
    try {
      const cRes = await setupConnection({
        owner,
        provider: "discord",
        useCase: "bot",
        extraConfig: {},
      });
      if (!cRes.isOk()) {
        throw cRes.error;
      }

      const res = await fetch(
        `/api/w/${owner.sId}/spaces/${systemSpace.sId}/data_sources`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider: "discord_bot",
            connectionId: cRes.value,
            name: undefined,
            configuration: null,
          } satisfies PostDataSourceRequestBody),
        }
      );

      if (res.ok) {
        return await res.json();
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  };

  const toggleDiscordBot = async () => {
    setIsChangingDiscordBot(true);
    if (discordBotDataSource) {
      await toggleDiscordBotOnExistingDataSource(!isDiscordBotEnabled);
    } else {
      const createRes = await createDiscordBotConnectionAndDataSource();
      if (createRes) {
        window.location.reload();
      } else {
        sendNotification({
          type: "error",
          title: `Failed to enable Discord Bot.`,
          description: `Could not create a new Discord Bot data source.`,
        });
      }
    }
    setIsChangingDiscordBot(false);
  };

  return (
    <ContextItem.List>
      <div className="h-full border-b border-border dark:border-border-night" />
      <ContextItem
        title="Discord Bot"
        subElement="Use Dust Agents in Discord with the Dust Discord app"
        visual={<DiscordLogo className="h-6 w-6" />}
        hasSeparatorIfLast={true}
        action={
          <div className="flex flex-row items-center gap-2">
            {isDiscordBotEnabled && discordBotDataSource && (
              <Button
                variant="outline"
                label="Reconnect"
                size="xs"
                icon={ArrowPathIcon}
                onClick={async () => {
                  const cRes = await setupConnection({
                    owner,
                    provider: "discord",
                    useCase: "bot",
                    extraConfig: {},
                  });
                  if (!cRes.isOk()) {
                    sendNotification({
                      type: "error",
                      title: "Failed to reconnect Discord Bot.",
                      description: "Could not reconnect the Dust Discord Bot.",
                    });
                  } else {
                    const updateRes = await updateConnectorConnectionId(
                      cRes.value,
                      "discord_bot",
                      discordBotDataSource,
                      owner
                    );

                    if (updateRes.error) {
                      sendNotification({
                        type: "error",
                        title: "Failed to update the Discord Bot connection",
                        description: updateRes.error,
                      });
                    } else {
                      sendNotification({
                        type: "success",
                        title: "Successfully updated Discord Bot connection",
                        description: "The connection was successfully updated.",
                      });
                    }
                  }
                }}
              />
            )}
            <SliderToggle
              selected={isDiscordBotEnabled}
              disabled={isChangingDiscordBot}
              onClick={() => {
                void toggleDiscordBot();
              }}
            />
          </div>
        }
      />
    </ContextItem.List>
  );
}
