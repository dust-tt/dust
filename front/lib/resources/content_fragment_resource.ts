import type { ContentFragmentType, ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import appConfig from "@app/lib/api/config";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { Message } from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface ContentFragmentResource
  extends ReadonlyAttributesType<ContentFragmentModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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
      ContentFragmentResource.model,
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

  static async fetchMany(ids: Array<ModelId>) {
    const blobs = await ContentFragmentResource.model.findAll({
      where: {
        id: ids,
      },
    });

    return blobs.map(
      // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
      (b: ContentFragmentModel) =>
        new ContentFragmentResource(ContentFragmentResource.model, b.get())
    );
  }

  /**
   * Temporary workaround until we can call this method from the MessageResource.
   * @deprecated use the destroy method.
   */
  delete(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async destroy(
    {
      conversationId,
      messageId,
      workspaceId,
    }: { conversationId: string; messageId: string; workspaceId: string },
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    try {
      const { filePath: textFilePath } = fileAttachmentLocation({
        conversationId,
        workspaceId,
        messageId,
        contentFormat: "text",
      });

      const { filePath: rawFilePath } = fileAttachmentLocation({
        conversationId,
        workspaceId,
        messageId,
        contentFormat: "raw",
      });

      const privateUploadGcs = getPrivateUploadBucket();

      // First, we delete the doc from the file storage.
      await privateUploadGcs.delete(textFilePath, { ignoreNotFound: true });
      await privateUploadGcs.delete(rawFilePath, { ignoreNotFound: true });

      // Then, we delete the record from the DB.
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
      sourceUrl: this.sourceUrl,
      textBytes: this.textBytes,
      title: this.title,
      contentType: this.contentType,
      context: {
        profilePictureUrl: this.userContextProfilePictureUrl,
        fullName: this.userContextFullName,
        email: this.userContextEmail,
        username: this.userContextUsername,
      },
    };
  }

  async update(
    blob: Partial<Attributes<ContentFragmentModel>>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    const [affectedCount, affectedRows] = await this.model.update(blob, {
      where: {
        id: this.id,
      },
      transaction,
      returning: true,
    });
    // Update the current instance with the new values to avoid stale data
    Object.assign(this, affectedRows[0].get());
    return [affectedCount];
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
    internalUrl: `https://storage.googleapis.com/${
      getPrivateUploadBucket().name
    }/${filePath}`,
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
}): Promise<number | null> {
  if (content === "") {
    return null;
  }

  const { filePath } = fileAttachmentLocation({
    workspaceId,
    conversationId,
    messageId,
    contentFormat: "text",
  });

  await getPrivateUploadBucket().uploadRawContentToBucket({
    content,
    contentType: "text/plain",
    filePath,
  });

  return Buffer.byteLength(content);
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
  const { filePath } = fileAttachmentLocation({
    workspaceId,
    conversationId,
    messageId,
    contentFormat: "text",
  });

  return getPrivateUploadBucket().fetchFileContent(filePath);
}
