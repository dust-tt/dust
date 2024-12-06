import type {
  ContentFragmentInputType,
  ContentFragmentInputWithContentType,
  ContentFragmentInputWithFileIdType,
  ConversationType,
  ModelId,
  Result,
  SupportedFileContentType,
} from "@dust-tt/types";
import {
  Err,
  extensionsForContentType,
  isContentFragmentInputWithContentType,
  isSupportedUploadableContentFragmentType,
  Ok,
} from "@dust-tt/types";

import { processAndStoreFile } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import {
  fileAttachmentLocation,
  storeContentFragmentText,
} from "@app/lib/resources/content_fragment_resource";
import { FileResource } from "@app/lib/resources/file_resource";

interface ContentFragmentBlob {
  contentType: SupportedFileContentType;
  fileId: ModelId | null;
  sourceUrl: string | null;
  textBytes: number | null;
  title: string;
}

export async function toFileContentFragment(
  auth: Authenticator,
  {
    contentFragment,
    fileName,
  }: {
    contentFragment: ContentFragmentInputWithContentType;
    fileName?: string;
  }
): Promise<Result<ContentFragmentInputWithFileIdType, { message: string }>> {
  const file = await FileResource.makeNew({
    contentType: contentFragment.contentType,
    fileName:
      fileName ??
      "content" + extensionsForContentType(contentFragment.contentType)[0],
    fileSize: contentFragment.content.length,
    userId: auth.user()?.id,
    workspaceId: auth.getNonNullableWorkspace().id,
    useCase: "conversation",
    useCaseMetadata: null,
  });

  const processRes = await processAndStoreFile(auth, {
    file,
    reqOrString: contentFragment.content,
  });

  if (processRes.isErr()) {
    return new Err({
      message:
        `Error creating file for content fragment: ` + processRes.error.message,
    });
  }

  return new Ok({
    title: contentFragment.title,
    url: contentFragment.url,
    fileId: file.sId,
  });
}

export async function getContentFragmentBlob(
  auth: Authenticator,
  conversation: ConversationType,
  cf: ContentFragmentInputType,
  messageId: string
): Promise<Result<ContentFragmentBlob, Error>> {
  const { owner } = conversation;
  const { title, url } = cf;

  if (isContentFragmentInputWithContentType(cf)) {
    const { content, contentType } = cf;

    // TODO(2024-07-03): Remove this once all operations are using files.
    const sourceUrl = isSupportedUploadableContentFragmentType(contentType)
      ? fileAttachmentLocation({
          workspaceId: owner.sId,
          conversationId: conversation.sId,
          messageId,
          contentFormat: "text",
        }).downloadUrl
      : url;

    // Only store the text if it is not a file.
    const textBytes = await storeContentFragmentText({
      workspaceId: owner.sId,
      conversationId: conversation.sId,
      messageId,
      content,
    });

    return new Ok({
      contentType,
      fileId: null,
      sourceUrl: sourceUrl ?? null,
      textBytes,
      title,
    });
  } else {
    const file = await FileResource.fetchById(auth, cf.fileId);
    if (!file) {
      return new Err(new Error("File not found."));
    }

    if (file.useCase !== "conversation") {
      return new Err(new Error("File not meant to be used in a conversation."));
    }

    if (!file.isReady) {
      return new Err(
        new Error(
          "The file is not ready. Please re-upload the file to proceed."
        )
      );
    }

    // Give priority to the URL if it is provided.
    const sourceUrl = url ?? file.getPrivateUrl(auth);
    return new Ok({
      contentType: file.contentType,
      fileId: file.id,
      sourceUrl,
      textBytes: file.fileSize,
      title,
    });
  }
}
