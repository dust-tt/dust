import type {
  DataSourceViewContentNode,
  DataSourceViewSelectionConfiguration,
  DataSourceViewSelectionConfigurations,
} from "@app/types/data_source_view";
import { defaultSelectionConfiguration } from "@app/types/data_source_view";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { DATA_SOURCE_MIME_TYPE } from "@dust-tt/client";
import cloneDeep from "lodash/cloneDeep";
import omit from "lodash/omit";

export type ItemSelectionState = boolean | "partial";

export function getItemSelectionState(
  item: DataSourceViewContentNode,
  config: DataSourceViewSelectionConfiguration | undefined
): ItemSelectionState {
  if (!config) {
    return false;
  }
  if (config.isSelectAll) {
    return true;
  }

  const directlySelected = config.selectedResources.some(
    (resource) => resource.internalId === item.internalId
  );
  if (directlySelected) {
    return true;
  }

  const selectedIds = new Set(
    config.selectedResources.map((resource) => resource.internalId)
  );

  if (item.parentInternalIds?.some((id) => selectedIds.has(id))) {
    return true;
  }

  if (
    config.selectedResources.some((resource) =>
      resource.parentInternalIds?.includes(item.internalId)
    )
  ) {
    return "partial";
  }

  return false;
}

export function isItemCheckboxDisabled(
  item: DataSourceViewContentNode,
  config: DataSourceViewSelectionConfiguration | undefined
): boolean {
  if (!config) {
    return false;
  }
  if (config.isSelectAll) {
    return true;
  }

  if (
    config.selectedResources.some(
      (resource) => resource.internalId === item.internalId
    )
  ) {
    return false;
  }

  const selectedIds = new Set(
    config.selectedResources.map((resource) => resource.internalId)
  );

  return item.parentInternalIds?.some((id) => selectedIds.has(id)) ?? false;
}

export function deselectDescendants({
  item,
  prevState,
}: {
  item: DataSourceViewContentNode;
  prevState: DataSourceViewSelectionConfigurations;
}): DataSourceViewSelectionConfigurations {
  const { dataSourceView: dsv } = item;
  const prevConfig = prevState[dsv.sId];
  if (!prevConfig) {
    return cloneDeep(prevState);
  }

  const newResources = prevConfig.selectedResources.filter(
    (resource) => !resource.parentInternalIds?.includes(item.internalId)
  );

  if (newResources.length === 0) {
    return omit(prevState, dsv.sId);
  }

  return {
    ...prevState,
    [dsv.sId]: {
      ...prevConfig,
      selectedResources: newResources,
      isSelectAll: false,
    },
  };
}

export function updateSelection({
  item,
  prevState,
  selectionMode = "checkbox",
  onlyAdd = false,
}: {
  item: DataSourceViewContentNode;
  prevState: DataSourceViewSelectionConfigurations;
  selectionMode: "checkbox" | "radio";
  onlyAdd?: boolean;
}): DataSourceViewSelectionConfigurations {
  const { dataSourceView: dsv } = item;
  const prevConfig = prevState[dsv.sId] ?? defaultSelectionConfiguration(dsv);

  const exists = prevConfig.selectedResources.some(
    (r) => r.internalId === item.internalId
  );

  if (onlyAdd && exists) {
    return cloneDeep(prevState);
  }

  if (item.mimeType === DATA_SOURCE_MIME_TYPE) {
    return {
      ...prevState,
      [dsv.sId]: {
        ...prevConfig,
        selectedResources: [],
        isSelectAll: true,
      },
    };
  }

  if (selectionMode === "radio" && !exists) {
    return {
      ...prevState,
      [dsv.sId]: {
        ...prevConfig,
        selectedResources: [
          {
            ...item,
            dataSourceView: dsv,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            parentInternalIds: item.parentInternalIds || [],
          },
        ],
        isSelectAll: false,
      },
    };
  }

  const newResources = exists
    ? prevConfig.selectedResources.filter(
        (r) => r.internalId !== item.internalId
      )
    : [
        ...prevConfig.selectedResources,
        {
          ...item,
          dataSourceView: dsv,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          parentInternalIds: item.parentInternalIds || [],
        },
      ];

  return {
    ...prevState,
    [dsv.sId]: {
      ...prevConfig,
      selectedResources: newResources,
      isSelectAll: false,
    },
  };
}
