import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import type { InfoFormValues } from "@app/components/actions/mcp/forms/infoFormSchema";
import {
  getInfoFormDefaults,
  getInfoFormSchema,
} from "@app/components/actions/mcp/forms/infoFormSchema";
import {
  getSuccessTitle,
  submitMCPServerDetailsForm,
} from "@app/components/actions/mcp/forms/submitMCPServerDetailsForm";
import type { SharingChange } from "@app/components/actions/mcp/MCPServerDetailsSharing";
import type { TabType } from "@app/components/actions/mcp/MCPServerDetailsSheet";
import { MCPServerDetailsSheet } from "@app/components/actions/mcp/MCPServerDetailsSheet";
import type { ToolChange } from "@app/components/actions/mcp/ToolsList";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  useAddMCPServerToSpace,
  useMCPServers,
  useMCPServerViews,
  useRemoveMCPServerViewFromSpace,
} from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import datadogLogger from "@app/logger/datadogLogger";
import type { WorkspaceType } from "@app/types";
import { isAdmin, sanitizeHeadersArray } from "@app/types";

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
  const { addToSpace } = useAddMCPServerToSpace(owner, {
    skipNotification: true,
  });
  const { removeFromSpace } = useRemoveMCPServerViewFromSpace(owner, {
    skipNotification: true,
  });
  const [pendingSharingChanges, setPendingSharingChanges] = useState<
    SharingChange[]
  >([]);
  const [pendingToolChanges, setPendingToolChanges] = useState<ToolChange[]>(
    []
  );

  const defaults = useMemo<InfoFormValues>(() => {
    if (mcpServerView) {
      return getInfoFormDefaults(mcpServerView);
    }
    return { name: "", description: "" };
  }, [mcpServerView]);

  const form = useForm<InfoFormValues>({
    values: defaults,
    mode: "onChange",
    shouldUnregister: true,
    resolver: mcpServerView
      ? zodResolver(getInfoFormSchema(mcpServerView))
      : undefined,
  });

  const onSave = async (selectedTab: TabType): Promise<boolean> => {
    if (!mcpServerView) {
      return false;
    }

    const mutateCaches = async () => {
      await mutateMCPServerViews();
      await mutateMCPServers();
    };

    // If we're on the sharing tab and only have sharing changes, skip form validation.
    if (selectedTab === "sharing" && !form.formState.isDirty && pendingToolChanges.length === 0) {
      let success = true;

      // Apply pending sharing changes only.
      try {
        const mcpServerWithViews = mcpServers.find(
          (s) => s.sId === mcpServerView.server.sId
        );

        for (const change of pendingSharingChanges) {
          const space = spaces.find((s) => s.sId === change.spaceId);
          if (!space) {
            continue;
          }

          if (change.action === "add") {
            await addToSpace(mcpServerView.server, space);
          } else {
            const view = mcpServerWithViews?.views.find(
              (v) => v.spaceId === space.sId
            );
            if (view) {
              await removeFromSpace(view, space);
            }
          }
        }

        await mutateCaches();

        sendNotification({
          type: "success",
          title: getSuccessTitle(mcpServerView),
          description: "Sharing settings have been updated.",
        });
        setPendingSharingChanges([]);
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to update sharing settings",
          description:
            error instanceof Error
              ? error.message
              : "An error occurred while updating sharing settings.",
        });
        success = false;
      }

      return success;
    }

    // Otherwise, validate and save everything.
    let success = false;
    await form.handleSubmit(
      async (values) => {
        // Apply pending tool changes first.
        if (pendingToolChanges.length > 0) {
          try {
            // Make API calls directly to update tool settings without notifications.
            for (const change of pendingToolChanges) {
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
          } catch (error) {
            sendNotification({
              type: "error",
              title: "Failed to update tool settings",
              description:
                error instanceof Error
                  ? error.message
                  : "An error occurred while updating tool settings.",
            });
            success = false;
            return;
          }
        }

        // Apply pending sharing changes.
        try {
          const mcpServerWithViews = mcpServers.find(
            (s) => s.sId === mcpServerView.server.sId
          );

          for (const change of pendingSharingChanges) {
            const space = spaces.find((s) => s.sId === change.spaceId);
            if (!space) {
              continue;
            }

            if (change.action === "add") {
              await addToSpace(mcpServerView.server, space);
            } else {
              const view = mcpServerWithViews?.views.find(
                (v) => v.spaceId === space.sId
              );
              if (view) {
                await removeFromSpace(view, space);
              }
            }
          }
        } catch (error) {
          sendNotification({
            type: "error",
            title: "Failed to update sharing settings",
            description:
              error instanceof Error
                ? error.message
                : "An error occurred while updating sharing settings.",
          });
          success = false;
          return;
        }

        const result = await submitMCPServerDetailsForm({
          owner,
          mcpServerView,
          initialValues: defaults,
          values,
          mutate: mutateCaches,
        });

        if (result.isOk()) {
          // Only show success notification once after all changes are saved.
          sendNotification({
            type: "success",
            title: getSuccessTitle(mcpServerView),
            description: "Your changes have been saved.",
          });
          // Normalize values before resetting so the form is clean.
          const normalizedValues: InfoFormValues = {
            ...values,
            // Ensure headers are sanitized so defaults match saved state.
            customHeaders: sanitizeHeadersArray(values.customHeaders ?? []),
          };
          form.reset(normalizedValues);
          // Clear pending changes after successful save.
          setPendingSharingChanges([]);
          setPendingToolChanges([]);
          success = true;
        } else {
          sendNotification({
            type: "error",
            title: "Save failed",
            description: result.error.message,
          });
          datadogLogger.error(
            {
              errorMessage: result.error.message,
              serverViewId: mcpServerView.sId,
            },
            "[MCP Details] - Submit error"
          );
          success = false;
        }
      },
      async (errors) => {
        // Bubble up validation errors with clear context and focus
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
    setPendingSharingChanges([]);
    setPendingToolChanges([]);
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
        pendingSharingChanges={pendingSharingChanges}
        onPendingSharingChangesUpdate={setPendingSharingChanges}
        pendingToolChanges={pendingToolChanges}
        onPendingToolChangesUpdate={setPendingToolChanges}
      />
    </FormProvider>
  );
}
