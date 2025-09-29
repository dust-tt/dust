import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
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
      return getMCPServerFormDefaults(mcpServerView, mcpServerWithViews, spaces);
    }
    return {
      name: "",
      description: "",
      toolSettings: {},
      sharingSettings: {},
    };
  }, [mcpServerView, mcpServerWithViews, spaces]);

  const form = useForm<MCPServerFormValues>({
    values: defaults,
    mode: "onChange",
    shouldUnregister: true,
    resolver: mcpServerView
      ? zodResolver(getMCPServerFormSchema(mcpServerView))
      : undefined,
  });

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
            for (const change of diff.toolChanges) {
              const response = await fetch(
                `/api/w/${owner.sId}/mcp/${mcpServerView.server.sId}/tools/${change.toolName}`,
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
                  body.error?.message || "Failed to update tool settings"
                );
              }
            }
          }

          // Apply sharing changes if any.
          if (diff.sharingChanges && diff.sharingChanges.length > 0) {
            for (const change of diff.sharingChanges) {
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
                      mcpServerId: mcpServerView.server.sId,
                    }),
                  }
                );
                if (!response.ok) {
                  const body = await response.json();
                  throw new Error(
                    body.error?.message || "Failed to add to space"
                  );
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
                      body.error?.message || "Failed to remove from space"
                    );
                  }
                }
              }
            }
          }

          // Submit the info form data if changed.
          if (
            diff.serverView ||
            diff.remoteIcon ||
            diff.remoteSharedSecret ||
            diff.remoteCustomHeaders
          ) {
            // Need to submit via the existing API.
            // We need to patch the server view and/or server.
            if (diff.serverView) {
              const response = await fetch(
                `/api/w/${owner.sId}/mcp/views/${mcpServerView.sId}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(diff.serverView),
                }
              );
              if (!response.ok) {
                const body = await response.json();
                throw new Error(
                  body.error?.message || "Failed to update server view"
                );
              }
            }

            if (
              diff.remoteIcon ||
              diff.remoteSharedSecret ||
              diff.remoteCustomHeaders
            ) {
              const patchBody: any = {};
              if (diff.remoteIcon) {
                patchBody.icon = diff.remoteIcon;
              }
              if (diff.remoteSharedSecret) {
                patchBody.sharedSecret = diff.remoteSharedSecret;
              }
              if (diff.remoteCustomHeaders !== undefined) {
                patchBody.customHeaders = diff.remoteCustomHeaders
                  ? Object.fromEntries(
                      diff.remoteCustomHeaders.map((h) => [h.key, h.value])
                    )
                  : null;
              }

              const response = await fetch(
                `/api/w/${owner.sId}/mcp/${mcpServerView.server.sId}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(patchBody),
                }
              );
              if (!response.ok) {
                const body = await response.json();
                throw new Error(
                  body.error?.message || "Failed to update server"
                );
              }
            }
          }

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
        const details =
          keys.length > 0 ? `Invalid: ${keys.join(", ")}` : undefined;
        datadogLogger.error(
          {
            fields: keys,
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