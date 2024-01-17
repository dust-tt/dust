export function getHelpCenterCollectionDocumentId(
  intercomWorkspaceId: string,
  collectionId: string
): string {
  return `intercom-help-center-collection-${intercomWorkspaceId}-${collectionId}`;
}

export function getHelpCenterArticleDocumentId(
  intercomWorkspaceId: string,
  articleId: string
): string {
  return `intercom-help-center-article-${intercomWorkspaceId}-${articleId}`;
}
