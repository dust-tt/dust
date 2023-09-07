// Github
export function getGithubDiscussionDocumentId(
  repoId: string,
  discussionNumber: number
): string {
  return `github-discussion-${repoId}-${discussionNumber}`;
}

export function getGithubIssueDocumentId(
  repoId: string,
  issueNumber: number
): string {
  return `github-issue-${repoId}-${issueNumber}`;
}

export function getGithubRepoResourceId(repoId: string): string {
  return `github-repo-${repoId}`;
}

/// Notion
export function getNotionDatabaseResourceId(databaseId: string): string {
  return `notion-database-${databaseId}`;
}

export function getNotionPageDocumentId(pageId: string): string {
  return `notion-${pageId}`;
}

/// Slack
export function getSlackChannelResourceId(channelId: string): string {
  return `slack-channel-${channelId}`;
}

export function getSlackMessagesDocumentId(
  channelId: string,
  startTsMs: number,
  endTsMs: number
): string {
  const startDate = new Date(startTsMs);
  const endDate = new Date(endTsMs);
  const startDateStr = `${startDate.getFullYear()}-${startDate.getMonth()}-${startDate.getDate()}`;
  const endDateStr = `${endDate.getFullYear()}-${endDate.getMonth()}-${endDate.getDate()}`;
  return `slack-${channelId}-messages-${startDateStr}-${endDateStr}`;
}

export function getSlackThreadDocumentId(channelId: string, threadTs: string) {
  return `slack-${channelId}-thread-${threadTs}`;
}

/// Google Drive
export function getGDriveFileDocumentId(driveFileId: string): string {
  return `gdrive-${driveFileId}`;
}

export function getGDriveFolderResourceId(driveFolderId: string): string {
  return `gdrive-folder-${driveFolderId}`;
}
