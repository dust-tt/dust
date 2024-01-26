import type { ModelId } from "@dust-tt/types";

export function getHelpCenterInternalId(
  connectorId: ModelId,
  helpCenterId: string
): string {
  return `intercom-${connectorId}-help-center-${helpCenterId}`;
}

export function getHelpCenterCollectionInternalId(
  connectorId: ModelId,
  collectionId: string
): string {
  return `intercom-${connectorId}-collection-${collectionId}`;
}

export function getHelpCenterArticleInternalId(
  connectorId: ModelId,
  articleId: string
): string {
  return `intercom-${connectorId}-article-${articleId}`;
}

export function getHelpCenterIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): string | null {
  const prefix = `intercom-${connectorId}-help-center-`;
  if (!internalId.startsWith(prefix)) {
    return null;
  }
  return internalId.replace(prefix, "");
}

export function getHelpCenterCollectionIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): string | null {
  const prefix = `intercom-${connectorId}-collection-`;
  if (!internalId.startsWith(prefix)) {
    return null;
  }
  return internalId.replace(prefix, "");
}

export function getHelpCenterArticleIdFromInternalId(
  connectorId: ModelId,
  internalId: string
): string | null {
  const prefix = `intercom-${connectorId}-article-`;
  if (!internalId.startsWith(prefix)) {
    return null;
  }
  return internalId.replace(prefix, "");
}
