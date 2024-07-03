import type {
  ContentFragmentContextType,
  ContentFragmentInputType,
  ContentFragmentType,
  ConversationType,
  ModelId,
  Result,
  SupportedFileContentType,
} from "@dust-tt/types";
import {
  Err,
  isContentFragmentInputWithContentType,
  isSupportedUploadableContentFragmentType,
  Ok,
} from "@dust-tt/types";

import { getConversationRankVersionLock } from "@app/lib/api/assistant/helpers";
import type { Authenticator } from "@app/lib/auth";
import { Message } from "@app/lib/models/assistant/conversation";
import {
  ContentFragmentResource,
  fileAttachmentLocation,
  storeContentFragmentText,
} from "@app/lib/resources/content_fragment_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { generateModelSId } from "@app/lib/utils";

interface ContentFragmentBlob {
  contentType: SupportedFileContentType;
  fileModelId: ModelId | null;
  sourceUrl: string | null;
  textBytes: number | null;
  title: string;
}

async function getContentFragmentBlob(
  auth: Authenticator,
  conversation: ConversationType,
  cf: ContentFragmentInputType,
  messageId: string
): Promise<Result<ContentFragmentBlob, Error>> {
  const { owner } = conversation;
  const { title, url } = cf;

  if (isContentFragmentInputWithContentType(cf)) {
    const { content, contentType: cfContentType } = cf;

    const sourceUrl = isSupportedUploadableContentFragmentType(cfContentType)
      ? fileAttachmentLocation({
          workspaceId: owner.sId,
          conversationId: conversation.sId,
          messageId,
          contentFormat: "raw",
        }).downloadUrl
      : url;

    const textBytes = await storeContentFragmentText({
      workspaceId: owner.sId,
      conversationId: conversation.sId,
      messageId,
      content,
    });

    return new Ok({
      contentType: cfContentType,
      fileModelId: null,
      sourceUrl,
      textBytes,
      title,
    });
  } else {
    const file = await FileResource.fetchById(auth, cf.fileId);
    if (!file) {
      return new Err(new Error("File not found."));
    }

    // Give priority to the URL if it is provided.
    const sourceUrl = url ?? file.getPublicUrl(auth);
    return new Ok({
      contentType: file.contentType,
      fileModelId: file.id,
      sourceUrl,
      textBytes: null,
      title,
    });
  }
}

// Injects a new content fragment in the conversation.
export async function postNewContentFragment(
  auth: Authenticator,
  conversation: ConversationType,
  cf: ContentFragmentInputType,
  context: ContentFragmentContextType | null
): Promise<Result<ContentFragmentType, Error>> {
  const owner = auth.workspace();
  if (!owner || owner.id !== conversation.owner.id) {
    throw new Error("Invalid auth for conversation.");
  }

  const messageId = generateModelSId();

  const cfBlobRes = await getContentFragmentBlob(
    auth,
    conversation,
    cf,
    messageId
  );
  if (cfBlobRes.isErr()) {
    return cfBlobRes;
  }

  const { contentFragment, messageRow } = await frontSequelize.transaction(
    async (t) => {
      await getConversationRankVersionLock(conversation, t);

      const contentFragment = await ContentFragmentResource.makeNew(
        {
          ...cfBlobRes.value,
          userId: auth.user()?.id,
          userContextProfilePictureUrl: context?.profilePictureUrl,
          userContextEmail: context?.email,
          userContextFullName: context?.fullName,
          userContextUsername: context?.username,
        },
        t
      );
      const nextMessageRank =
        ((await Message.max<number | null, Message>("rank", {
          where: {
            conversationId: conversation.id,
          },
          transaction: t,
        })) ?? -1) + 1;
      const messageRow = await Message.create(
        {
          sId: messageId,
          rank: nextMessageRank,
          conversationId: conversation.id,
          contentFragmentId: contentFragment.id,
        },
        {
          transaction: t,
        }
      );
      return { contentFragment, messageRow };
    }
  );

  return new Ok(
    contentFragment.renderFromMessage({
      auth,
      conversationId: conversation.sId,
      message: messageRow,
    })
  );
}
