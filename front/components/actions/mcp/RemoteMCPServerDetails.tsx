import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useEffect, useReducer,useState } from "react";

import { RemoteMCPForm } from "@app/components/actions/mcp/RemoteMCPForm";
import type { MCPFormAction,MCPFormState } from "@app/lib/actions/mcp";
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

function validateFormState(state: MCPFormState): {
  isValid: boolean;
  errors: MCPFormState["errors"];
} {
  const urlValidation = validateUrl(state.url);
  const errors: MCPFormState["errors"] = {
    url: !urlValidation.valid
      ? "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c))."
      : undefined,
    name: !state.name ? "Name is required" : undefined,
  };
  return { isValid: urlValidation.valid && !!state.name, errors };
}

type RemoteMCPServerDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServer: MCPServerType | null;
  onSave?: () => Promise<void>;
  mutateServers?: () => void;
};

export function RemoteMCPServerDetails({
  owner,
  onClose,
  mcpServer,
  onSave = async () => {},
  mutateServers,
}: RemoteMCPServerDetailsProps) {
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);
  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const [isSynchronized, setIsSynchronized] = useState(false);
  const [sharedSecret, setSharedSecret] = useState<string | undefined>(
    undefined
  );

  const { createWithUrlSync } = useCreateRemoteMCPServer(owner);
  const { updateServer } = useUpdateRemoteMCPServer(owner, mcpServer?.id || "");
  const { syncServer } = useSyncRemoteMCPServer(owner, mcpServer?.id || "");
  const { server, isServerLoading } = useRemoteMCPServer({
    owner,
    serverId: mcpServer?.id || "",
  });

  const isNewServer = mcpServer && mcpServer?.id === "new";

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

  // Initialize form with server data if provided
  useEffect(() => {
    if (isNewServer) {
      dispatch({ type: "RESET" });
      setIsSynchronized(false);
      return;
    }

    if (server) {
      // For existing servers, populate the form with server data
      dispatch({ type: "SET_FIELD", field: "name", value: server.name });
      dispatch({
        type: "SET_FIELD",
        field: "description",
        value: server.description,
      });
      dispatch({ type: "SET_FIELD", field: "tools", value: server.tools });
      dispatch({ type: "SET_FIELD", field: "url", value: server.url });

      setSharedSecret(server.sharedSecret);
      setIsSynchronized(true);
    }
  }, [mcpServer, server, isServerLoading]);

  const handleSubmit = async () => {
    dispatch({ type: "VALIDATE" });
    const validation = validateFormState(formState);

    if (!validation.isValid) {
      return;
    }

    setIsSaving(true);
    try {
      if (mcpServer && !isNewServer) {
        await updateServer({
          name: formState.name,
          url: formState.url,
          description: formState.description,
          tools: formState.tools,
        });

        sendNotification({
          title: "MCP server updated",
          type: "success",
          description: "The MCP server has been successfully updated.",
        });
      }

      onClose();
      dispatch({ type: "RESET" });
      setIsSynchronized(false);
      setSharedSecret(undefined);

      mutateServers && mutateServers();
      await onSave();
    } catch (err) {
      sendNotification({
        title: "Error updating MCP server",
        type: "error",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
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

      if (mcpServer && mcpServer.id !== "new") {
        result = await syncServer();
      } else {
        result = await createWithUrlSync(formState.url);
      }

      if (result.success) {
        dispatch({
          type: "SET_FIELD",
          field: "name",
          value: result.server.name,
        });
        dispatch({
          type: "SET_FIELD",
          field: "description",
          value: result.server.description,
        });
        dispatch({
          type: "SET_FIELD",
          field: "tools",
          value: result.server.tools,
        });

        setIsSynchronized(true);
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
      setIsSynchronizing(false);
    }
  };

  return (
    <Sheet open={!!mcpServer} onOpenChange={onClose}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>
            {isNewServer ? "Create MCP Server" : "Edit MCP Server"}
          </SheetTitle>
        </SheetHeader>
        <SheetContainer className="flex flex-col gap-5 pt-6 text-sm text-foreground dark:text-foreground-night">
          <RemoteMCPForm
            state={formState}
            dispatch={dispatch}
            isConfigurationLoading={isServerLoading}
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
              if (isSynchronized || isNewServer) {
                await handleSubmit();
              } else {
                await handleSynchronize();
              }
            },
            disabled:
              isSaving ||
              isSynchronizing ||
              (!isSynchronized && (!mcpServer || isNewServer)),
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
