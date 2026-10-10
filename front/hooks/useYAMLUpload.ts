import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";

interface UseYAMLUploadOptions {
  owner: LightWorkspaceType;
}

export function useYAMLUpload({ owner }: UseYAMLUploadOptions) {
  const { t } = useLingui();
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const [isUploading, setIsUploading] = useState(false);

  const uploadYAMLFile = useCallback(
    async (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) {
        return;
      }

      if (!file.name.endsWith(".yaml") && !file.name.endsWith(".yml")) {
        sendNotification({
          title: t`Invalid file type`,
          description: t`Select a YAML file (.yaml or .yml).`,
          type: "error",
        });
        return;
      }

      setIsUploading(true);
      try {
        const yamlContent = await file.text();
        const response = await clientFetch(
          `/api/w/${owner.sId}/assistant/agent_configurations/new/yaml`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ yamlContent }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          logger.error(
            {
              workspaceId: owner.sId,
            },

            normalizeError(errorData).message ||
              "Failed to create agent from YAML file."
          );

          sendApiErrorNotification({
            title: t`Agent creation failed`,
            error: errorData,
          });
          return;
        }

        const result = await response.json();
        const agentName = result.agentConfiguration.name;

        trackEvent({
          area: TRACKING_AREAS.BUILDER,
          object: "create_agent",
          action: TRACKING_ACTIONS.SUBMIT,
          extra: {
            agent_id: result.agentConfiguration.sId,
            source: "yaml_upload",
            scope: result.agentConfiguration.scope,
            has_skipped_actions: result.skippedActions?.length > 0,
          },
        });

        if (result.skippedActions && result.skippedActions.length > 0) {
          sendNotification({
            title: t`Agent created with warnings`,
            description: t`Agent "${agentName}" was created, but some actions were skipped.`,
            type: "info",
          });

          for (const skipped of result.skippedActions) {
            const actionName = skipped.name;
            sendNotification({
              title: t`Action skipped: ${actionName}`,
              description: skipped.reason,
              type: "info",
            });
          }
        } else {
          sendNotification({
            title: t`Agent created successfully`,
            description: t`Agent "${agentName}" was created from YAML.`,
            type: "success",
          });
        }

        await router.push(
          `/w/${owner.sId}/builder/agents/${result.agentConfiguration.sId}`
        );
      } catch (error) {
        sendApiErrorNotification({
          title: t`Agent creation failed`,
          error,
        });
      } finally {
        setIsUploading(false);
      }
    },
    [owner.sId, router, sendApiErrorNotification, sendNotification, t]
  );

  const triggerYAMLUpload = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".yaml,.yml";
    input.onchange = uploadYAMLFile;
    input.click();
  }, [uploadYAMLFile]);

  return {
    isUploading,
    uploadYAMLFile,
    triggerYAMLUpload,
  };
}
