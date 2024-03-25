import type { ContentFragmentType, ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { Storage } from "@google-cloud/storage";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import appConfig from "@app/lib/api/config";
import { Message } from "@app/lib/models";
import { BaseResource } from "@app/lib/resources/base_resource";
import { gcsConfig } from "@app/lib/resources/storage/config";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ContentFragmentResource
  extends ReadonlyAttributesType<ContentFragmentModel> {}
export class ContentFragmentResource extends BaseResource<ContentFragmentModel> {
  static model: ModelStatic<ContentFragmentModel> = ContentFragmentModel;

  // TODO(2024-02-20 flav): Delete Model from the constructor, once `update` has been migrated.
  constructor(
    model: ModelStatic<ContentFragmentModel>,
    blob: Attributes<ContentFragmentModel>
  ) {
    super(ContentFragmentModel, blob);
  }

  static async makeNew(
    blob: CreationAttributes<ContentFragmentModel>,
    transaction?: Transaction
  ) {
    const contentFragment = await ContentFragmentModel.create(
      {
        ...blob,
      },
      {
        transaction,
      }
    );

    return new this(ContentFragmentModel, contentFragment.get());
  }

  static fromMessage(
    message: Message & { contentFragment?: ContentFragmentModel }
  ) {
    if (!message.contentFragment) {
      throw new Error(
        "ContentFragmentResource.fromMessage must be called with a content fragment"
      );
    }
    return new ContentFragmentResource(
      ContentFragmentModel,
      message.contentFragment.get()
    );
  }

  static async fromMessageId(id: ModelId) {
    const message = await Message.findByPk(id, {
      include: [{ model: ContentFragmentModel, as: "contentFragment" }],
    });
    if (!message) {
      throw new Error(
        "No message found for the given id when trying to create a ContentFragmentResource"
      );
    }
    return ContentFragmentResource.fromMessage(message);
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  renderFromMessage(message: Message): ContentFragmentType {
    return {
      id: message.id,
      sId: message.sId,
      created: message.createdAt.getTime(),
      type: "content_fragment",
      visibility: message.visibility,
      version: message.version,
      title: this.title,
      content: this.content,
      url: this.url,
      sourceUrl: this.sourceUrl,
      textBytes: this.textBytes,
      contentType: this.contentType,
      context: {
        profilePictureUrl: this.userContextProfilePictureUrl,
        fullName: this.userContextFullName,
        email: this.userContextEmail,
        username: this.userContextUsername,
      },
    };
  }
}

// TODO(2024-03-22 pr): Move as method of message resource after migration of
// message to resource pattern at which time the method should only apply to
// messages that are content fragments with type file_attachment
export function fileAttachmentLocation({
  workspaceId,
  conversationId,
  messageId,
  contentFormat,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  contentFormat: "raw" | "text";
}) {
  const filePath = `content_fragments/w/${workspaceId}/assistant/conversations/${conversationId}/content_fragment/${messageId}/${contentFormat}`;
  return {
    filePath,
    internalUrl: `https://storage.googleapis.com/${gcsConfig.getGcsPrivateUploadsBucket()}/${filePath}`,
    downloadUrl: `${appConfig.getAppUrl()}/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/raw_content_fragment`,
  };
}

export async function storeContentFragmentText({
  workspaceId,
  conversationId,
  messageId,
  content,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  content: string;
}): Promise<string | null> {
  if (content === "") {
    return null;
  }

  const { filePath, internalUrl } = fileAttachmentLocation({
    workspaceId,
    conversationId,
    messageId,
    contentFormat: "text",
  });
  const storage = new Storage({
    keyFilename: appConfig.getServiceAccount(),
  });

  const bucket = storage.bucket(gcsConfig.getGcsPrivateUploadsBucket());
  const gcsFile = bucket.file(filePath);

  await gcsFile.save(content, {
    contentType: "text/plain",
  });

  return internalUrl;
}

export async function getContentFragmentText({
  workspaceId,
  conversationId,
  messageId,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
}): Promise<string> {
  const storage = new Storage({
    keyFilename: appConfig.getServiceAccount(),
  });

  const { filePath } = fileAttachmentLocation({
    workspaceId,
    conversationId,
    messageId,
    contentFormat: "text",
  });

  const bucket = storage.bucket(gcsConfig.getGcsPrivateUploadsBucket());
  const gcsFile = bucket.file(filePath);

  const [content] = await gcsFile.download();
  return content.toString();
}
