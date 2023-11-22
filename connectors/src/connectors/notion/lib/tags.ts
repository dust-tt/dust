export function getTagsForPage({
  title,
  author,
  lastEditor,
  updatedTime,
  createdTime,
}: {
  title?: string | null;
  author: string;
  lastEditor: string;
  updatedTime: number;
  createdTime: number;
}): string[] {
  const tags: string[] = [];
  if (title) {
    tags.push(`title:${title.substring(0, 512)}`);
  }

  return tags.concat([
    `author:${author}`,
    `lastEditor:${lastEditor}`,
    `lastEditedAt:${updatedTime}`,
    `createdAt:${createdTime}`,
  ]);
}
