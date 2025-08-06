export function isValidPage<T extends Record<string, string>>(
  pageId: string,
  pageIds: T
): pageId is T[keyof T] {
  return Object.values(pageIds).includes(pageId);
}
