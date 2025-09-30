import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";

import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import {
  diffMCPServerForm,
  getMCPServerFormDefaults,
  getMCPServerFormSchema,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { MCPServerDetailsSheet } from "@app/components/actions/mcp/MCPServerDetailsSheet";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import { isRemoteMCPServerType } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServers, useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import datadogLogger from "@app/logger/datadogLogger";
import type { WorkspaceType } from "@app/types";
import { isAdmin } from "@app/types";

interface MCPServerDetailsProps {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServerView: MCPServerViewType | null;
  isOpen: boolean;
}

export function MCPServerDetails({
  owner,
  mcpServerView,
  isOpen,
  onClose,
}: MCPServerDetailsProps) {
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: !isAdmin(owner),
  });
  const systemSpace = useMemo(
    () => spaces.find((s) => s.kind === "system"),
    [spaces]
  );
  const { mutateMCPServerViews } = useMCPServerViews({
    owner,
    space: systemSpace,
    disabled: true,
  });
  const { mutateMCPServers, mcpServers } = useMCPServers({ owner });
  const sendNotification = useSendNotification(true);

  const mcpServerWithViews = useMemo(
    () => mcpServers.find((s) => s.sId === mcpServerView?.server.sId),
    [mcpServers, mcpServerView?.server.sId]
  );

  const defaults = useMemo<MCPServerFormValues>(() => {
    if (mcpServerView) {
      return getMCPServerFormDefaults(
        mcpServerView,
        mcpServerWithViews,
        spaces
      );
    }
    return {
      name: "",
      description: "",
      toolSettings: {},
      sharingSettings: {},
    };
  }, [mcpServerView, mcpServerWithViews, spaces]);

  const form = useForm<MCPServerFormValues>({
    defaultValues: defaults,
    mode: "onChange",
    shouldUnregister: false, // Keep all fields registered even when not rendered
    resolver: mcpServerView
      ? zodResolver(getMCPServerFormSchema(mcpServerView))
      : undefined,
  });

  // Reset form when mcpServerView changes (e.g., when switching between servers)
  useEffect(() => {
    form.reset(defaults);
  }, [mcpServerView?.sId]); // Only reset when server ID changes

  const applyToolChanges = async (
    toolChanges: Array<{
      toolName: string;
      enabled: boolean;
      permission: string;
    }>
  ) => {
    for (const change of toolChanges) {
      const response = await fetch(
        `/api/w/${owner.sId}/mcp/${mcpServerView?.server.sId}/tools/${change.toolName}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            permission: change.permission,
            enabled: change.enabled,
          }),
        }
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          body.error?.message ?? "Failed to update tool settings"
        );
      }
    }
  };

  const applySharingChanges = async (
    sharingChanges: Array<{
      spaceId: string;
      action: "add" | "remove";
    }>
  ) => {
    for (const change of sharingChanges) {
      const space = spaces.find((s) => s.sId === change.spaceId);
      if (!space || space.kind === "system") {
        continue;
      }

      if (change.action === "add") {
        const response = await fetch(
          `/api/w/${owner.sId}/spaces/${space.sId}/mcp_views`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mcpServerId: mcpServerView?.server.sId,
            }),
          }
        );
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error?.message ?? "Failed to add to space");
        }
      } else {
        const view = mcpServerWithViews?.views.find(
          (v) => v.spaceId === space.sId
        );
        if (view) {
          const response = await fetch(
            `/api/w/${owner.sId}/spaces/${space.sId}/mcp_views/${view.sId}`,
            {
              method: "DELETE",
            }
          );
          if (!response.ok) {
            const body = await response.json();
            throw new Error(
              body.error?.message ?? "Failed to remove from space"
            );
          }
        }
      }
    }
  };

  const applyInfoChanges = async (diff: {
    serverView?: { name: string; description: string };
    remoteIcon?: string;
    remoteSharedSecret?: string;
    remoteCustomHeaders?: any;
  }) => {
    const hasServerViewChanges = diff.serverView !== undefined;
    const hasIconChanges = diff.remoteIcon !== undefined;
    const hasSecretChanges = diff.remoteSharedSecret !== undefined;
    const hasHeaderChanges = diff.remoteCustomHeaders !== undefined;
    const hasRemoteChanges =
      hasIconChanges || hasSecretChanges || hasHeaderChanges;

    if (!hasServerViewChanges && !hasRemoteChanges) {
      return;
    }

    // Patch the server view if needed.
    if (diff.serverView) {
      const response = await fetch(
        `/api/w/${owner.sId}/mcp/views/${mcpServerView?.sId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(diff.serverView),
        }
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message ?? "Failed to update server view");
      }
    }

    // Patch remote server settings if needed.
    if (hasRemoteChanges) {
      const patchBody: any = {};
      if (diff.remoteIcon) {
        patchBody.icon = diff.remoteIcon;
      }
      if (diff.remoteSharedSecret) {
        patchBody.sharedSecret = diff.remoteSharedSecret;
      }
      if (diff.remoteCustomHeaders !== undefined) {
        patchBody.customHeaders = diff.remoteCustomHeaders;
      }

      const response = await fetch(
        `/api/w/${owner.sId}/mcp/${mcpServerView?.server.sId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        }
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message ?? "Failed to update server");
      }
    }
  };

  const onSave = async (): Promise<boolean> => {
    if (!mcpServerView) {
      return false;
    }

    let success = false;
    await form.handleSubmit(
      async (values) => {
        try {
          // Calculate what changed.
          const diff = diffMCPServerForm(
            defaults,
            values,
            isRemoteMCPServerType(mcpServerView.server)
          );

          // Apply tool changes if any.
          if (diff.toolChanges && diff.toolChanges.length > 0) {
            await applyToolChanges(diff.toolChanges);
          }

          // Apply sharing changes if any.
          if (diff.sharingChanges && diff.sharingChanges.length > 0) {
            await applySharingChanges(diff.sharingChanges);
          }

          // Apply info changes if any.
          await applyInfoChanges(diff);

          // Revalidate caches.
          await mutateMCPServerViews();
          await mutateMCPServers();

          sendNotification({
            type: "success",
            title: `${getMcpServerDisplayName(mcpServerView.server)} updated`,
            description: "Your changes have been saved.",
          });

          // Reset form with current values to mark as clean.
          form.reset(values);
          success = true;
        } catch (error) {
          sendNotification({
            type: "error",
            title: "Failed to save changes",
            description:
              error instanceof Error
                ? error.message
                : "An error occurred while saving changes.",
          });
          datadogLogger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              serverViewId: mcpServerView.sId,
            },
            "[MCP Details] - Save error"
          );
          success = false;
        }
      },
      async (errors) => {
        // Bubble up validation errors with clear context and focus.
        const keys = Object.keys(errors);
        const firstErrorKey = keys[0] as keyof typeof errors | undefined;
        if (firstErrorKey) {
          form.setFocus(firstErrorKey as any);
        }

        // Create detailed error message
        const errorDetails = keys
          .map((key) => {
            const error = errors[key as keyof typeof errors];
            return `${key}: ${error?.message ?? "invalid"}`;
          })
          .join(", ");

        const details =
          keys.length > 0 ? `Invalid: ${errorDetails}` : undefined;
        datadogLogger.error(
          {
            fields: keys,
            errors: errors,
            values: form.getValues(),
            serverViewId: mcpServerView?.sId,
          },
          "[MCP Details] - Form validation error"
        );
        sendNotification({
          type: "error",
          title: "Validation error",
          description:
            details ?? "Please fix the highlighted fields and try again.",
        });
        success = false;
      }
    )();
    return success;
  };

  const onCancel = () => {
    form.reset(defaults);
  };

  return (
    <FormProvider form={form}>
      <MCPServerDetailsSheet
        owner={owner}
        mcpServerView={mcpServerView}
        isOpen={isOpen}
        onClose={onClose}
        onSave={onSave}
        onCancel={onCancel}
        spaces={spaces}
      />
    </FormProvider>
  );
}
