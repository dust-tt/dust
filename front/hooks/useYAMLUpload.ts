import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import logger from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types";
import { normalizeError } from "@app/types";

interface UseYAMLUploadOptions {
  owner: LightWorkspaceType;
}

export function useYAMLUpload({ owner }: UseYAMLUploadOptions) {
  const router = useRouter();
  const sendNotification = useSendNotification();
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
      const response = await fetch(
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

        sendNotification({
          title: "Agent creation failed",
          description: "An error occurred while creating the agent from YAML",
          type: "error",
        });
        setIsUploading(false);
        return;
      }

      const result = await response.json();
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
    [owner.sId, router, sendNotification]
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
