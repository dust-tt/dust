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
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import {
  getMcpServerViewDisplayName,
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
  useMCPServersUsage,
  useMutateMCPServersViewsForAdmin,
  useUpdateMCPToolsSettings,
} from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import datadogLogger from "@app/logger/datadogLogger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  hasRedactedHeaderValue,
  REDACTED_HEADER_VALUES_ERROR_MESSAGE,
} from "@app/types/shared/utils/http_headers";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import { Avatar, buttonVariants, Icon, LinkExternal01 } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trans, useLingui } from "@lingui/react/macro";
import { useContext, useMemo } from "react";
import { useForm } from "react-hook-form";

async function patchServer(serverUrl: string, body: object) {
  const response = await clientFetch(serverUrl, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await getErrorFromResponse(response);
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
  const { t } = useLingui();
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: !isOpen || !isAdmin(owner),
  });

  const { server: mcpServerWithViews, mutateMCPServer } = useMCPServer({
    owner,
    serverId: mcpServerView?.server.sId ?? "",
    disabled: !isOpen || !mcpServerView || readOnly,
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
    // This sheet opens from AdminActionsList, whose useMCPServers call uses the same
    // workspace-derived SWR key. Listing every MCP server is expensive, so reuse that
    // cached response. SWR still fetches normally if the cache is unexpectedly empty.
    revalidateIfStale: false,
  });
  const { usage, mutate: mutateMCPServersUsage } = useMCPServersUsage({
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
  const { updateMCPToolsSettings } = useUpdateMCPToolsSettings({
    owner,
    serverId: mcpServerView?.server.sId ?? "",
  });
  const sendNotification = useSendNotification(true);
  const sendApiErrorNotification = useSendApiErrorNotification();
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
      isRestrictedToSkills: false,
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
          getMCPServerFormSchema(mcpServerView, t, {
            existingViewNames,
            initialName: mcpServerView.name ?? mcpServerView.server.name,
          })
        )
      : undefined,
  });

  const confirmSkillsRestrictionChange = async (
    isRestrictedToSkills: boolean
  ): Promise<boolean> => {
    if (!isRestrictedToSkills || !mcpServerView) {
      return true;
    }

    const affectedAgents = usage?.[mcpServerView.server.sId]?.agents ?? [];
    if (affectedAgents.length === 0) {
      return true;
    }

    return confirm({
      title: t`Remove this tool from agents?`,
      message: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <Trans>
              Saving will remove the tool from the following agents:
            </Trans>
          </p>
          <div className="divide-y divide-separator overflow-hidden rounded-xl border border-separator bg-background">
            {affectedAgents.map((agent) => {
              const agentName = agent.name;
              return (
                <div
                  key={agent.sId}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <Avatar size="xs" visual={agent.pictureUrl} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {agent.name}
                  </span>
                  <a
                    href={getAgentBuilderRoute(owner.sId, agent.sId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t`Open ${agentName} in Agent Builder`}
                    className={buttonVariants({
                      variant: "ghost-secondary",
                      size: "xs",
                      isIconOnly: true,
                    })}
                  >
                    <Icon visual={LinkExternal01} size="xs" />
                  </a>
                </div>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            <Trans>Skills using this tool will not be affected.</Trans>
          </p>
        </div>
      ),
      validateLabel: t`Continue`,
      validateVariant: "warning",
    });
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
          throw await getErrorFromResponse(response);
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
            throw await getErrorFromResponse(response);
          }
        }
      }
    }
  };

  const applyInfoChanges = async (diff: {
    serverView?: { name: string; description: string };
    isRestrictedToSkills?: boolean;
    icon?: string;
    authSharedSecret?: string;
    authCustomHeaders?: any;
    authMeta?: Record<string, string> | null;
  }) => {
    const hasServerViewChanges = diff.serverView !== undefined;
    const hasSkillsOnlyChanges = diff.isRestrictedToSkills !== undefined;
    const hasIconChanges = diff.icon !== undefined;
    const hasSecretChanges = diff.authSharedSecret !== undefined;
    const hasHeaderChanges = diff.authCustomHeaders !== undefined;
    const hasMetaChanges = diff.authMeta !== undefined;
    const hasRemoteChanges =
      hasIconChanges || hasSecretChanges || hasHeaderChanges || hasMetaChanges;

    if (!hasServerViewChanges && !hasSkillsOnlyChanges && !hasRemoteChanges) {
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
        throw await getErrorFromResponse(response);
      }
    }

    if (hasSkillsOnlyChanges) {
      const response = await clientFetch(
        `/api/w/${owner.sId}/mcp/views/${mcpServerView?.sId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isRestrictedToSkills: diff.isRestrictedToSkills,
          }),
        }
      );
      if (!response.ok) {
        throw await getErrorFromResponse(response);
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

          // Checked before any mutation so a rejected header update leaves nothing half-saved.
          if (
            diff.authCustomHeaders &&
            hasRedactedHeaderValue(diff.authCustomHeaders)
          ) {
            sendNotification({
              type: "error",
              title: t`Failed to save changes`,
              description: REDACTED_HEADER_VALUES_ERROR_MESSAGE,
            });
            success = false;
            return;
          }

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
              title: t`This action will delete the tool's existing copies`,
              message: (
                <>
                  <div>
                    <Trans>
                      Making the tool available to all will delete its copies in
                      these spaces:
                    </Trans>
                  </div>
                  <ul className="list-disc pl-6">
                    {affectedSpaceNames.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                  <div>
                    <Trans>
                      Any agents using the tool there will lose access until an
                      admin manually re-adds the shared version to each one. If
                      any agents are affected, you'll receive an email listing
                      them.
                    </Trans>
                  </div>
                </>
              ),
              validateLabel: t`Continue anyway`,
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
            const updateResult = await updateMCPToolsSettings(diff.toolChanges);
            if (updateResult.isErr()) {
              datadogLogger.error(
                {
                  error: updateResult.error.message,
                  serverViewId: mcpServerView.sId,
                },
                "[MCP Details] - Tool settings update error"
              );
              success = false;
              return;
            }
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
          await mutateMCPServersUsage();

          const serverName =
            diff.serverView?.name ?? getMcpServerViewDisplayName(mcpServerView);
          sendNotification({
            type: "success",
            title: t`${serverName} updated`,
            description: t`Your changes have been saved.`,
          });

          // Reset form with current values to mark as clean.
          form.reset(values);
          success = true;
        } catch (error) {
          sendApiErrorNotification({
            title: t`Failed to save changes`,
            error,
          });
          datadogLogger.error(
            {
              error: normalizeError(error).message,
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
            details,
            serverViewId: mcpServerView?.sId,
          },
          "[MCP Details] - Form validation error"
        );
        sendNotification({
          type: "error",
          title: t`Validation error`,
          description:
            keys.length > 0
              ? t`Invalid: ${errorDetails}`
              : t`Please fix the highlighted fields and try again.`,
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
    <FormProvider form={form} asForm={false}>
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
        confirmSkillsRestrictionChange={confirmSkillsRestrictionChange}
      />
    </FormProvider>
  );
}
