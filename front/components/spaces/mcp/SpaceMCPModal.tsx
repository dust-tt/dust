import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useEffect, useReducer, useState } from "react";

import { SpaceMCPForm } from "@app/components/spaces/mcp/SpaceMCPForm";
import {
  useRemoteMCPServer,
  useSyncRemoteMCPServer,
  useUpdateRemoteMCPServer,
} from "@app/lib/swr/remote_mcp_servers";
import type { SpaceType, WorkspaceType } from "@app/types";
import { validateUrl } from "@app/types";
import type { MCPApiResponse } from "@app/types/mcp";
import type { MCPFormAction, MCPFormState } from "@app/types/mcp";

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

export interface SpaceMCPModalProps {
  serverId?: string;
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  space: SpaceType;
  canWriteInSpace: boolean;
  onSave: () => Promise<void>;
}

export default function SpaceMCPModal({
  serverId,
  isOpen,
  onClose,
  owner,
  space,
  canWriteInSpace,
  onSave,
}: SpaceMCPModalProps) {
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);
  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const [isSynchronized, setIsSynchronized] = useState(false);
  const [sharedSecret, setSharedSecret] = useState<string | undefined>(
    undefined
  );
  const [mcpServerId, setMcpServerId] = useState<string | undefined>(undefined);

  const { server, isServerLoading, mutateServer } = useRemoteMCPServer({
    owner,
    space,
    serverId: serverId || "",
    disabled: !serverId,
  });

  const { updateServer } = useUpdateRemoteMCPServer();
  const { syncById, syncByUrl } = useSyncRemoteMCPServer();

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

  useEffect(() => {
    if (server) {
      dispatch({ type: "SET_FIELD", field: "name", value: server.name });
      dispatch({
        type: "SET_FIELD",
        field: "description",
        value: server.description,
      });
      dispatch({ type: "SET_FIELD", field: "url", value: server.url || "" });
      dispatch({ type: "SET_FIELD", field: "tools", value: server.tools });

      if (server.sharedSecret) {
        setSharedSecret(server.sharedSecret);
      }

      setIsSynchronized(true);
      setMcpServerId(server.id);
    }
  }, [server]);

  const handleSubmit = async () => {
    dispatch({ type: "VALIDATE" });
    const validation = validateFormState(formState);

    if (!validation.isValid) {
      return;
    }

    setIsSaving(true);
    try {
      const serverIdToUse = serverId || mcpServerId;

      if (serverIdToUse) {
        await updateServer(owner, space, serverIdToUse, {
          name: formState.name,
          url: formState.url,
          description: formState.description,
          tools: formState.tools,
        });

        if (serverId) {
          await mutateServer();
        }

        sendNotification({
          title: "MCP updated",
          type: "success",
          description: "The MCP has been successfully updated.",
        });
      } else {
        sendNotification({
          title: "Error saving MCP",
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
      setMcpServerId(undefined);

      await onSave();
    } catch (err) {
      sendNotification({
        title: "Error updating MCP",
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
      const serverIdToUse = serverId || mcpServerId;
      let result: MCPApiResponse;

      if (serverIdToUse && server?.url === formState.url) {
        result = await syncById(owner, space, serverIdToUse);
      } else {
        result = await syncByUrl(owner, space, formState.url);
      }

      if (result.success && result.data) {
        dispatch({ type: "SET_FIELD", field: "name", value: result.data.name });
        dispatch({
          type: "SET_FIELD",
          field: "description",
          value: result.data.description,
        });
        dispatch({
          type: "SET_FIELD",
          field: "tools",
          value: result.data.tools,
        });

        setSharedSecret(result.data.sharedSecret);
        setMcpServerId(result.data.id);

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
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>
            {serverId ? "Edit MCP Server" : "Create MCP Server"}
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <SpaceMCPForm
            state={formState}
            dispatch={dispatch}
            isConfigurationLoading={isServerLoading}
            onSynchronize={handleSynchronize}
            isSynchronized={isSynchronized || !!serverId}
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
              if (isSynchronized || serverId) {
                await handleSubmit();
              } else {
                await handleSynchronize();
              }
            },
            disabled:
              !canWriteInSpace ||
              isSaving ||
              isSynchronizing ||
              (!isSynchronized && !serverId),
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
