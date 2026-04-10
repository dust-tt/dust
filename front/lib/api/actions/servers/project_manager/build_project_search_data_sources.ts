import { getDataSourceURI } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { ContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import {
  isContentFragmentDataSourceNode,
  isContentNodeAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import {
  fetchProjectDataSource,
  fetchProjectDataSourceView,
  listProjectContextAttachments,
} from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

export type ProjectSemanticSearchScope = "knowledge" | "conversations" | "all";

/**
 * Folder internal id under which conversation transcripts are indexed in the dust_project
 * data source (see connectors/dust_project/lib/conversation_formatting.ts).
 */
export function getProjectConversationFolderInternalId(
  dustProjectConnectorId: string,
  spaceSId: string
): string {
  return `dust-project-${dustProjectConnectorId}-project-${spaceSId}`;
}

/**
 * One config per data source view; merges parent node ids when several project context
 * nodes point at the same view (same pattern as skill knowledge merging).
 */
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

function projectDataSourceFilter(
  scope: ProjectSemanticSearchScope,
  conversationFolderInternalId: string | null
): DataSourceConfiguration["filter"] {
  switch (scope) {
    case "all":
      return { parents: null, tags: null };
    case "knowledge":
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
 * Data sources for semantic search over a project, scoped to knowledge (project files,
 * metadata, searchable context nodes), conversations (transcripts in the dust_project
 * connector), or both. The project data source view mixes knowledge and conversations;
 * scope selects via parents filters on that view.
 */
export async function buildProjectSearchDataSources(
  auth: Authenticator,
  space: SpaceResource,
  scope: ProjectSemanticSearchScope
): Promise<DataSourcesToolConfigurationType> {
  const owner = auth.getNonNullableWorkspace();
  const dataSources: DataSourcesToolConfigurationType = [];

  const projectDsRes = await fetchProjectDataSource(auth, space);
  const connectorId = projectDsRes.isOk()
    ? projectDsRes.value.connectorId
    : null;
  const conversationFolderInternalId =
    connectorId != null
      ? getProjectConversationFolderInternalId(connectorId, space.sId)
      : null;

  const projectDsViewRes = await fetchProjectDataSourceView(auth, space);
  if (projectDsViewRes.isOk()) {
    const needsFolder = scope === "knowledge" || scope === "conversations";
    if (!needsFolder || conversationFolderInternalId != null) {
      dataSources.push({
        uri: getDataSourceURI({
          workspaceId: owner.sId,
          dataSourceViewId: projectDsViewRes.value.sId,
          filter: projectDataSourceFilter(scope, conversationFolderInternalId),
        }),
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      });
    }
  }

  if (scope === "conversations") {
    return dataSources;
  }

  const projectContextAttachments = await listProjectContextAttachments(
    auth,
    space
  );
  const searchableContentNodes = projectContextAttachments.filter(
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
