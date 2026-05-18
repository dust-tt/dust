/** @ignoreswagger */

import { isContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { listProjectContextAttachments } from "@app/lib/api/projects/context";
import { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { ContentNodeType } from "@app/types/core/content_node";
import type { ConnectorProvider } from "@app/types/data_source";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PokeListProjectKnowledgeFromConnectors>
  >,
  session: SessionWithUser
): Promise<void> {
  const { wId, projectId } = req.query;
  if (!isString(wId) || !isString(projectId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or project ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const space = await SpaceResource.fetchById(auth, projectId);
  if (!space || !space.isProject()) {
    return apiError(req, res, {
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

  return res.status(200).json({ items });
}

export default withSessionAuthenticationForPoke(handler);
