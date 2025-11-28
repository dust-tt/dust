export function makeIndexUserSearchWorkflowId({
  userId,
}: {
  userId: string;
}): string {
  return `es-indexation-user-search-${userId}`;
}
