import { Hono } from "hono";

import { isContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { listProjectContextAttachments } from "@app/lib/api/projects/context";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ContentNodeType } from "@app/types/core/content_node";
import type { ConnectorProvider } from "@app/types/data_source";

import { apiError } from "@front-api/middleware/utils";

export type PokeProjectKnowledgeFromConnectorItem = {
  contentFragmentId: string;
  nodeId: string;
  nodeType: ContentNodeType;
  nodeDataSourceViewId: string;
  title: string;
  contentType: string;
  sourceUrl: string | null;
  lastUpdatedAt: number | null;
  creator: string | null;
  sourceDataSourceViewSpaceSId: string | null;
  sourceDataSourceName: string | null;
  sourceConnectorProvider: ConnectorProvider | null;
};

export type PokeListProjectKnowledgeFromConnectors = {
  items: PokeProjectKnowledgeFromConnectorItem[];
};

// Mounted at /api/poke/workspaces/:wId/projects/:projectId/connector-knowledge.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  if (!projectId) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid project ID.",
      },
    });
  }

  const space = await SpaceResource.fetchById(auth, projectId);
  if (!space || !space.isProject()) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "Project not found.",
      },
    });
  }

  const attachments = await listProjectContextAttachments(auth, space);
  const contentNodes = attachments.filter(isContentNodeAttachmentType);

  const dsvSIds = Array.from(
    new Set(contentNodes.map((a) => a.nodeDataSourceViewId))
  );

  const dsvBySId = new Map<
    string,
    {
      spaceSId: string;
      dataSourceName: string;
      connectorProvider: ConnectorProvider | null;
    }
  >();
  if (dsvSIds.length > 0) {
    const dsvs = await DataSourceViewResource.fetchByIds(auth, dsvSIds);
    for (const dsv of dsvs) {
      const json = dsv.toJSON();
      dsvBySId.set(dsv.sId, {
        spaceSId: json.spaceId,
        dataSourceName: getDisplayNameForDataSource(json.dataSource),
        connectorProvider: json.dataSource.connectorProvider,
      });
    }
  }

  const items: PokeProjectKnowledgeFromConnectorItem[] = contentNodes.map(
    (a) => {
      const creator = a.creator
        ? `${a.creator.type === "agent" ? "agent: " : ""}${a.creator.name}`
        : null;
      const dsv = dsvBySId.get(a.nodeDataSourceViewId);
      return {
        contentFragmentId: a.contentFragmentId,
        nodeId: a.nodeId,
        nodeType: a.nodeType,
        nodeDataSourceViewId: a.nodeDataSourceViewId,
        title: a.title,
        contentType: a.contentType,
        sourceUrl: a.sourceUrl,
        lastUpdatedAt: a.lastUpdatedAt ?? null,
        creator,
        sourceDataSourceViewSpaceSId: dsv?.spaceSId ?? null,
        sourceDataSourceName: dsv?.dataSourceName ?? null,
        sourceConnectorProvider: dsv?.connectorProvider ?? null,
      };
    }
  );

  const body: PokeListProjectKnowledgeFromConnectors = { items };
  return c.json(body);
});

export default app;
