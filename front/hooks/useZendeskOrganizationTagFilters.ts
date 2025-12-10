import { useCallback, useMemo } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { ZENDESK_CONFIG_KEYS } from "@app/lib/constants/zendesk";
import { clientFetch } from "@app/lib/egress/client";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType, WorkspaceType } from "@app/types";

export function useZendeskOrganizationTagFilters({
  owner,
  dataSource,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
}) {
  const sendNotification = useSendNotification();

  const {
    configValue: includedTagsConfig,
    mutateConfig: mutateIncludedTags,
    isResourcesLoading: loadingIncluded,
  } = useConnectorConfig({
    configKey: ZENDESK_CONFIG_KEYS.ORGANIZATION_TAGS_TO_INCLUDE,
    dataSource,
    owner,
  });

  const {
    configValue: excludedTagsConfig,
    mutateConfig: mutateExcludedTags,
    isResourcesLoading: loadingExcluded,
  } = useConnectorConfig({
    configKey: ZENDESK_CONFIG_KEYS.ORGANIZATION_TAGS_TO_EXCLUDE,
    dataSource,
    owner,
  });

  const includedTags = useMemo(
    () => (includedTagsConfig ? JSON.parse(includedTagsConfig) : []),
    [includedTagsConfig]
  );
  const excludedTags = useMemo(
    () => (excludedTagsConfig ? JSON.parse(excludedTagsConfig) : []),
    [excludedTagsConfig]
  );

  const addOrganizationTag = useCallback(
    async (tag: string, type: "include" | "exclude") => {
      try {
        const configKey =
          type === "include"
            ? ZENDESK_CONFIG_KEYS.ORGANIZATION_TAGS_TO_INCLUDE
            : ZENDESK_CONFIG_KEYS.ORGANIZATION_TAGS_TO_EXCLUDE;
        const currentTags = type === "include" ? includedTags : excludedTags;

        if (currentTags.includes(tag)) {
          sendNotification({
            type: "info",
            title: "Tag already exists",
            description: `The tag "${tag}" is already in the ${type} list.`,
          });
          return;
        }

        const newTags = [...currentTags, tag];
        const res = await clientFetch(
          `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${configKey}`,
          {
            headers: { "Content-Type": "application/json" },
            method: "POST",
            body: JSON.stringify({ configValue: JSON.stringify(newTags) }),
          }
        );

        if (res.ok) {
          if (type === "include") {
            await mutateIncludedTags();
          } else {
            await mutateExcludedTags();
          }
          sendNotification({
            type: "success",
            title: "Tag added",
            description: `Added "${tag}" to ${type} list.`,
          });
        } else {
          const err = await res.json();
          sendNotification({
            type: "error",
            title: "Failed to add tag",
            description:
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              err.error?.connectors_error?.message ||
              "An unknown error occurred",
          });
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to add tag",
          description: "An error occurred while adding the tag.",
        });
      }
    },
    [
      owner.sId,
      dataSource.sId,
      includedTags,
      excludedTags,
      mutateIncludedTags,
      mutateExcludedTags,
      sendNotification,
    ]
  );

  const removeOrganizationTag = useCallback(
    async (tag: string, type: "include" | "exclude") => {
      try {
        const configKey =
          type === "include"
            ? ZENDESK_CONFIG_KEYS.ORGANIZATION_TAGS_TO_INCLUDE
            : ZENDESK_CONFIG_KEYS.ORGANIZATION_TAGS_TO_EXCLUDE;
        const currentTags = type === "include" ? includedTags : excludedTags;

        if (!currentTags.includes(tag)) {
          sendNotification({
            type: "info",
            title: "Tag not found",
            description: `The tag "${tag}" is not in the ${type} list.`,
          });
          return;
        }

        const newTags = currentTags.filter((t: string) => t !== tag);
        const res = await clientFetch(
          `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${configKey}`,
          {
            headers: { "Content-Type": "application/json" },
            method: "POST",
            body: JSON.stringify({ configValue: JSON.stringify(newTags) }),
          }
        );

        if (res.ok) {
          if (type === "include") {
            await mutateIncludedTags();
          } else {
            await mutateExcludedTags();
          }
          sendNotification({
            type: "success",
            title: "Tag removed",
            description: `Removed "${tag}" from ${type} list.`,
          });
        } else {
          const err = await res.json();
          sendNotification({
            type: "error",
            title: "Failed to remove tag",
            description:
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              err.error?.connectors_error?.message ||
              "An unknown error occurred",
          });
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to remove tag",
          description: "An error occurred while removing the tag.",
        });
      }
    },
    [
      includedTags,
      excludedTags,
      owner.sId,
      dataSource.sId,
      sendNotification,
      mutateIncludedTags,
      mutateExcludedTags,
    ]
  );

  return {
    organizationTagFilters: {
      includedTags,
      excludedTags,
    },
    addOrganizationTag,
    removeOrganizationTag,
    loading: loadingIncluded || loadingExcluded,
    error: null,
  };
}
