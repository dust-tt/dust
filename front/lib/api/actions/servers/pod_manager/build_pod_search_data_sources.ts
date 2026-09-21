import { getDataSourceURI } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import {
  contentNodeAttachmentsDataSourceConfigurations,
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
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ContentNodeAttachmentType } from "@app/types/api/assistant/conversation/attachments";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

type PodSemanticSearchScope = "files" | "conversations" | "all";

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
 * searchable content nodes), conversations (transcripts in the dust_project connector), or
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
    dataSources.push({
      uri: getDataSourceURI({
        workspaceId: owner.sId,
        dataSourceViewId: podDsViewRes.value.sId,
        filter: podDataSourceFilter(scope, conversationFolderInternalId),
      }),
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
    });
  }

  if (scope === "conversations") {
    return dataSources;
  }

  const dataSourceViews = await DataSourceViewResource.listBySpace(auth, space);
  // Add potential connected data sources
  for (const dsView of dataSourceViews) {
    if (
      dsView.dataSource.connectorProvider &&
      dsView.dataSource.connectorProvider !== "dust_project"
    ) {
      dataSources.push({
        uri: getDataSourceURI({
          workspaceId: owner.sId,
          dataSourceViewId: dsView.sId,
          filter: {
            parents: null,
            tags: null,
          },
        }),
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      });
    }
  }

  const podContextAttachments = await listProjectContextAttachments(
    auth,
    space
  );
  const searchableContentNodes = podContextAttachments.filter(
    (a): a is ContentNodeAttachmentType =>
      isContentNodeAttachmentType(a) && a.isSearchable
  );
  const contentNodeConfigs = contentNodeAttachmentsDataSourceConfigurations(
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
