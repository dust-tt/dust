import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import { isPastedFile } from "@app/components/assistant/conversation/input_bar/pasted_utils";
import type {
  ConversationAttachmentType,
  LargePasteType,
} from "@app/lib/api/assistant/conversation/attachments";
import {
  conversationAttachmentId,
  getAttachmentFromContentFragment,
  renderAttachmentXml,
  renderLargePasteXml,
} from "@app/lib/api/assistant/conversation/attachments";
import appConfig from "@app/lib/api/config";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { MessageModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  generateRandomModelSId,
  getResourceNameAndIdFromSId,
} from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { ContentFragmentMessageTypeModel } from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type {
  BaseContentFragmentType,
  ContentFragmentType,
  ContentFragmentVersion,
  ContentNodeContentFragmentType,
  FileContentFragmentType,
} from "@app/types/content_fragment";
import type { ContentNodeType } from "@app/types/core/content_node";
import { CoreAPI } from "@app/types/core/core_api";
import { isLLMVisionSupportedImageContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";

export const CONTENT_OUTDATED_MSG =
  "Content is outdated. Please refer to the latest version of this content.";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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

  getContentFragmentType(): ContentFragmentType["contentFragmentType"] {
    if (this.nodeType) {
      return "content_node";
    }

    return "file";
  }

  static async makeNew(
    blob: Omit<CreationAttributes<ContentFragmentModel>, "sId" | "version">,
    transaction?: Transaction
  ) {
    const contentFragment = await ContentFragmentModel.create(
      {
        ...blob,
        sId: generateRandomModelSId("cf"),
        version: "latest",
        workspaceId: blob.workspaceId,
      },
      {
        transaction,
      }
    );

    return new this(ContentFragmentModel, contentFragment.get());
  }

  static async makeNewVersion(
    sId: string,
    blob: Omit<CreationAttributes<ContentFragmentModel>, "sId" | "version">,
    transaction?: Transaction
  ): Promise<ContentFragmentResource> {
    const t = transaction ?? (await frontSequelize.transaction());

    try {
      // First, mark all existing content fragments with this sId as superseded
      await ContentFragmentModel.update(
        { version: "superseded" },
        {
          where: { sId },
          transaction: t,
        }
      );

      // Create new content fragment with "latest" version
      const contentFragment = await ContentFragmentModel.create(
        {
          ...blob,
          sId,
          version: "latest",
          workspaceId: blob.workspaceId,
        },
        {
          transaction: t,
        }
      );

      // If we created our own transaction, commit it
      if (!transaction) {
        await t.commit();
      }

      return new this(ContentFragmentModel, contentFragment.get());
    } catch (error) {
      // If we created our own transaction, roll it back
      if (!transaction) {
        await t.rollback();
      }
      throw error;
    }
  }

  static fromMessage(
    message: MessageModel & { contentFragment?: ContentFragmentModel }
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

  static async fromStringIdAndVersion(
    auth: Authenticator,
    sId: string,
    version: ContentFragmentVersion
  ) {
    const contentFragment = await ContentFragmentModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId,
        version,
      },
    });
    if (!contentFragment) {
      throw new Error(
        `Content fragment not found for sId ${sId} and version ${version}`
      );
    }
    return new ContentFragmentResource(
      ContentFragmentResource.model,
      contentFragment.get()
    );
  }

  static async fetchManyByModelIds(auth: Authenticator, ids: Array<ModelId>) {
    const blobs = await ContentFragmentResource.model.findAll({
      where: {
        id: ids,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return blobs.map(
      // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
      (b: ContentFragmentModel) =>
        new ContentFragmentResource(ContentFragmentResource.model, b.get())
    );
  }

  /**
   * Batch render content fragments from messages with optimized file fetching.
   * This method fetches all files in a single query to avoid N+1 queries.
   *
   * This is the recommended way to render content fragments.
   */
  static async batchRenderFromMessages(
    auth: Authenticator,
    {
      conversationId,
      messages,
    }: {
      conversationId: string;
      messages: MessageModel[];
    }
  ): Promise<ContentFragmentType[]> {
    const messagesWithContentFragment = messages.filter(
      (m) => !!m.contentFragment
    );

    if (messagesWithContentFragment.length === 0) {
      return [];
    }

    // Batch fetch all files to avoid N+1 queries.
    const fileIds = removeNulls(
      messagesWithContentFragment.map((m) => m.contentFragment?.fileId)
    );
    const files = await FileResource.fetchByModelIdsWithAuth(auth, fileIds);
    const filesByModelId = new Map(files.map((f) => [f.id, f]));

    // Render all content fragments with pre-fetched files.
    return Promise.all(
      messagesWithContentFragment.map(async (message: MessageModel) => {
        const contentFragment = ContentFragmentResource.fromMessage(message);
        const file = contentFragment.fileId
          ? filesByModelId.get(contentFragment.fileId)
          : undefined;

        return contentFragment.renderFromMessage(auth, {
          conversationId,
          message,
          file,
        });
      })
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
      return new Err(normalizeError(err));
    }
  }

  async setSourceUrl(sourceUrl: string | null) {
    return this.update({ sourceUrl });
  }

  /**
   * Use batchRenderFromMessages instead to avoid N+1 queries.
   */
  async renderFromMessage(
    auth: Authenticator,
    {
      conversationId,
      message,
      file,
    }: {
      conversationId: string;
      message: MessageModel;
      file?: FileResource;
    }
  ): Promise<ContentFragmentType> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Authenticator must have a workspace to render a content fragment"
      );
    }

    const contentFragmentType = this.getContentFragmentType();

    const baseContentFragment: BaseContentFragmentType = {
      type: "content_fragment",
      id: message.id,
      sId: message.sId,
      created: message.createdAt.getTime(),
      visibility: message.visibility,
      version: message.version,
      rank: message.rank,
      sourceUrl: this.sourceUrl,
      title: this.title,
      contentType: this.contentType,
      context: {
        profilePictureUrl: this.userContextProfilePictureUrl,
        fullName: this.userContextFullName,
        email: this.userContextEmail,
        username: this.userContextUsername,
      },
      contentFragmentId: this.sId,
      contentFragmentVersion: this.version,
      expiredReason: this.expiredReason,
    };

    if (this.expiredReason) {
      if (contentFragmentType === "file") {
        return {
          ...baseContentFragment,
          contentFragmentType: "file",
          expiredReason: this.expiredReason,
          fileId: null,
          snippet: null,
          generatedTables: [],
          textUrl: null,
          textBytes: null,
          sourceProvider: null,
          sourceIcon: null,
        };
      } else if (contentFragmentType === "content_node") {
        return {
          ...baseContentFragment,
          contentFragmentType: "content_node",
          expiredReason: this.expiredReason,
          nodeId: null,
          nodeDataSourceViewId: null,
          nodeType: null,
          contentNodeData: null,
        };
      } else {
        assertNever(contentFragmentType);
      }
    }

    if (contentFragmentType === "file") {
      const location = fileAttachmentLocation({
        workspaceId: owner.sId,
        conversationId,
        messageId: message.sId,
        contentFormat: "text",
      });
      let fileStringId: string | null = null;
      let snippet: string | null = null;
      let generatedTables: string[] = [];
      let sourceProvider: string | null = null;
      let sourceIcon: string | null = null;

      // Use pre-fetched file if provided, otherwise fetch it (for backward compatibility)
      const fileResource =
        file ??
        (this.fileId
          ? await FileResource.fetchByModelIdWithAuth(auth, this.fileId)
          : null);

      if (fileResource) {
        fileStringId = fileResource.sId;
        snippet = fileResource.snippet;
        generatedTables = fileResource.useCaseMetadata?.generatedTables ?? [];
        sourceProvider = fileResource.useCaseMetadata?.sourceProvider ?? null;
        sourceIcon = fileResource.useCaseMetadata?.sourceIcon ?? null;
      }

      return {
        ...baseContentFragment,
        contentFragmentType: "file",
        expiredReason: null,
        fileId: fileStringId,
        snippet,
        generatedTables,
        textUrl: location.downloadUrl,
        textBytes: this.textBytes,
        sourceProvider,
        sourceIcon,
      } satisfies FileContentFragmentType;
    } else if (contentFragmentType === "content_node") {
      assert(
        this.nodeId,
        `Invalid content node content fragment (sId: ${this.sId})`
      );
      assert(
        this.nodeDataSourceViewId,
        `Invalid content node content fragment (sId: ${this.sId})`
      );
      assert(
        this.nodeType,
        `Invalid content node content fragment (sId: ${this.sId})`
      );

      const nodeId: string = this.nodeId;
      const nodeDataSourceViewId: string = DataSourceViewResource.modelIdToSId({
        id: this.nodeDataSourceViewId,
        workspaceId: owner.id,
      });
      const nodeType: ContentNodeType = this.nodeType;

      const dsViews = await DataSourceViewResource.fetchByModelIds(auth, [
        this.nodeDataSourceViewId,
      ]);
      assert(
        dsViews.length === 1,
        `Data source view not found for content node content fragment (sId: ${this.sId})`
      );

      const [dsView] = dsViews;

      const contentNodeData = {
        nodeId,
        nodeDataSourceViewId,
        nodeType: this.nodeType,
        provider: dsView.dataSource.connectorProvider,
        spaceName: dsView.space.name,
      };

      return {
        ...baseContentFragment,
        contentFragmentType: "content_node",
        expiredReason: null,
        nodeId,
        nodeDataSourceViewId,
        nodeType,
        contentNodeData,
      } satisfies ContentNodeContentFragmentType;
    } else {
      assertNever(contentFragmentType);
    }
  }
}

export function getContentFragmentBaseCloudStorageForWorkspace(
  workspaceId: string
) {
  return `content_fragments/w/${workspaceId}/assistant/conversations/`;
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
  const filePath = `${getContentFragmentBaseCloudStorageForWorkspace(workspaceId)}${conversationId}/content_fragment/${messageId}/${contentFormat}`;

  return {
    filePath,
    internalUrl: `https://storage.googleapis.com/${getPrivateUploadBucket().name}/${filePath}`,
    downloadUrl: `${appConfig.getClientFacingUrl()}/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/raw_content_fragment?format=${contentFormat}`,
  };
}

async function getOriginalFileContent(
  auth: Authenticator,
  fileId: string
): Promise<string> {
  const fileCloudStoragePath = FileResource.getCloudStoragePathForId({
    fileId,
    workspaceId: auth.getNonNullableWorkspace().sId,
    version: "original",
  });

  return getPrivateUploadBucket().fetchFileContent(fileCloudStoragePath);
}

async function getProcessedFileContent(
  auth: Authenticator,
  fileId: string
): Promise<string> {
  const fileCloudStoragePath = FileResource.getCloudStoragePathForId({
    fileId,
    workspaceId: auth.getNonNullableWorkspace().sId,
    version: "processed",
  });

  return getPrivateUploadBucket().fetchFileContent(fileCloudStoragePath);
}

async function getSignedUrlForProcessedContent(
  auth: Authenticator,
  fileId: string
): Promise<string> {
  const fileCloudStoragePath = FileResource.getCloudStoragePathForId({
    fileId,
    workspaceId: auth.getNonNullableWorkspace().sId,
    version: "processed",
  });

  return getPrivateUploadBucket().getSignedUrl(fileCloudStoragePath);
}

export async function getContentFragmentFromAttachmentFile(
  auth: Authenticator,
  {
    attachment,
    excludeImages,
    model,
  }: {
    attachment: ConversationAttachmentType;
    excludeImages: boolean;
    model: ModelConfigurationType;
  }
): Promise<Result<ContentFragmentMessageTypeModel, Error>> {
  // At time of writing, passed resourceId can be either a file or a content fragment.
  // TODO(durable agents): check if this is actually true (seems false)

  const { resourceName } = getResourceNameAndIdFromSId(
    conversationAttachmentId(attachment)
  ) ?? {
    resourceName: "content_fragment",
  };

  const { fileStringId, nodeId, nodeDataSourceViewId } =
    resourceName === "file"
      ? {
          fileStringId: conversationAttachmentId(attachment),
          nodeId: null,
          nodeDataSourceViewId: null,
        }
      : await getIncludeFileIdsFromContentFragmentResourceId(
          auth,
          conversationAttachmentId(attachment)
        );

  if (isLLMVisionSupportedImageContentType(attachment.contentType)) {
    if (excludeImages || !model.supportsVision) {
      return new Ok({
        role: "content_fragment",
        name: `inject_${attachment.contentType}`,
        content: [
          {
            type: "text",
            text: renderAttachmentXml({ attachment }),
          },
        ],
      });
    }

    if (!fileStringId) {
      throw new Error(
        `Unreachable code path: fileStringId is null. This would mean that the content fragment is a content node image, but we don't allow images as content nodes yet.`
      );
    }

    const signedUrl = await getSignedUrlForProcessedContent(auth, fileStringId);

    return new Ok({
      role: "content_fragment",
      name: `inject_${attachment.contentType}`,
      content: [
        {
          type: "image_url",
          image_url: {
            url: signedUrl,
          },
        },
      ],
    });
  } else if (nodeId && nodeDataSourceViewId) {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    const [dataSourceView] = await DataSourceViewResource.fetchByModelIds(
      auth,
      [nodeDataSourceViewId]
    );
    if (!dataSourceView) {
      throw new Error(
        `Data source view not found for id ${nodeDataSourceViewId}`
      );
    }

    const { dataSource } = dataSourceView;

    const documentRes = await coreAPI.getDataSourceDocument({
      dataSourceId: dataSource.dustAPIDataSourceId,
      documentId: nodeId,
      projectId: dataSource.dustAPIProjectId,
    });

    if (documentRes.isErr()) {
      return new Err(
        new Error(
          `Failed to retrieve document for content node ${nodeId} in data source ${nodeDataSourceViewId}`
        )
      );
    }

    const document = documentRes.value;

    return new Ok({
      role: "content_fragment",
      name: `inject_${attachment.contentType}`,
      content: [
        {
          type: "text",
          text: renderAttachmentXml({
            attachment,
            content: document.document.text ?? null,
          }),
        },
      ],
    });
  } else if (fileStringId) {
    let content = await getProcessedFileContent(auth, fileStringId);

    if (!content) {
      logger.warn(
        {
          fileId: fileStringId,
          contentType: attachment.contentType,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "No content extracted from file processed version, we are retrieving the original file as a fallback."
      );
      content = await getOriginalFileContent(auth, fileStringId);
    }

    // Check if this is a pasted content (large paste) - use simplified XML format
    if (isPastedFile(attachment.contentType)) {
      const largePaste: LargePasteType = {
        fileId: fileStringId,
        title: attachment.title,
      };

      return new Ok({
        role: "content_fragment",
        name: `inject_pasted_content`,
        content: [
          {
            type: "text",
            text: renderLargePasteXml({
              largePaste,
              content,
            }),
          },
        ],
      });
    }

    return new Ok({
      role: "content_fragment",
      name: `inject_${attachment.contentType}`,
      content: [
        {
          type: "text",
          text: renderAttachmentXml({
            attachment,
            content,
          }),
        },
      ],
    });
  } else {
    throw new Error(
      `Unreachable: fileId === null and nodeId / nodeDataSourceViewId === null either.`
    );
  }
}

// Render only a tag to specify that a content fragment was injected at a given position except for
// images when the model support them.
export async function renderLightContentFragmentForModel(
  auth: Authenticator,
  message: ContentFragmentType,
  model: ModelConfigurationType,
  {
    excludeImages,
  }: {
    excludeImages: boolean;
  }
): Promise<ContentFragmentMessageTypeModel | null> {
  const { contentType } = message;

  if (message.expiredReason) {
    return {
      role: "content_fragment",
      name: `attach_${contentType}`,
      content: [
        {
          type: "text",
          text: `The content of this file is no longer available. Reason: ${message.expiredReason}`,
        },
      ],
    };
  }

  const attachment = getAttachmentFromContentFragment(message);
  if (!attachment) {
    return null;
  }

  // Get fileId directly from the message based on content fragment type.
  const fileStringId =
    message.contentFragmentType === "file" ? message.fileId : null;

  // Check if this is pasted content - render with simplified format
  if (fileStringId && isPastedFile(contentType)) {
    const largePaste: LargePasteType = {
      fileId: fileStringId,
      title: attachment.title,
    };

    return {
      role: "content_fragment",
      name: `attach_pasted_content`,
      content: [
        {
          type: "text",
          text: renderLargePasteXml({
            largePaste,
            content: attachment.snippet ?? "",
          }),
        },
      ],
    };
  }

  if (fileStringId && isLLMVisionSupportedImageContentType(contentType)) {
    if (excludeImages || !model.supportsVision) {
      return {
        role: "content_fragment",
        name: `inject_${contentType}`,
        content: [
          {
            type: "text",
            text: renderAttachmentXml({
              attachment,
              content:
                "[Image content interpreted by a vision-enabled model. " +
                "Description not available in this context.",
            }),
          },
        ],
      };
    }

    const signedUrl = await getSignedUrlForProcessedContent(auth, fileStringId);

    return {
      role: "content_fragment",
      name: `inject_${contentType}`,
      content: [
        {
          type: "image_url",
          image_url: {
            url: signedUrl,
          },
        },
        {
          type: "text",
          text: renderAttachmentXml({
            attachment,
          }),
        },
      ],
    };
  }

  return {
    role: "content_fragment",
    name: `attach_${contentType}`,
    content: [
      {
        type: "text",
        text: renderAttachmentXml({
          // Use fileId as contentFragmentId to provide a consistent identifier for the model
          // to reference content fragments across different actions like include_file.
          attachment,
        }),
      },
    ],
  };
}

async function getIncludeFileIdsFromContentFragmentResourceId(
  auth: Authenticator,
  resourceId: string
) {
  const contentFragment = await ContentFragmentResource.fromStringIdAndVersion(
    auth,
    resourceId,
    "latest"
  );
  if (!contentFragment) {
    throw new Error(`Content fragment not found for sId ${resourceId}`);
  }

  if (!contentFragment.fileId) {
    return {
      fileStringId: null,
      nodeId: contentFragment.nodeId,
      nodeDataSourceViewId: contentFragment.nodeDataSourceViewId,
    };
  }

  const fileStringId = FileResource.modelIdToSId({
    id: contentFragment.fileId,
    workspaceId: auth.getNonNullableWorkspace().id,
  });

  return { fileStringId, nodeId: null, nodeDataSourceViewId: null };
}
