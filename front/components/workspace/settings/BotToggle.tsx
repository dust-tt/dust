import { updateConnectorConnectionId } from "@app/components/data_source/ConnectorPermissionsModal";
import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useSendNotification } from "@app/hooks/useNotification";
import { useCellContext } from "@app/lib/auth/CellContext";
import { clientFetch } from "@app/lib/egress/client";
import { useConnectorConfig, useToggleChatBot } from "@app/lib/swr/connectors";
import type { PostDataSourceRequestBody } from "@app/types/api/data_sources";
import type { ConnectorProvider, DataSourceType } from "@app/types/data_source";
import { setupOAuthConnection } from "@app/types/oauth/client/setup";
import type { OAuthProvider, OAuthUseCase } from "@app/types/oauth/lib";
import { Err, Ok } from "@app/types/shared/result";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { Button, RefreshCw02, SliderToggle } from "@dust-tt/sparkle";
import { useState } from "react";

export function BotToggle({
  owner,
  botDataSource,
  systemSpace,
  oauth,
  connectorProvider,
  name,
  description,
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
  const cellContext = useCellContext();

  const createBotConnectionAndDataSource = async () => {
    // OAuth flow
    const cRes = await setupOAuthConnection({
      owner,
      provider: oauth.provider,
      useCase: oauth.useCase ?? "connection",
      extraConfig: oauth.extraConfig,
      cellInfo: cellContext.cellInfo,
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

  const handleReconnect = async () => {
    if (!botDataSource) {
      return;
    }
    const cRes = await setupOAuthConnection({
      owner,
      provider: oauth.provider,
      useCase: oauth.useCase ?? "connection",
      extraConfig: oauth.extraConfig,
      cellInfo: cellContext.cellInfo,
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
  };

  return (
    <GovernanceSettingRowLayout
      label={name}
      description={description}
      action={
        <div className="flex flex-row items-center gap-2">
          {isBotEnabled && botDataSource && (
            <Button
              variant="outline"
              label="Reconnect"
              size="xs"
              icon={RefreshCw02}
              onClick={handleReconnect}
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
      documentationUrl={documentationUrl}
    />
  );
}
