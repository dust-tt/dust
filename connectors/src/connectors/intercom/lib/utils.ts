export function getHelpCenterArticleDocumentId(
  intercomWorkspaceId: string,
  articleId: string
): string {
  return `intercom-help-center-article-${intercomWorkspaceId}-${articleId}`;
}
