import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import type { LightWorkspaceType } from "@app/types";

interface UseYAMLUploadOptions {
  owner: LightWorkspaceType;
  onSuccess?: (agentConfigurationId: string) => void;
}

export function useYAMLUpload({ owner, onSuccess }: UseYAMLUploadOptions) {
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
      try {
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
          throw new Error(
            errorData.error?.message || "Failed to create agent from YAML"
          );
        }

        const result = await response.json();

        // Handle skipped actions
        if (result.skippedActions && result.skippedActions.length > 0) {
          const skippedList = result.skippedActions
            .map(
              (skipped: { name: string; reason: string }) =>
                `• ${skipped.name}: ${skipped.reason}`
            )
            .join("\n");

          sendNotification({
            title: "Agent created with warnings",
            description: `Agent "${result.agentConfiguration.name}" was created, but some actions were skipped:\n${skippedList}`,
            type: "info",
          });
        } else {
          sendNotification({
            title: "Agent created successfully",
            description: `Agent "${result.agentConfiguration.name}" was created from YAML`,
            type: "success",
          });
        }

        if (onSuccess) {
          onSuccess(result.agentConfiguration.sId);
        } else {
          // Default behavior: redirect to the newly created agent
          await router.push(
            `/w/${owner.sId}/builder/agents/${result.agentConfiguration.sId}`
          );
        }

        // Clear the file input
        target.value = "";
      } catch (error) {
        sendNotification({
          title: "Error creating agent",
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
          type: "error",
        });
      } finally {
        setIsUploading(false);
      }
    },
    [owner.sId, router, sendNotification, onSuccess]
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
