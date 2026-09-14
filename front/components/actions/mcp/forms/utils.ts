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
import type { MCPServerViewNameConflictDetails } from "@app/lib/api/mcp";
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

export function getMCPServerViewNameError({
  viewName,
  needsCustomName,
  nameConflict,
  conflictDetails,
  existingViewNames,
}: {
  viewName: string | undefined;
  needsCustomName: boolean;
  nameConflict: string | null;
  conflictDetails?: MCPServerViewNameConflictDetails | null;
  existingViewNames: string[];
}): string | null {
  const trimmed = (viewName ?? "").trim();
  if (needsCustomName && !trimmed) {
    return "Name is required.";
  }
  if (nameConflict) {
    // A cropped tool-name collision: name the existing connection and the
    // shared model-facing tool name so the cause is diagnosable.
    if (conflictDetails?.conflictingToolName) {
      return (
        `This name produces the tool "${conflictDetails.conflictingToolName}", ` +
        `which already exists on the connection ` +
        `"${conflictDetails.conflictingServerName}". Enter a different name.`
      );
    }
    if (!trimmed) {
      return `The default name "${nameConflict}" conflicts with an existing Tool. Enter a different name.`;
    }
    if (trimmed === nameConflict) {
      return "This name conflicts with an existing Tool. Enter a different name.";
    }
  }
  if (trimmed.length > 0 && existingViewNames.includes(trimmed)) {
    return "This name is already in use.";
  }
  return null;
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
