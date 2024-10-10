import { Readable } from "stream";
import { pipeline } from "stream/promises";

import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
export async function internalCreateToolOutputCsvFile(
  auth: Authenticator,
  {
    title,
    content,
    contentType,
  }: {
    title: string;
    content: string;
    contentType: "text/csv";
  }
): Promise<FileResource> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const fileResource = await FileResource.makeNew({
    workspaceId: workspace.id,
    userId: user.id,
    contentType,
    fileName: title,
    fileSize: Buffer.byteLength(content),
    useCase: "tool_output",
  });

  // Write both the "original" and "processed" versions simultaneously

  await Promise.all([
    pipeline(
      Readable.from(content),
      fileResource.getWriteStream({
        auth,
        version: "original",
      })
    ),
    pipeline(
      Readable.from(content),
      fileResource.getWriteStream({
        auth,
        version: "processed",
      })
    ),
  ]);

  await fileResource.markAsReady();

  return fileResource;
}
