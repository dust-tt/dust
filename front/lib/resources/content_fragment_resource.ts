import type {
  ContentFragmentMessageTypeModel,
  ContentFragmentType,
  ConversationType,
  ModelConfigurationType,
  ModelId,
  Result,
  WorkspaceType,
} from "@dust-tt/types";
import { Err, isSupportedImageContentFragmentType, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import appConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { Message } from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import logger from "@app/logger/logger";

const MAX_BYTE_SIZE_CSV_RENDER_FULL_CONTENT = 500 * 1024; // 500 KB

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
  delete(): Promise<Result<undefined, Error>> {
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

  async setSourceUrl(sourceUrl: string | null) {
    return this.update({ sourceUrl });
  }

  renderFromMessage({
    auth,
    conversationId,
    message,
  }: {
    auth: Authenticator;
    conversationId: string;
    message: Message;
  }): ContentFragmentType {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Authenticator must have a workspace to render a content fragment"
      );
    }

    const location = fileAttachmentLocation({
      workspaceId: owner.sId,
      conversationId,
      messageId: message.sId,
      contentFormat: "text",
    });

    return {
      id: message.id,
      fileId: this.fileId
        ? FileResource.modelIdToSId({ id: this.fileId, workspaceId: owner.id })
        : null,
      sId: message.sId,
      created: message.createdAt.getTime(),
      type: "content_fragment",
      visibility: message.visibility,
      version: message.version,
      sourceUrl: this.sourceUrl,
      textUrl: location.downloadUrl,
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
}

// TODO(2024-03-22 pr): Move as method of message resource after migration of
// message to resource pattern
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
    downloadUrl: `${appConfig.getClientFacingUrl()}/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/raw_content_fragment?format=${contentFormat}`,
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

export async function getProcessedFileContent(
  workspace: WorkspaceType,
  fileId: string
): Promise<string> {
  const fileCloudStoragePath = FileResource.getCloudStoragePathForId({
    fileId,
    workspaceId: workspace.sId,
    version: "processed",
  });

  return getPrivateUploadBucket().fetchFileContent(fileCloudStoragePath);
}

export async function getSnippetFileContent(
  workspace: WorkspaceType,
  fileId: string
): Promise<string> {
  const fileCloudStoragePath = FileResource.getCloudStoragePathForId({
    fileId,
    workspaceId: workspace.sId,
    version: "snippet",
  });

  return getPrivateUploadBucket().fetchFileContent(fileCloudStoragePath);
}

async function getSignedUrlForProcessedContent(
  workspace: WorkspaceType,
  fileId: string
): Promise<string> {
  const fileCloudStoragePath = FileResource.getCloudStoragePathForId({
    fileId,
    workspaceId: workspace.sId,
    version: "processed",
  });

  return getPrivateUploadBucket().getSignedUrl(fileCloudStoragePath);
}

async function renderFromFileId(
  workspace: WorkspaceType,
  {
    contentType,
    excludeImages,
    fileId,
    model,
    title,
    textBytes,
  }: {
    contentType: string;
    excludeImages: boolean;
    fileId: string;
    model: ModelConfigurationType;
    title: string;
    textBytes: number | null;
  }
): Promise<Result<ContentFragmentMessageTypeModel, Error>> {
  if (isSupportedImageContentFragmentType(contentType)) {
    if (excludeImages || !model.supportsVision) {
      return new Ok({
        role: "content_fragment",
        name: `inject_${contentType}`,
        content: [
          {
            type: "text",
            text: `<attachment id="${fileId}" type="${contentType} title="${title}">[Image content interpreted by a vision-enabled model. Description not available in this context.]</attachment>`,
          },
        ],
      });
    }

    const signedUrl = await getSignedUrlForProcessedContent(workspace, fileId);

    return new Ok({
      role: "content_fragment",
      name: `inject_${contentType}`,
      content: [
        {
          type: "image_url",
          image_url: {
            url: signedUrl,
          },
        },
      ],
    });
  } else {
    const shouldRetrieveSnippetVersion =
      contentType === "text/csv" &&
      textBytes &&
      textBytes > MAX_BYTE_SIZE_CSV_RENDER_FULL_CONTENT;

    const content = shouldRetrieveSnippetVersion
      ? await getSnippetFileContent(workspace, fileId)
      : await getProcessedFileContent(workspace, fileId);

    return new Ok({
      role: "content_fragment",
      name: `inject_${contentType}`,
      content: [
        {
          type: "text",
          text: `<attachment id="${fileId}" type="${contentType}" title="${title}">\n${content}\n</attachment>`,
        },
      ],
    });
  }
}

export async function renderContentFragmentForModel(
  message: ContentFragmentType,
  conversation: ConversationType,
  model: ModelConfigurationType,
  {
    excludeImages,
  }: {
    excludeImages: boolean;
  }
): Promise<Result<ContentFragmentMessageTypeModel, Error>> {
  const { contentType, fileId, sId, title, textBytes } = message;

  try {
    // Render content based on fragment type:
    // - If the fragment is a file, render it from the file. For large CSV files, render a snippet version (CSV schema).
    // - If the fragment is not a file (public API), always render the full content.
    if (fileId) {
      return await renderFromFileId(conversation.owner, {
        contentType,
        excludeImages,
        fileId,
        model,
        title,
        textBytes,
      });
    } else {
      const content = await getContentFragmentText({
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        messageId: sId,
      });

      return new Ok({
        role: "content_fragment",
        name: `inject_${contentType}`,
        content: [
          {
            type: "text",
            text: `<attachment id="${fileId}" type="${contentType}" title="${title}">\n${content}\n</attachment>`,
          },
        ],
      });
    }
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        messageId: sId,
      },
      "Failed to retrieve content fragment text"
    );

    return new Err(new Error("Failed to retrieve content fragment text"));
  }
}
