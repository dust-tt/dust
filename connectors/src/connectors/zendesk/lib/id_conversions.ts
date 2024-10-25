import type { ModelId } from "@dust-tt/types";

import logger from "@connectors/logger/logger";

/**
 * Conversion from an id to an internalId.
 */
export function getBrandInternalId(
  connectorId: ModelId,
  brandId: number
): string {
  return `zendesk-brand-${connectorId}-${brandId}`;
}

export function getHelpCenterInternalId(
  connectorId: ModelId,
  brandId: number
): string {
  return `zendesk-help-center-${connectorId}-${brandId}`;
}

export function getCategoryInternalId(
  connectorId: ModelId,
  categoryId: number
): string {
  return `zendesk-category-${connectorId}-${categoryId}`;
}

export function getArticleInternalId(
  connectorId: ModelId,
  articleId: number
): string {
  return `zendesk-article-${connectorId}-${articleId}`;
}

export function getTicketsInternalId(
  connectorId: ModelId,
  brandId: number
): string {
  return `zendesk-tickets-${connectorId}-${brandId}`;
}

export function getTicketInternalId(
  connectorId: ModelId,
  teamId: number
): string {
  return `zendesk-ticket-${connectorId}-${teamId}`;
}

/**
 * Conversion from an internalId to an id.
 */
function _getIdFromInternal(internalId: string, prefix: string): number | null {
  return internalId.startsWith(prefix)
    ? parseInt(internalId.replace(prefix, ""))
    : null;
}

export type InternalIdType =
  | "brand"
  | "help-center"
  | "tickets"
  | "category"
  | "article"
  | "ticket";

export function getIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): { type: InternalIdType; objectId: number } {
  let objectId = getBrandIdFromInternalId(connectorId, internalId);
  if (objectId) {
    return { type: "brand", objectId };
  }
  objectId = getBrandIdFromHelpCenterId(connectorId, internalId);
  if (objectId) {
    return { type: "help-center", objectId };
  }
  objectId = getBrandIdFromTicketsId(connectorId, internalId);
  if (objectId) {
    return { type: "tickets", objectId };
  }
  objectId = getCategoryIdFromInternalId(connectorId, internalId);
  if (objectId) {
    return { type: "category", objectId };
  }
  objectId = getArticleIdFromInternalId(connectorId, internalId);
  if (objectId) {
    return { type: "article", objectId };
  }
  objectId = getTicketIdFromInternalId(connectorId, internalId);
  if (objectId) {
    return { type: "ticket", objectId };
  }
  logger.error(
    { connectorId, internalId },
    "[Zendesk] Internal ID not recognized"
  );
  throw new Error("Internal ID not recognized");
}

function getBrandIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): number | null {
  return _getIdFromInternal(internalId, `zendesk-brand-${connectorId}-`);
}

function getBrandIdFromHelpCenterId(
  connectorId: ModelId,
  helpCenterInternalId: string
): number | null {
  return _getIdFromInternal(
    helpCenterInternalId,
    `zendesk-help-center-${connectorId}-`
  );
}

function getCategoryIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): number | null {
  return _getIdFromInternal(internalId, `zendesk-category-${connectorId}-`);
}

function getArticleIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): number | null {
  return _getIdFromInternal(internalId, `zendesk-article-${connectorId}-`);
}

function getBrandIdFromTicketsId(
  connectorId: ModelId,
  ticketsInternalId: string
): number | null {
  return _getIdFromInternal(
    ticketsInternalId,
    `zendesk-tickets-${connectorId}-`
  );
}

function getTicketIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): number | null {
  return _getIdFromInternal(internalId, `zendesk-ticket-${connectorId}-`);
}
