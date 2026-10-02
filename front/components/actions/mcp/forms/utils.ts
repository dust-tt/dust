import { getStaticCredentialForm } from "@app/components/actions/mcp/create/static_credential_forms";
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
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type { MCPServerViewNameConflictDetails } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase, OAuthProvider } from "@app/types/oauth/lib";
import {
  getProviderRequiredOAuthCredentialInputs,
  isSupportedOAuthCredential,
  OAUTH_PROVIDER_NAMES,
} from "@app/types/oauth/lib";

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

export function getConnectMCPServerDialogDefaultValues(
  initialUseCase?: MCPServerOAuthFormValues["useCase"]
): MCPServerOAuthFormValues {
  return mcpServerOAuthFormSchema.parse({
    useCase: initialUseCase ?? null,
  });
}

/**
 * True when Refresh can relaunch OAuth from the click handler without opening the
 * connect dialog (no use-case picker, no credential fields, no static form).
 * Keeping window.open on the user gesture avoids popup blockers.
 */
export function canRefreshMCPAuthWithoutDialog({
  authorization,
  useCase,
}: {
  authorization: AuthorizationInfo | null | undefined;
  useCase: MCPOAuthUseCase | null | undefined;
}): boolean {
  if (!authorization || !useCase) {
    return false;
  }

  if (getStaticCredentialForm(authorization.provider, useCase)) {
    return false;
  }

  // mcp / mcp_static Refresh reuses stored workspace OAuth metadata via
  // mcp_server_id (discovery endpoints or static client credentials). No dialog.
  if (
    authorization.provider === "mcp" ||
    authorization.provider === "mcp_static"
  ) {
    return true;
  }

  const inputs = getProviderRequiredOAuthCredentialInputs({
    provider: authorization.provider,
    useCase,
  });
  if (!inputs) {
    return true;
  }

  // Any credential that still needs admin input requires the dialog.
  return !Object.entries(inputs).some(
    ([key, inputData]) =>
      isSupportedOAuthCredential(key) && inputData.value === undefined
  );
}

export function getCreateMCPServerDialogDefaultValues(
  defaultServerConfig?: DefaultRemoteMCPServerConfig
): CreateMCPServerDialogFormValues {
  return createMCPServerDialogFormSchema.parse({
    remoteServerUrl: defaultServerConfig?.url,
    authMethod: defaultServerConfig?.authMethod ?? undefined,
  });
}
