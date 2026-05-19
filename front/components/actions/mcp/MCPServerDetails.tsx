import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import {
  diffMCPServerForm,
  getMCPServerFormDefaults,
  getMCPServerFormSchema,
} from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { MCPServerDetailsSheet } from "@app/components/actions/mcp/MCPServerDetailsSheet";
import { ConfirmContext } from "@app/components/Confirm";
import { useSensitivityLabelsController } from "@app/components/shared/labels/useSensitivityLabelsController";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  getMcpServerDisplayName,
  isRemoteMCPServerType,
  requiresBearerTokenConfiguration,
} from "@app/lib/actions/mcp_helper";
import { getSensitivityLabelProviderForServerId } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import {
  useMCPServer,
  useMCPServers,
  useMutateMCPServersViewsForAdmin,
} from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import datadogLogger from "@app/logger/datadogLogger";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import { zodResolver } from "@hookform/resolvers/zod";
import { useContext, useMemo } from "react";
import { useForm } from "react-hook-form";

async function patchServer(serverUrl: string, body: object) {
  const response = await clientFetch(serverUrl, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const res = await response.json();
    throw new Error(res.error?.message ?? "Failed to update server");
  }
}

interface MCPServerDetailsProps {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServerView: MCPServerViewType | null;
  isOpen: boolean;
  readOnly?: boolean;
}

export function MCPServerDetails({
  owner,
  mcpServerView,
  isOpen,
  onClose,
  readOnly = false,
}: MCPServerDetailsProps) {
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: !isOpen || !isAdmin(owner),
  });

  const { server: mcpServerWithViews, mutateMCPServer } = useMCPServer({
    owner,
    serverId: mcpServerView?.server.sId ?? "",
    disabled: !isOpen || !mcpServerView,
  });

  const { featureFlags } = useFeatureFlags();
  const hasSensitivityLabels = featureFlags.includes("sensitivity_labels");
  const sensitivityLabelProvider = getSensitivityLabelProviderForServerId(
    mcpServerView?.server.sId ?? ""
  );

  const sensitivityLabelsController = useSensitivityLabelsController({
    owner,
    source: { internalMCPServerId: mcpServerView?.server.sId ?? "" },
    disabled:
      !isOpen ||
      !mcpServerView ||
      sensitivityLabelProvider === null ||
      !hasSensitivityLabels,
  });

  const { mcpServers } = useMCPServers({
    owner,
    disabled: !isOpen || readOnly,
  });

  // Collect all effective view names from other servers (excluding the current one).
  const existingViewNames = useMemo(
    () =>
      mcpServers
        .filter((s) => s.sId !== mcpServerView?.server.sId)
        .flatMap((s) => (s.views ?? []).map((v) => v.name ?? v.server.name)),
    [mcpServers, mcpServerView]
  );
  const { mutate: mutateMCPServersViewsForAdmin } =
    useMutateMCPServersViewsForAdmin(owner);
  const sendNotification = useSendNotification(true);
  const confirm = useContext(ConfirmContext);

  const defaults = useMemo<MCPServerFormValues>(() => {
    if (mcpServerView) {
      return getMCPServerFormDefaults(
        mcpServerView,
        mcpServerWithViews ?? undefined,
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
    values: defaults,
    mode: "onChange",
    shouldUnregister: false, // Keep all fields registered even when not rendered
    resetOptions: {
      keepDirtyValues: true, // Preserve user edits on SWR refetch.
    },
    resolver: mcpServerView
      ? zodResolver(
          getMCPServerFormSchema(mcpServerView, {
            existingViewNames,
            initialName: mcpServerView.name ?? mcpServerView.server.name,
          })
        )
      : undefined,
  });

  const applyToolChanges = async (
    toolChanges: Array<{
      toolName: string;
      enabled: boolean;
      permission: string;
    }>
  ) => {
    for (const change of toolChanges) {
      const response = await clientFetch(
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
        const response = await clientFetch(
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
          const response = await clientFetch(
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
    icon?: string;
    authSharedSecret?: string;
    authCustomHeaders?: any;
    authMeta?: Record<string, string> | null;
  }) => {
    const hasServerViewChanges = diff.serverView !== undefined;
    const hasIconChanges = diff.icon !== undefined;
    const hasSecretChanges = diff.authSharedSecret !== undefined;
    const hasHeaderChanges = diff.authCustomHeaders !== undefined;
    const hasMetaChanges = diff.authMeta !== undefined;
    const hasRemoteChanges =
      hasIconChanges || hasSecretChanges || hasHeaderChanges || hasMetaChanges;

    if (!hasServerViewChanges && !hasRemoteChanges) {
      return;
    }

    // Patch the server view if needed.
    if (diff.serverView) {
      const response = await clientFetch(
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

    // Patch remote server settings if needed. icon and meta use separate
    // requests because they are distinct discriminants in the API schema.
    // sharedSecret and customHeaders can be combined in one request.
    const serverUrl = `/api/w/${owner.sId}/mcp/${mcpServerView?.server.sId}`;

    if (hasIconChanges) {
      await patchServer(serverUrl, { icon: diff.icon });
    }
    if (hasSecretChanges || hasHeaderChanges) {
      await patchServer(serverUrl, {
        ...(hasSecretChanges && { sharedSecret: diff.authSharedSecret }),
        ...(hasHeaderChanges && { customHeaders: diff.authCustomHeaders }),
      });
    }
    if (hasMetaChanges) {
      await patchServer(serverUrl, { meta: diff.authMeta });
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
          const diff = diffMCPServerForm(defaults, values, {
            isRemote: isRemoteMCPServerType(mcpServerView.server),
            requiresBearerToken: requiresBearerTokenConfiguration(
              mcpServerView.server
            ),
          });

          // Promoting to the global space hard-deletes any regular-space
          // copies of this tool. Require confirmation before mutating when
          // that's about to happen, naming the spaces that will lose their
          // copy.
          const isPromotingToGlobal = diff.sharingChanges?.some((change) => {
            if (change.action !== "add") {
              return false;
            }
            const space = spaces.find((s) => s.sId === change.spaceId);
            return space?.kind === "global";
          });
          const affectedSpaceNames = (mcpServerWithViews?.views ?? []).flatMap(
            (view) => {
              const space = spaces.find((s) => s.sId === view.spaceId);
              return space?.kind === "regular" ? [space.name] : [];
            }
          );
          if (isPromotingToGlobal && affectedSpaceNames.length > 0) {
            const confirmed = await confirm({
              title: "This action will delete the tool's existing copies",
              message: (
                <>
                  <div>
                    Making the tool available to all will delete its copies in
                    these spaces:
                  </div>
                  <ul className="list-disc pl-6">
                    {affectedSpaceNames.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                  <div>
                    Any agents using the tool there will lose access until an
                    admin manually re-adds the shared version to each one. If
                    any agents are affected, you'll receive an email listing
                    them.
                  </div>
                </>
              ),
              validateLabel: "Continue anyway",
              validateVariant: "warning",
            });
            if (!confirmed) {
              form.setValue("sharingSettings", defaults.sharingSettings, {
                shouldDirty: false,
                shouldTouch: false,
              });
              success = false;
              return;
            }
          }

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

          // Save sensitivity labels if dirty (manages its own error notification).
          await sensitivityLabelsController.save();

          // Revalidate caches.
          await mutateMCPServersViewsForAdmin();
          await mutateMCPServer();

          sendNotification({
            type: "success",
            title: `${diff.serverView?.name ?? getMcpServerDisplayName(mcpServerView.server)} updated`,
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
    sensitivityLabelsController.reset();
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
        readOnly={readOnly}
        sensitivityLabelsController={sensitivityLabelsController}
      />
    </FormProvider>
  );
}
