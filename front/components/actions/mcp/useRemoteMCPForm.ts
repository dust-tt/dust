import { useSendNotification } from "@dust-tt/sparkle";
import { useEffect, useReducer, useState } from "react";

import type { MCPFormAction, MCPFormState } from "@app/lib/actions/mcp";
import type { RemoteMCPServerType } from "@app/lib/actions/mcp_metadata";
import {
  useMCPServers,
  useRemoteMCPServer,
  useSyncRemoteMCPServer,
  useUpdateRemoteMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";
import { validateUrl } from "@app/types";

function getInitialFormState(): MCPFormState {
  return {
    url: "",
    name: "",
    description: "",
    tools: [],
    errors: {},
  };
}

type ValidationResult = {
  isValid: boolean;
  errors: MCPFormState["errors"];
};

function validateFormState(state: MCPFormState): ValidationResult {
  const urlValidation = validateUrl(state.url);
  const errors: MCPFormState["errors"] = {
    url: !urlValidation.valid
      ? "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c))."
      : undefined,
    name: !state.name ? "Name is required" : undefined,
  };
  return { isValid: urlValidation.valid && !!state.name, errors };
}

export const useRemoteMCPForm = (
  owner: LightWorkspaceType,
  mcpServer: RemoteMCPServerType
) => {
  const sendNotification = useSendNotification();
  const [serverState, setServerState] = useState<
    "idle" | "saving" | "synchronizing"
  >("idle");
  const [sharedSecret, setSharedSecret] = useState<string | undefined>(
    undefined
  );

  const { mutateMCPServers } = useMCPServers({
    owner,
    disabled: true,
  });

  // Use the serverId from state for the hooks
  const { updateServer } = useUpdateRemoteMCPServer(owner, mcpServer.id);
  const { syncServer } = useSyncRemoteMCPServer(owner, mcpServer.id);

  //   // Only fetch the server data if we don't already have it from the mcpServer prop
  const { mutateMCPServer } = useRemoteMCPServer({
    owner,
    serverId: mcpServer?.id || "",
    disabled: !mcpServer,
  });

  const formReducer = (
    state: MCPFormState,
    action: MCPFormAction
  ): MCPFormState => {
    switch (action.type) {
      case "SET_FIELD": {
        const newState = { ...state, [action.field]: action.value };
        if (action.field === "url") {
          validateUrl(action.value);
        }
        return newState;
      }
      case "SET_ERROR":
        return {
          ...state,
          errors: { ...state.errors, [action.field]: action.value },
        };
      case "VALIDATE": {
        const result = validateFormState(state);
        return { ...state, errors: result.errors };
      }
      default:
        return state;
    }
  };

  const [formState, dispatch] = useReducer(formReducer, getInitialFormState());

  // Helper function to populate form from server data
  const populateFormFromServer = (serverData: RemoteMCPServerType) => {
    dispatch({ type: "SET_FIELD", field: "name", value: serverData.name });
    dispatch({
      type: "SET_FIELD",
      field: "description",
      value: serverData.description || "",
    });
    dispatch({ type: "SET_FIELD", field: "tools", value: serverData.tools });

    if (serverData.url) {
      dispatch({ type: "SET_FIELD", field: "url", value: serverData.url });
    }

    if (serverData.sharedSecret) {
      setSharedSecret(serverData.sharedSecret);
    }

    setServerState("idle");
  };

  // Initialize form from the mcpServer prop when available
  useEffect(() => {
    if (mcpServer) {
      populateFormFromServer(mcpServer);
    }
  }, [mcpServer]);

  const handleSubmit = async () => {
    dispatch({ type: "VALIDATE" });
    const validation = validateFormState(formState);

    if (!validation.isValid) {
      return;
    }

    setServerState("saving");
    try {
      const serverIdToUse = mcpServer?.id;

      if (serverIdToUse) {
        await updateServer({
          name: formState.name,
          url: formState.url,
          description: formState.description,
          tools: formState.tools,
        });

        await mutateMCPServer();

        sendNotification({
          title: "MCP server updated",
          type: "success",
          description: "The MCP server has been successfully updated.",
        });
      } else {
        sendNotification({
          title: "Error saving MCP server",
          type: "error",
          description: "Missing MCP server ID. Please try synchronizing again.",
        });
      }
    } catch (err) {
      sendNotification({
        title: "Error updating MCP server",
        type: "error",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      void mutateMCPServers();
      setServerState("idle");
    }
  };

  const handleSynchronize = async () => {
    if (!formState.url) {
      sendNotification({
        title: "Error",
        type: "error",
        description: "Please enter a valid URL before synchronizing.",
      });
      return;
    }

    setServerState("synchronizing");
    try {
      if (!mcpServer.url) {
        return;
      }
      // If we have a server ID and the URL hasn't changed, just sync
      const result = await syncServer();

      if (result.success) {
        // Populate the form with the server data returned from the API
        populateFormFromServer(result.server);

        sendNotification({
          title: "Success",
          type: "success",
          description: "MCP server synchronized successfully.",
        });
      } else {
        throw new Error("Failed to synchronize MCP server");
      }
    } catch (error) {
      sendNotification({
        title: "Error synchronizing MCP server",
        type: "error",
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
      setServerState("idle");
    } finally {
      void mutateMCPServers();
    }
  };

  return {
    formState,
    dispatch,
    serverState,
    sharedSecret,
    handleSubmit,
    handleSynchronize,
  };
};
