import { useSendNotification } from "@app/hooks/useNotification";
import { useAppRouter } from "@app/lib/platform";
import { useFetcher } from "@app/lib/swr/swr";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import logger from "@app/logger/logger";
import { isAPIErrorResponse } from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

interface UseYAMLUploadOptions {
  owner: LightWorkspaceType;
}

export function useYAMLUpload({ owner }: UseYAMLUploadOptions) {
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();
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
          title: "Invalid file type",
          description: "Please select a YAML file (.yaml or .yml)",
          type: "error",
        });
        return;
      }

      setIsUploading(true);
      const yamlContent = await file.text();

      let result: {
        agentConfiguration: { sId: string; name: string; scope: string };
        skippedActions?: { name: string; reason: string }[];
      };

      try {
        result = await fetcherWithBody([
          `/api/w/${owner.sId}/assistant/agent_configurations/new/yaml`,
          { yamlContent },
          "POST",
        ]);
      } catch (e) {
        if (isAPIErrorResponse(e)) {
          logger.error(
            {
              workspaceId: owner.sId,
            },
            e.error.message || "Failed to create agent from YAML file."
          );

          sendNotification({
            title: "Agent creation failed",
            description:
              e.error.message ||
              "An error occurred while creating the agent from YAML",
            type: "error",
          });
        } else {
          logger.error(
            {
              workspaceId: owner.sId,
            },
            normalizeError(e).message ||
              "Failed to create agent from YAML file."
          );

          sendNotification({
            title: "Agent creation failed",
            description: "An error occurred while creating the agent from YAML",
            type: "error",
          });
        }
        setIsUploading(false);
        return;
      }

      trackEvent({
        area: TRACKING_AREAS.BUILDER,
        object: "create_agent",
        action: TRACKING_ACTIONS.SUBMIT,
        extra: {
          agent_id: result.agentConfiguration.sId,
          source: "yaml_upload",
          scope: result.agentConfiguration.scope,
          has_skipped_actions: (result.skippedActions?.length ?? 0) > 0,
        },
      });

      if (result.skippedActions && result.skippedActions.length > 0) {
        sendNotification({
          title: "Agent created with warnings",
          description: `Agent "${result.agentConfiguration.name}" was created, but some actions were skipped.`,
          type: "info",
        });

        for (const skipped of result.skippedActions) {
          sendNotification({
            title: `Action skipped: ${skipped.name}`,
            description: skipped.reason,
            type: "info",
          });
        }
      } else {
        sendNotification({
          title: "Agent created successfully",
          description: `Agent "${result.agentConfiguration.name}" was created from YAML`,
          type: "success",
        });
      }

      await router.push(
        `/w/${owner.sId}/builder/agents/${result.agentConfiguration.sId}`
      );

      setIsUploading(false);
    },
    [owner.sId, router, sendNotification, fetcherWithBody]
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
