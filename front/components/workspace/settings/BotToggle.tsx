import {
  ArrowPathIcon,
  BookOpenIcon,
  Button,
  ContextItem,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { updateConnectorConnectionId } from "@app/components/data_source/ConnectorPermissionsModal";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useConnectorConfig, useToggleChatBot } from "@app/lib/swr/connectors";
import type { PostDataSourceRequestBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources";
import type {
  ConnectorProvider,
  DataSourceType,
  OAuthProvider,
  OAuthUseCase,
  SpaceType,
  WorkspaceType,
} from "@app/types";
import { Err, Ok, setupOAuthConnection } from "@app/types";

export function BotToggle({
  owner,
  botDataSource,
  systemSpace,
  oauth,
  connectorProvider,
  name,
  description,
  visual,
  documentationUrl,
}: {
  owner: WorkspaceType;
  botDataSource: DataSourceType | null;
  systemSpace: SpaceType;
  oauth: {
    provider: OAuthProvider;
    useCase?: OAuthUseCase;
    extraConfig: Record<string, string>;
  };
  connectorProvider: ConnectorProvider;
  name: string;
  description: string;
  visual: React.ReactNode;
  documentationUrl?: string;
}) {
  const { configValue } = useConnectorConfig({
    configKey: "botEnabled",
    dataSource: botDataSource ?? null,
    owner,
  });
  const isBotEnabled = configValue === "true";

  const toggleBotOnExistingDataSource = useToggleChatBot({
    dataSource: botDataSource ?? null,
    owner,
    botName: name,
  });

  const [isChangingBot, setIsChangingBot] = useState(false);
  const sendNotification = useSendNotification();

  const createBotConnectionAndDataSource = async () => {
    // OAuth flow
    const cRes = await setupOAuthConnection({
      dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
      owner,
      provider: oauth.provider,
      useCase: oauth.useCase ?? "connection",
      extraConfig: oauth.extraConfig,
    });
    if (!cRes.isOk()) {
      return cRes;
    }

    const connectionId = cRes.value.connection_id;

    const res = await clientFetch(
      `/api/w/${owner.sId}/spaces/${systemSpace.sId}/data_sources`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: connectorProvider,
          connectionId,
          name: undefined,
          configuration: null,
        } satisfies PostDataSourceRequestBody),
      }
    );

    if (res.ok) {
      return new Ok(await res.json());
    } else {
      return new Err((await res.json()).error?.connectors_error);
    }
  };

  const toggleBot = async () => {
    setIsChangingBot(true);
    if (botDataSource) {
      await toggleBotOnExistingDataSource(!isBotEnabled);
    } else {
      const createRes = await createBotConnectionAndDataSource();
      if (createRes.isOk()) {
        // TODO: likely better to still make the call (but tricky since data source is not yet created).
        window.location.reload();
      } else {
        sendNotification({
          type: "error",
          title: `Failed to enable ${name}.`,
          description:
            createRes.error?.message ??
            `Could not create a new ${name} data source.`,
        });
      }
    }
    setIsChangingBot(false);
  };

  return (
    <ContextItem
      title={name}
      subElement={
        <div className="flex flex-row items-center gap-2">
          <span>{description}</span>
          {documentationUrl && (
            <a
              href={documentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-action-400 hover:text-action-500 text-sm"
            >
              <BookOpenIcon className="h-4 w-4" />
            </a>
          )}
        </div>
      }
      visual={visual}
      truncateSubElement={true}
      hasSeparatorIfLast={true}
      action={
        <div className="flex flex-row items-center gap-2">
          {isBotEnabled && botDataSource && (
            <Button
              variant="outline"
              label="Reconnect"
              size="xs"
              icon={ArrowPathIcon}
              onClick={async () => {
                const cRes = await setupOAuthConnection({
                  dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
                  owner,
                  provider: oauth.provider,
                  useCase: oauth.useCase ?? "connection",
                  extraConfig: oauth.extraConfig,
                });
                if (!cRes.isOk()) {
                  sendNotification({
                    type: "error",
                    title: `Failed to reconnect ${name}.`,
                    description: `Could not reconnect the Dust ${name}.`,
                  });
                } else {
                  const updateRes = await updateConnectorConnectionId(
                    cRes.value.connection_id,
                    oauth.extraConfig,
                    connectorProvider,
                    botDataSource,
                    owner
                  );

                  if (updateRes.error) {
                    sendNotification({
                      type: "error",
                      title: `Failed to update the ${name} connection`,
                      description: updateRes.error,
                    });
                  } else {
                    sendNotification({
                      type: "success",
                      title: `Successfully updated ${name} connection`,
                      description: "The connection was successfully updated.",
                    });
                  }
                }
              }}
            />
          )}
          <SliderToggle
            selected={
              // When changing and initially enabled, show disabled, and vice versa.
              isBotEnabled !== isChangingBot
            }
            disabled={isChangingBot}
            onClick={() => {
              void toggleBot();
            }}
          />
        </div>
      }
    />
  );
}
