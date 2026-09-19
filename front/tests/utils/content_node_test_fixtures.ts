import type {
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@app/types/data_source_view";
import type { EnrichedSpaceType } from "@app/types/space";

// Plain-object fixtures for unit tests that never touch the database.

export function makeSpaceFixture(
  overrides: Partial<EnrichedSpaceType> & Pick<EnrichedSpaceType, "sId">
): EnrichedSpaceType {
  return {
    createdAt: 0,
    updatedAt: 0,
    kind: "regular",
    name: overrides.sId,
    groupIds: [],
    isRestricted: false,
    ...overrides,
  };
}

export function makeDataSourceViewFixture(
  sId: string,
  dataSourceOverrides: Partial<DataSourceViewType["dataSource"]> = {}
): DataSourceViewType {
  return {
    category: "managed",
    createdAt: 0,
    dataSource: {
      id: 1,
      sId: `ds-${sId}`,
      createdAt: 0,
      name: sId,
      description: null,
      assistantDefaultSelected: false,
      dustAPIProjectId: "p1",
      dustAPIDataSourceId: "d1",
      connectorId: null,
      connectorProvider: null,
      ...dataSourceOverrides,
    },
    id: 1,
    kind: "default",
    parentsIn: null,
    sId,
    spaceId: "space1",
    updatedAt: 0,
  };
}

export function makeContentNodeFixture(
  internalId: string,
  overrides: Partial<DataSourceViewContentNode> = {}
): DataSourceViewContentNode {
  return {
    childrenCount: 0,
    expandable: false,
    internalId,
    lastUpdatedAt: null,
    mimeType: "text/plain",
    parentInternalId: null,
    parentInternalIds: null,
    parentTitle: null,
    permission: "read",
    providerVisibility: null,
    sourceUrl: null,
    title: internalId,
    type: "document",
    dataSourceView: makeDataSourceViewFixture("dsv1"),
    ...overrides,
  };
}
