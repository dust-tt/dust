import type { ModelId } from "@dust-tt/types";

import type {
  IntercomArticleType,
  IntercomCollectionType,
} from "@connectors/connectors/intercom/lib/types";
import { IntercomCollection } from "@connectors/lib/models/intercom";

/**
 * Mimetypes
 */
export function getDataSourceNodeMimeType(
  intercomNodeType: "COLLECTION" | "TEAM" | "TEAMS_FOLDER" | "HELP_CENTER"
): string {
  switch (intercomNodeType) {
    case "COLLECTION":
      return "application/vnd.dust.intercom.collection";
    case "TEAMS_FOLDER":
      return "application/vnd.dust.intercom.teams-folder";
    case "TEAM":
      return "application/vnd.dust.intercom.team";
    case "HELP_CENTER":
      return "application/vnd.dust.intercom.help-center";
  }
}

/**
 * From id to internalId
 */
export function getHelpCenterInternalId(
  connectorId: ModelId,
  helpCenterId: string
): string {
  return `intercom-help-center-${connectorId}-${helpCenterId}`;
}
export function getHelpCenterCollectionInternalId(
  connectorId: ModelId,
  collectionId: string
): string {
  return `intercom-collection-${connectorId}-${collectionId}`;
}
export function getHelpCenterArticleInternalId(
  connectorId: ModelId,
  articleId: string
): string {
  return `intercom-article-${connectorId}-${articleId}`;
}
export function getTeamsInternalId(connectorId: ModelId): string {
  return `intercom-teams-${connectorId}`;
}
export function getTeamInternalId(
  connectorId: ModelId,
  teamId: string
): string {
  return `intercom-team-${connectorId}-${teamId}`;
}
export function getConversationInternalId(
  connectorId: ModelId,
  conversationId: string
): string {
  return `intercom-conversation-${connectorId}-${conversationId}`;
}

/**
 * From internalId to id
 */
function _getIdFromInternal(internalId: string, prefix: string): string | null {
  return internalId.startsWith(prefix) ? internalId.replace(prefix, "") : null;
}
export function getHelpCenterIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): string | null {
  return _getIdFromInternal(internalId, `intercom-help-center-${connectorId}-`);
}
export function getHelpCenterCollectionIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): string | null {
  return _getIdFromInternal(internalId, `intercom-collection-${connectorId}-`);
}
export function getHelpCenterArticleIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): string | null {
  return _getIdFromInternal(internalId, `intercom-article-${connectorId}-`);
}
export function isInternalIdForAllTeams(
  connectorId: ModelId,
  internalId: string
): boolean {
  return internalId === `intercom-teams-${connectorId}`;
}
export function getTeamIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): string | null {
  return _getIdFromInternal(internalId, `intercom-team-${connectorId}-`);
}

function getIntercomDomain(region: string): string {
  if (region === "Europe") {
    return "https://app.eu.intercom.com";
  }
  if (region === "Australia") {
    return "https://app.au.intercom.com";
  }
  return "https://app.intercom.com";
}

export function getArticleInAppUrl(
  article: IntercomArticleType,
  region: string
): string {
  const domain = getIntercomDomain(region);
  return `${domain}/a/apps/${article.workspace_id}/articles/articles/${article.id}/show`;
}

export function getCollectionInAppUrl(
  collection: IntercomCollectionType,
  region: string
): string {
  const domain = getIntercomDomain(region);
  return `${domain}/a/apps/${collection.workspace_id}/articles/site/collections`;
}

export function getConversationInAppUrl(
  workspaceId: string,
  conversationId: string,
  region: string
): string {
  const domain = getIntercomDomain(region);
  return `${domain}/a/inbox/${workspaceId}/inbox/conversation/${conversationId}`;
}

// Parents in the Core datasource should map the internal ids that we use in the permission modal
// Order is important: We want the id of the article, then all parents collection in order, then the help center
export async function getParentIdsForArticle({
  documentId,
  connectorId,
  parentCollectionId,
  helpCenterId,
}: {
  documentId: string;
  connectorId: number;
  parentCollectionId: string;
  helpCenterId: string;
}) {
  // Get collection parents
  const collectionParents = await getParentIdsForCollection({
    connectorId,
    collectionId: parentCollectionId,
    parentCollectionId,
    helpCenterId,
  });

  return [...documentId, ...collectionParents];
}

export async function getParentIdsForCollection({
  connectorId,
  collectionId,
  parentCollectionId,
  helpCenterId,
}: {
  connectorId: number;
  collectionId: string;
  parentCollectionId: string | null;
  helpCenterId: string;
}) {
  if (parentCollectionId === null) {
    return [
      getHelpCenterCollectionInternalId(connectorId, collectionId),
      getHelpCenterInternalId(connectorId, helpCenterId),
    ];
  }

  // Initialize the internal IDs array with the collection ID.
  const parentIds = [
    getHelpCenterCollectionInternalId(connectorId, collectionId),
  ];

  // Fetch and add any grandparent collection IDs.
  let currentParentId = parentCollectionId;

  // There's max 2-levels on Intercom.
  for (let i = 0; i < 2; i++) {
    const currentParent = await IntercomCollection.findOne({
      where: {
        connectorId,
        collectionId: currentParentId,
      },
    });

    if (currentParent && currentParent.parentId) {
      currentParentId = currentParent.parentId;
      parentIds.push(
        getHelpCenterCollectionInternalId(connectorId, currentParentId)
      );
    } else {
      break;
    }
  }

  // Add the help center internal ID.
  parentIds.push(getHelpCenterInternalId(connectorId, helpCenterId));

  return parentIds;
}
