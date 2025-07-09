import logger from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";

/**
 * Conversion from an id to an internalId.
 */
export function getBrandInternalId({
  connectorId,
  brandId,
}: {
  connectorId: ModelId;
  brandId: number;
}): string {
  return `zendesk-brand-${connectorId}-${brandId}`;
}

export function getHelpCenterInternalId({
  connectorId,
  brandId,
}: {
  connectorId: ModelId;
  brandId: number;
}): string {
  return `zendesk-help-center-${connectorId}-${brandId}`;
}

export function getCategoryInternalId({
  connectorId,
  brandId,
  categoryId,
}: {
  connectorId: ModelId;
  brandId: number;
  categoryId: number;
}): string {
  return `zendesk-category-${connectorId}-${brandId}-${categoryId}`;
}

export function getArticleInternalId({
  connectorId,
  brandId,
  articleId,
}: {
  connectorId: ModelId;
  brandId: number;
  articleId: number;
}): string {
  return `zendesk-article-${connectorId}-${brandId}-${articleId}`;
}

export function getTicketsInternalId({
  connectorId,
  brandId,
}: {
  connectorId: ModelId;
  brandId: number;
}): string {
  return `zendesk-tickets-${connectorId}-${brandId}`;
}

export function getTicketInternalId({
  connectorId,
  brandId,
  ticketId,
}: {
  connectorId: ModelId;
  brandId: number;
  ticketId: number;
}): string {
  return `zendesk-ticket-${connectorId}-${brandId}-${ticketId}`;
}

/**
 * Conversion from an internalId to an id.
 */
function _getIdFromInternal(internalId: string, prefix: string): number | null {
  return internalId.startsWith(prefix)
    ? parseInt(internalId.replace(prefix, ""))
    : null;
}

/**
 * Conversion from an internalId to a pair of IDs.
 */
function _getIdsFromInternal(
  internalId: string,
  prefix: string
): [number, number] | null {
  if (!internalId.startsWith(prefix)) {
    return null;
  }
  const ids = internalId
    .replace(prefix, "")
    .split("-")
    .map((id) => parseInt(id, 10));
  if (ids.length !== 2) {
    return null;
  }
  return ids as [number, number];
}

export function getIdsFromInternalId(
  connectorId: ModelId,
  internalId: string
):
  | {
      type: "brand" | "help-center" | "tickets";
      objectIds: { brandId: number };
    }
  | { type: "category"; objectIds: { brandId: number; categoryId: number } }
  | { type: "article"; objectIds: { brandId: number; articleId: number } }
  | { type: "ticket"; objectIds: { brandId: number; ticketId: number } } {
  let objectId = getBrandIdFromInternalId(connectorId, internalId);
  if (objectId) {
    return { type: "brand", objectIds: { brandId: objectId } };
  }
  objectId = getBrandIdFromHelpCenterId(connectorId, internalId);
  if (objectId) {
    return { type: "help-center", objectIds: { brandId: objectId } };
  }
  objectId = getBrandIdFromTicketsId(connectorId, internalId);
  if (objectId) {
    return { type: "tickets", objectIds: { brandId: objectId } };
  }
  const categoryObjectIds = getCategoryIdFromInternalId(
    connectorId,
    internalId
  );
  if (categoryObjectIds) {
    return { type: "category", objectIds: categoryObjectIds };
  }
  const articleObjectIds = getArticleIdFromInternalId(connectorId, internalId);
  if (articleObjectIds) {
    return { type: "article", objectIds: articleObjectIds };
  }
  const ticketObjectIds = getTicketIdFromInternalId(connectorId, internalId);
  if (ticketObjectIds) {
    return { type: "ticket", objectIds: ticketObjectIds };
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
): { brandId: number; categoryId: number } | null {
  const prefix = `zendesk-category-${connectorId}-`;
  const ids = _getIdsFromInternal(internalId, prefix);
  return ids && { brandId: ids[0], categoryId: ids[1] };
}

function getArticleIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): { brandId: number; articleId: number } | null {
  const prefix = `zendesk-article-${connectorId}-`;
  const ids = _getIdsFromInternal(internalId, prefix);
  return ids && { brandId: ids[0], articleId: ids[1] };
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
): { brandId: number; ticketId: number } | null {
  const prefix = `zendesk-ticket-${connectorId}-`;
  const ids = _getIdsFromInternal(internalId, prefix);
  return ids && { brandId: ids[0], ticketId: ids[1] };
}
