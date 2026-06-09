import { getDataSourceURI } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { ContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import {
  isContentFragmentDataSourceNode,
  isContentNodeAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import {
  getProjectConversationFolderInternalId,
  listProjectContextAttachments,
} from "@app/lib/api/projects/context";
import {
  fetchProjectDataSource,
  fetchProjectDataSourceView,
} from "@app/lib/api/projects/data_sources";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

export type PodSemanticSearchScope = "files" | "conversations" | "all";

function mergeContentNodeDataSourceConfigurations(
  workspaceId: string,
  nodes: ContentNodeAttachmentType[]
): DataSourceConfiguration[] {
  const byViewId = new Map<
    string,
    { hasFullView: boolean; parentIds: Set<string> }
  >();

  for (const node of nodes) {
    const viewId = node.nodeDataSourceViewId;
    let agg = byViewId.get(viewId);
    if (!agg) {
      agg = { hasFullView: false, parentIds: new Set() };
      byViewId.set(viewId, agg);
    }
    if (isContentFragmentDataSourceNode(node)) {
      agg.hasFullView = true;
    } else {
      agg.parentIds.add(node.nodeId);
    }
  }

  return Array.from(byViewId.entries()).map(([dataSourceViewId, agg]) => ({
    workspaceId,
    dataSourceViewId,
    filter: {
      parents: agg.hasFullView
        ? null
        : {
            in: Array.from(agg.parentIds),
            not: [],
          },
      tags: null,
    },
  }));
}

function podDataSourceFilter(
  scope: PodSemanticSearchScope,
  conversationFolderInternalId: string | null
): DataSourceConfiguration["filter"] {
  switch (scope) {
    case "all":
      return { parents: null, tags: null };
    case "files":
      if (!conversationFolderInternalId) {
        return { parents: null, tags: null };
      }
      return {
        parents: {
          in: null,
          not: [conversationFolderInternalId],
        },
        tags: null,
      };
    case "conversations":
      if (!conversationFolderInternalId) {
        return { parents: null, tags: null };
      }
      return {
        parents: {
          in: [conversationFolderInternalId],
          not: [],
        },
        tags: null,
      };
  }
}

/**
 * Data sources for semantic search over a Pod, scoped to files (Pod files, metadata,
 * searchable context nodes), conversations (transcripts in the dust_project connector), or
 * both. The Pod data source view mixes files and conversations; scope selects via parents
 * filters on that view.
 */
export async function buildPodSearchDataSources(
  auth: Authenticator,
  space: SpaceResource,
  scope: PodSemanticSearchScope
): Promise<DataSourcesToolConfigurationType> {
  const owner = auth.getNonNullableWorkspace();
  const dataSources: DataSourcesToolConfigurationType = [];

  const podDsRes = await fetchProjectDataSource(auth, space);
  const connectorId = podDsRes.isOk() ? podDsRes.value.connectorId : null;
  const conversationFolderInternalId =
    connectorId != null
      ? getProjectConversationFolderInternalId(connectorId, space.sId)
      : null;

  const podDsViewRes = await fetchProjectDataSourceView(auth, space);
  if (podDsViewRes.isOk()) {
    const needsFolder = scope === "files" || scope === "conversations";
    if (!needsFolder || conversationFolderInternalId != null) {
      dataSources.push({
        uri: getDataSourceURI({
          workspaceId: owner.sId,
          dataSourceViewId: podDsViewRes.value.sId,
          filter: podDataSourceFilter(scope, conversationFolderInternalId),
        }),
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      });
    }
  }

  if (scope === "conversations") {
    return dataSources;
  }

  const podContextAttachments = await listProjectContextAttachments(
    auth,
    space
  );
  const searchableContentNodes = podContextAttachments.filter(
    (a): a is ContentNodeAttachmentType =>
      isContentNodeAttachmentType(a) && a.isSearchable
  );
  const contentNodeConfigs = mergeContentNodeDataSourceConfigurations(
    owner.sId,
    searchableContentNodes
  );

  for (const cfg of contentNodeConfigs) {
    dataSources.push({
      uri: getDataSourceURI(cfg),
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
    });
  }

  return dataSources;
}
