import type { NotificationType } from "@dust-tt/sparkle";
import type { UseFormReturn } from "react-hook-form";

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
import { OAUTH_PROVIDER_NAMES } from "@app/types";

type SendNotificationFn = (notification: NotificationType) => void;

interface HandleCreateMCPServerDialogSubmitErrorParams {
  error: Error;
  values: CreateMCPServerDialogFormValues;
  authorization: { provider: keyof typeof OAUTH_PROVIDER_NAMES } | null;
  form: UseFormReturn<CreateMCPServerDialogFormValues>;
  sendNotification: SendNotificationFn;
  setRemoteMCPServerOAuthDiscoveryDone: (done: boolean) => void;
  setExternalIsLoading: (isLoading: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
}

export function handleCreateMCPServerDialogSubmitError({
  error,
  values,
  authorization,
  form,
  sendNotification,
  setRemoteMCPServerOAuthDiscoveryDone,
  setExternalIsLoading,
  setIsLoading,
}: HandleCreateMCPServerDialogSubmitErrorParams): void {
  if (!(error instanceof CreateMCPServerDialogSubmitError)) {
    sendNotification({
      type: "error",
      title: "Failed to create MCP server",
      description: error.message,
    });
    setExternalIsLoading(false);
    setIsLoading(false);
    return;
  }

  setRemoteMCPServerOAuthDiscoveryDone(error.remoteMCPServerOAuthDiscoveryDone);

  switch (error.kind) {
    case "discover_oauth_metadata": {
      sendNotification({
        type: "error",
        title: "Failed to discover OAuth metadata for MCP server",
        description: `${error.message} (${values.remoteServerUrl})`,
      });
      setIsLoading(false);
      return;
    }

    case "missing_use_case": {
      sendNotification({
        type: "error",
        title: "Missing use case",
        description: error.message,
      });
      setIsLoading(false);
      return;
    }

    case "oauth_connection": {
      sendNotification({
        type: "error",
        title: authorization
          ? `Failed to connect ${OAUTH_PROVIDER_NAMES[authorization.provider]}`
          : "Failed to connect OAuth provider",
        description: error.message,
      });
      setIsLoading(false);
      return;
    }

    case "create_server": {
      sendNotification({
        type: "error",
        title: "Failed to create MCP server",
        description: error.message,
      });
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
  // RHF initializes field values from defaultValues not from the zod resolver. Zod defaults apply when the schema
  // is parsed
  const values = createMCPServerDialogFormSchema.parse({});

  if (defaultServerConfig?.url) {
    values.remoteServerUrl = defaultServerConfig.url;
  }
  if (defaultServerConfig) {
    values.authMethod = defaultServerConfig.authMethod ?? values.authMethod;
  }

  return values;
}
