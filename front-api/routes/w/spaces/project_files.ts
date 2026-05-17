import { Hono } from "hono";

import { FileResource } from "@app/lib/resources/file_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { FileTypeWithMetadata } from "@app/types/files";

import { spaceResource } from "../../../middleware/space_resource";

export type FileWithCreatorType = FileTypeWithMetadata & {
  createdAt: number;
  updatedAt: number;
  user: {
    sId: string;
    name: string | null;
    imageUrl: string | null;
  } | null;
};

// Mounted under /api/w/:wId/spaces/:spaceId/project_files.
export const projectFilesApp = new Hono();

projectFilesApp.get("/", spaceResource({ requireCanRead: true }), async (c) => {
  const auth = c.get("auth");
  const space = c.get("space");

  const files = await FileResource.listByProject(auth, {
    projectId: space.sId,
  });

  const userIds = files
    .map((f) => f.userId)
    .filter((id): id is number => id !== null);
  const uniqueUserIds = Array.from(new Set(userIds));
  const users = await UserResource.fetchByModelIds(uniqueUserIds);
  const userMap = new Map(users.map((u) => [u.id, u]));

  const filesWithMetadata: FileWithCreatorType[] = files.map((f) => {
    const user = f.userId ? userMap.get(f.userId) : null;
    return {
      sId: f.sId,
      id: f.sId,
      fileName: f.fileName,
      fileSize: f.fileSize,
      contentType: f.contentType,
      status: f.status,
      version: f.version,
      useCase: f.useCase,
      useCaseMetadata: f.useCaseMetadata ?? {},
      createdAt: f.createdAt.getTime(),
      updatedAt: f.updatedAt.getTime(),
      user: user
        ? {
            sId: user.sId,
            name: user.fullName() || user.username,
            imageUrl: user.imageUrl,
          }
        : null,
    };
  });

  return c.json({ files: filesWithMetadata });
});
