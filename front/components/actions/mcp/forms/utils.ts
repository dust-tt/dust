import { CreateMCPServerDialogSubmitError } from "@app/components/actions/mcp/forms/submitCreateMCPServerDialogForm";
import type {
  CreateMCPServerDialogFormValues,
  MCPServerOAuthFormValues,
} from "@app/components/actions/mcp/forms/types";
import {
  createMCPServerDialogFormSchema,
  mcpServerOAuthFormSchema,
} from "@app/components/actions/mcp/forms/types";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { OAuthProvider } from "@app/types/oauth/lib";
import { OAUTH_PROVIDER_NAMES } from "@app/types/oauth/lib";

type SendErrorNotification = (title: string, description: string) => void;

interface ErrorContext {
  remoteServerUrl: string;
  provider: OAuthProvider | null;
}

interface LoadingControls {
  setIsLoading: (isLoading: boolean) => void;
  setExternalIsLoading: (isLoading: boolean) => void;
  setRemoteMCPServerOAuthDiscoveryDone: (done: boolean) => void;
}

interface HandleCreateMCPServerDialogSubmitErrorParams {
  error: Error;
  context: ErrorContext;
  sendNotification: SendErrorNotification;
  loading: LoadingControls;
}

export function handleCreateMCPServerDialogSubmitError({
  error,
  context,
  sendNotification,
  loading,
}: HandleCreateMCPServerDialogSubmitErrorParams): void {
  const {
    setIsLoading,
    setExternalIsLoading,
    setRemoteMCPServerOAuthDiscoveryDone,
  } = loading;

  if (!(error instanceof CreateMCPServerDialogSubmitError)) {
    sendNotification("Failed to create MCP server", error.message);
    setExternalIsLoading(false);
    setIsLoading(false);
    return;
  }

  setRemoteMCPServerOAuthDiscoveryDone(error.remoteMCPServerOAuthDiscoveryDone);

  switch (error.kind) {
    case "discover_oauth_metadata": {
      sendNotification(
        "Failed to discover OAuth metadata for MCP server",
        `${error.message} (${context.remoteServerUrl})`
      );
      setIsLoading(false);
      return;
    }

    case "missing_use_case": {
      sendNotification("Missing use case", error.message);
      setIsLoading(false);
      return;
    }

    case "oauth_connection": {
      const title = context.provider
        ? `Failed to connect ${OAUTH_PROVIDER_NAMES[context.provider]}`
        : "Failed to connect OAuth provider";
      sendNotification(title, error.message);
      setIsLoading(false);
      return;
    }

    case "create_server": {
      sendNotification("Failed to create MCP server", error.message);
      setExternalIsLoading(false);
      setIsLoading(false);
      return;
    }
  }
}

export function getConnectMCPServerDialogDefaultValues(): MCPServerOAuthFormValues {
  return mcpServerOAuthFormSchema.parse({});
}

export function getCreateMCPServerDialogDefaultValues(
  defaultServerConfig?: DefaultRemoteMCPServerConfig
): CreateMCPServerDialogFormValues {
  return createMCPServerDialogFormSchema.parse({
    remoteServerUrl: defaultServerConfig?.url,
    authMethod: defaultServerConfig?.authMethod ?? undefined,
  });
}
