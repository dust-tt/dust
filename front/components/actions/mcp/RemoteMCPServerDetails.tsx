import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useEffect, useReducer, useRef,useState } from "react";

import { RemoteMCPForm } from "@app/components/actions/mcp/RemoteMCPForm";
import type { MCPFormAction, MCPFormState } from "@app/lib/actions/mcp";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import {
  useCreateRemoteMCPServer,
  useRemoteMCPServer,
  useSyncRemoteMCPServer,
  useUpdateRemoteMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";
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

// Extended type for remote MCP server with additional properties
type RemoteMCPServerType = MCPServerType & {
  url?: string;
  sharedSecret?: string;
  lastSyncAt?: Date | null;
};

type RemoteMCPServerDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServer: RemoteMCPServerType | null;
  open: boolean;
  mutateServers: () => void;
};

export function RemoteMCPServerDetails({
  owner,
  onClose,
  mcpServer,
  open,
  mutateServers,
}: RemoteMCPServerDetailsProps) {
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);
  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const [isSynchronized, setIsSynchronized] = useState(false);
  const [sharedSecret, setSharedSecret] = useState<string | undefined>(
    undefined
  );
  const [serverId, setServerId] = useState<string | null>(
    mcpServer?.id || null
  );

  useEffect(() => {
    console.log(open);
  }, [open]);

  // Store the current serverId in a ref so we can use it to decide whether to create a new hook
  const currentServerIdRef = useRef<string | null>(serverId);

  // Update the ref when serverId changes
  useEffect(() => {
    currentServerIdRef.current = serverId;
  }, [serverId]);

  const { createWithUrlSync } = useCreateRemoteMCPServer(owner);
  // Use the serverId from state for the hooks
  const { updateServer } = useUpdateRemoteMCPServer(owner, serverId || "");
  const { syncServer } = useSyncRemoteMCPServer(owner, serverId || "");

  // Only fetch the server data if we don't already have it from the mcpServer prop
  const { server, isServerLoading, mutateMCPServer } = useRemoteMCPServer({
    owner,
    serverId: serverId || "",
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
      case "RESET":
        return getInitialFormState();
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

    setIsSynchronized(true);

    // Update the serverId state
    setServerId(serverData.id);
  };

  // Initialize form from the mcpServer prop when available
  useEffect(() => {
    if (mcpServer) {
      populateFormFromServer(mcpServer);
    }
  }, [mcpServer]);

  // If we don't have mcpServer but have server data from the API, use it
  useEffect(() => {
    if (!mcpServer && server) {
      populateFormFromServer(server);
    }
  }, [mcpServer, server]);

  const handleSubmit = async () => {
    dispatch({ type: "VALIDATE" });
    const validation = validateFormState(formState);

    if (!validation.isValid) {
      return;
    }

    setIsSaving(true);
    try {
      const serverIdToUse = serverId;

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
        setIsSaving(false);
        return;
      }

      onClose();
      dispatch({ type: "RESET" });
      setIsSynchronized(false);
      setSharedSecret(undefined);
      setServerId(null);
    } catch (err) {
      sendNotification({
        title: "Error updating MCP server",
        type: "error",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      mutateServers();
      setIsSaving(false);
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

    setIsSynchronizing(true);
    try {
      let result;

      if (serverId && server?.url === formState.url) {
        // If we have a server ID and the URL hasn't changed, just sync
        result = await syncServer();
      } else {
        // Otherwise create a new server with this URL
        result = await createWithUrlSync(formState.url);
      }

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
    } finally {
      mutateServers();
      setIsSynchronizing(false);
    }
  };

  return (
    <Sheet
      open={open || !!mcpServer}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>
            {!serverId ? "Create MCP Server" : "Edit MCP Server"}
          </SheetTitle>
        </SheetHeader>
        <SheetContainer className="flex flex-col gap-5 pt-6 text-sm text-foreground dark:text-foreground-night">
          <RemoteMCPForm
            state={formState}
            dispatch={dispatch}
            isConfigurationLoading={isServerLoading && !mcpServer}
            onSynchronize={handleSynchronize}
            isSynchronized={isSynchronized}
            sharedSecret={sharedSecret}
            isSynchronizing={isSynchronizing}
          />
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Save",
            onClick: async (event: Event) => {
              event.preventDefault();
              if (isSynchronized || mcpServer) {
                await handleSubmit();
              } else {
                await handleSynchronize();
              }
            },
            disabled:
              isSaving ||
              isSynchronizing ||
              (!isSynchronized && !mcpServer && !serverId),
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
