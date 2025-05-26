import {
  ArrowPathIcon,
  Button,
  Chip,
  CloudArrowLeftRightIcon,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useSubmitFunction } from "@app/lib/client/utils";
import {
  useLabsCreateSalesforcePersonalConnection,
  useLabsSalesforceDataSourcesWithPersonalConnection,
} from "@app/lib/swr/labs";
import { useCreateMCPServerConnection } from "@app/lib/swr/mcp_servers";
import type {
  LightWorkspaceType,
  OAuthProvider,
  OAuthUseCase,
} from "@app/types";

export function MCPServerPersonalAuthenticationRequired({
  owner,
  mcpServerId,
  provider,
  useCase,
  retryHandler,
}: {
  owner: LightWorkspaceType;
  mcpServerId: string;
  provider: OAuthProvider;
  useCase: OAuthUseCase;
  retryHandler: () => void;
}) {
  // const { dataSources } = useLabsSalesforceDataSourcesWithPersonalConnection({
  //   owner,
  // });
  // const dataSource = dataSources[0];
  // const { createPersonalConnection } =
  //   useLabsCreateSalesforcePersonalConnection(owner);

  // useEffect(() => {
  //   if (dataSource && dataSource.personalConnection) {
  //     retryHandler();
  //   }
  // }, [dataSource, retryHandler]);

  const { submit: retry, isSubmitting: isRetrying } = useSubmitFunction(
    async () => retryHandler()
  );

  // const { createMCPServerConnection } = useCreateMCPServerConnection({ owner });

  const [isConnected, setIsConnected] = useState<boolean>(true);

  console.log("MCPServerPersonalAuthenticationRequired rendered", isConnected);
  console.log("mcpServerId", mcpServerId);
  console.log("provider", provider);
  console.log("useCase", useCase);
  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-1 sm:flex-row">
        <Chip
          color="info"
          label={
            "The agent took an action that requires personal authentication"
          }
          size="xs"
        />
        <Button
          label={`Connect`}
          variant="outline"
          size="xs"
          icon={CloudArrowLeftRightIcon}
          onClick={async () => {
            setIsConnected(true);
            // await createPersonalConnection(dataSource);
          }}
        />
      </div>
      {isConnected ? (
        <div>
          <Button
            variant="outline"
            size="sm"
            icon={ArrowPathIcon}
            label="Retry"
            onClick={retry}
            disabled={isRetrying}
          />
        </div>
      ) : null}
    </div>
  );
}
