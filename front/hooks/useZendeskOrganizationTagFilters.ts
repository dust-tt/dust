import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { ZENDESK_CONFIG_KEYS } from "@app/lib/constants/zendesk";
import { clientFetch } from "@app/lib/egress/client";
import { useConnectorConfig } from "@app/lib/swr/connectors";
import type { DataSourceType } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo } from "react";

export function useZendeskOrganizationTagFilters({
  owner,
  dataSource,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
            title: t`Tag already exists`,
            description:
              type === "include"
                ? t`The tag "${tag}" is already in the include list.`
                : t`The tag "${tag}" is already in the exclude list.`,
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
            title: t`Tag added`,
            description:
              type === "include"
                ? t`Added "${tag}" to the include list.`
                : t`Added "${tag}" to the exclude list.`,
          });
        } else {
          const err = await res.json();
          sendApiErrorNotification({
            title: t`Failed to add tag`,
            error: err,
          });
        }
      } catch {
        sendNotification({
          type: "error",
          title: t`Failed to add tag`,
          description: t`An error occurred while adding the tag.`,
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
      sendApiErrorNotification,
      sendNotification,
      t,
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
            title: t`Tag not found`,
            description:
              type === "include"
                ? t`The tag "${tag}" is not in the include list.`
                : t`The tag "${tag}" is not in the exclude list.`,
          });
          return;
        }

        const newTags = currentTags.filter(
          (existingTag: string) => existingTag !== tag
        );
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
            title: t`Tag removed`,
            description:
              type === "include"
                ? t`Removed "${tag}" from the include list.`
                : t`Removed "${tag}" from the exclude list.`,
          });
        } else {
          const err = await res.json();
          sendApiErrorNotification({
            title: t`Failed to remove tag`,
            error: err,
          });
        }
      } catch {
        sendNotification({
          type: "error",
          title: t`Failed to remove tag`,
          description: t`An error occurred while removing the tag.`,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      owner.sId,
      dataSource.sId,
      includedTags,
      excludedTags,
      mutateIncludedTags,
      mutateExcludedTags,
      sendApiErrorNotification,
      t,
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
