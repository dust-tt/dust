import type { ModelId } from "@dust-tt/types";

/**
 * Conversion from an id to an internalId.
 */
export function getBrandInternalId(
  connectorId: ModelId,
  helpCenterId: string
): string {
  return `zendesk-brand-${connectorId}-${helpCenterId}`;
}

export function getHelpCenterInternalId(
  connectorId: ModelId,
  helpCenterId: string
): string {
  return `zendesk-help-center-${connectorId}-${helpCenterId}`;
}

export function getCategoryInternalId(
  connectorId: ModelId,
  collectionId: string
): string {
  return `zendesk-category-${connectorId}-${collectionId}`;
}

export function getArticleInternalId(
  connectorId: ModelId,
  articleId: string
): string {
  return `zendesk-article-${connectorId}-${articleId}`;
}

export function getTicketsInternalId(connectorId: ModelId): string {
  return `zendesk-tickets-${connectorId}`;
}

export function getTicketInternalId(
  connectorId: ModelId,
  teamId: string
): string {
  return `zendesk-ticket-${connectorId}-${teamId}`;
}

export function getConversationInternalId(
  connectorId: ModelId,
  conversationId: string
): string {
  return `zendesk-category-${connectorId}-${conversationId}`;
}

/**
 * Conversion from an internalId to an id.
 */
function _getIdFromInternal(internalId: string, prefix: string): string | null {
  return internalId.startsWith(prefix) ? internalId.replace(prefix, "") : null;
}

export function getBrandIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): string | null {
  return _getIdFromInternal(internalId, `zendesk-brand-${connectorId}-`);
}

export function getHelpCenterIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): string | null {
  return _getIdFromInternal(internalId, `zendesk-help-center-${connectorId}-`);
}

export function getCategoryIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): string | null {
  return _getIdFromInternal(internalId, `zendesk-category-${connectorId}-`);
}

export function getArticleIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): string | null {
  return _getIdFromInternal(internalId, `zendesk-article-${connectorId}-`);
}

export function getTicketsIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): boolean {
  return internalId === `zendesk-tickets-${connectorId}`;
}

export function getTicketIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): string | null {
  return _getIdFromInternal(internalId, `zendesk-ticket-${connectorId}-`);
}
