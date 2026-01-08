import type { UseFormReturn } from "react-hook-form";

import { CreateMCPServerDialogSubmitError } from "@app/components/actions/mcp/submitCreateMCPServerDialogForm";
import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/types";
import { OAUTH_PROVIDER_NAMES } from "@app/types";

export function handleCreateMCPServerDialogSubmitError({
  error,
  values,
  authorization,
  form,
  sendNotification,
  setRemoteMCPServerOAuthDiscoveryDone,
  setExternalIsLoading,
  setIsLoading,
}: {
  error: Error;
  values: CreateMCPServerDialogFormValues;
  authorization: { provider: keyof typeof OAUTH_PROVIDER_NAMES } | null;
  form: UseFormReturn<CreateMCPServerDialogFormValues>;
  sendNotification: (args: {
    type: "error";
    title: string;
    description: string;
  }) => void;
  setRemoteMCPServerOAuthDiscoveryDone: (done: boolean) => void;
  setExternalIsLoading: (isLoading: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
}) {
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
    case "invalid_url": {
      form.setError("remoteServerUrl", {
        type: "manual",
        message: error.message,
      });
      setIsLoading(false);
      return;
    }

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
