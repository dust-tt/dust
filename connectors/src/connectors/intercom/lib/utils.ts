import type { ModelId } from "@dust-tt/types";

import type {
  IntercomArticleType,
  IntercomCollectionType,
} from "@connectors/connectors/intercom/lib/types";

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
