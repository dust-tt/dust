import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import appConfig from "@app/lib/api/config";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { Message } from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  generateRandomModelSId,
  getResourceNameAndIdFromSId,
} from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type {
  ContentFragmentMessageTypeModel,
  ContentFragmentNodeData,
  ContentFragmentType,
  ContentFragmentVersion,
  ContentNodeType,
  ConversationType,
  ModelConfigurationType,
  ModelId,
  Result,
  SupportedContentFragmentType,
} from "@app/types";
import {
  CoreAPI,
  Err,
  isSupportedImageContentType,
  normalizeError,
  Ok,
} from "@app/types";

export const CONTENT_OUTDATED_MSG =
  "Content is outdated. Please refer to the latest version of this content.";

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

  static async fromMessageId(auth: Authenticator, id: ModelId) {
    const message = await Message.findOne({
      where: {
        id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      include: [{ model: ContentFragmentModel, as: "contentFragment" }],
    });
    if (!message) {
      throw new Error(
        "No message found for the given id when trying to create a ContentFragmentResource"
      );
    }
    return ContentFragmentResource.fromMessage(message);
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

  async renderFromMessage({
    auth,
    conversationId,
    message,
  }: {
    auth: Authenticator;
    conversationId: string;
    message: Message;
  }): Promise<ContentFragmentType> {
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

    let fileStringId: string | null = null;
    let snippet: string | null = null;
    let generatedTables: string[] = [];

    if (this.fileId) {
      const file = await FileResource.fetchByModelIdWithAuth(auth, this.fileId);
      if (file) {
        fileStringId = file.sId;
        snippet = file.snippet;
        generatedTables = file.useCaseMetadata?.generatedTables ?? [];
      }
    }

    const nodeId: string | null = this.nodeId || null;
    const nodeDataSourceViewId: string | null = this.nodeDataSourceViewId
      ? DataSourceViewResource.modelIdToSId({
          id: this.nodeDataSourceViewId,
          workspaceId: owner.id,
        })
      : null;

    const nodeType: ContentNodeType | null = this.nodeType || null;

    // Add contentNodeData
    let contentNodeData: ContentFragmentNodeData | null = null;
    if (
      nodeId &&
      nodeDataSourceViewId &&
      nodeType &&
      this.nodeDataSourceViewId
    ) {
      const dsView = await DataSourceViewModel.findByPk(
        this.nodeDataSourceViewId,
        {
          attributes: [],
          include: [
            {
              model: DataSourceModel,
              as: "dataSourceForView",
              attributes: ["connectorProvider"],
            },
            {
              model: SpaceModel,
              as: "space",
              foreignKey: "vaultId",
              attributes: ["name"],
            },
          ],
        }
      );

      if (!dsView) {
        throw new Error(
          `Content fragment node data not found for node id ${nodeId} and node data source view id ${nodeDataSourceViewId}`
        );
      }

      contentNodeData = {
        nodeId,
        nodeDataSourceViewId,
        nodeType,
        provider: dsView.dataSourceForView.connectorProvider,
        spaceName: dsView.space.name,
      };
    }
    return {
      id: message.id,
      fileId: fileStringId,
      snippet,
      generatedTables,
      nodeId,
      nodeDataSourceViewId,
      nodeType,
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
      contentFragmentId: this.sId,
      contentFragmentVersion: this.version,
      contentNodeData,
      expiredReason: this.expiredReason,
    };
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

export async function renderFromAttachmentId(
  auth: Authenticator,
  {
    contentType,
    excludeImages,
    conversationAttachmentId,
    model,
    title,
    contentFragmentVersion,
  }: {
    contentType: SupportedContentFragmentType;
    excludeImages: boolean;
    conversationAttachmentId: string;
    model: ModelConfigurationType;
    title: string;
    contentFragmentVersion: ContentFragmentVersion;
  }
): Promise<Result<ContentFragmentMessageTypeModel, Error>> {
  // At time of writing, passed resourceId can be either a file or a content fragment.
  const { resourceName } = getResourceNameAndIdFromSId(
    conversationAttachmentId
  ) ?? {
    resourceName: "content_fragment",
  };

  const { fileStringId, nodeId, nodeDataSourceViewId } =
    resourceName === "file"
      ? {
          fileStringId: conversationAttachmentId,
          nodeId: null,
          nodeDataSourceViewId: null,
        }
      : await getIncludeFileIdsFromContentFragmentResourceId(
          auth,
          conversationAttachmentId
        );

  if (isSupportedImageContentType(contentType)) {
    if (excludeImages || !model.supportsVision) {
      return new Ok({
        role: "content_fragment",
        name: `inject_${contentType}`,
        content: [
          {
            type: "text",
            text: renderContentFragmentXml({
              contentFragmentId: null,
              contentType,
              title,
              version: contentFragmentVersion,
              content:
                "[Image content interpreted by a vision-enabled model. " +
                "Description not available in this context.]",
            }),
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
      name: `inject_${contentType}`,
      content: [
        {
          type: "text",
          text: renderContentFragmentXml({
            contentFragmentId: conversationAttachmentId,
            contentType,
            title,
            version: contentFragmentVersion,
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
          contentType,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "No content extracted from file processed version, we are retrieving the original file as a fallback."
      );
      content = await getOriginalFileContent(auth, fileStringId);
    }

    return new Ok({
      role: "content_fragment",
      name: `inject_${contentType}`,
      content: [
        {
          type: "text",
          text: renderContentFragmentXml({
            contentFragmentId: conversationAttachmentId,
            contentType,
            title,
            version: contentFragmentVersion,
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

// Render only a tag to specifiy that a content fragment was injected at a given position except for
// images when the model support them.
export async function renderLightContentFragmentForModel(
  auth: Authenticator,
  message: ContentFragmentType,
  conversation: ConversationType,
  model: ModelConfigurationType,
  {
    excludeImages,
  }: {
    excludeImages: boolean;
  }
): Promise<ContentFragmentMessageTypeModel> {
  const { contentType, sId, title, contentFragmentVersion } = message;

  const contentFragment = await ContentFragmentResource.fromMessageId(
    auth,
    message.id
  );
  if (!contentFragment) {
    throw new Error(`Content fragment not found for message ${sId}`);
  }

  if (contentFragment.expiredReason) {
    return {
      role: "content_fragment",
      name: `attach_${contentType}`,
      content: [
        {
          type: "text",
          text: `The content of this file is no longer available. Reason: ${contentFragment.expiredReason}`,
        },
      ],
    };
  }

  const { fileId: fileModelId } = contentFragment;

  const fileStringId = fileModelId
    ? FileResource.modelIdToSId({
        id: fileModelId,
        workspaceId: conversation.owner.id,
      })
    : null;

  if (fileStringId && isSupportedImageContentType(contentType)) {
    if (excludeImages || !model.supportsVision) {
      return {
        role: "content_fragment",
        name: `inject_${contentType}`,
        content: [
          {
            type: "text",
            text: renderContentFragmentXml({
              contentFragmentId: contentFragment.sId,
              contentType,
              title,
              version: contentFragmentVersion,
              content:
                "[Image content interpreted by a vision-enabled model. " +
                "Description not available in this context.]",
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
      ],
    };
  }

  return {
    role: "content_fragment",
    name: `attach_${contentType}`,
    content: [
      {
        type: "text",
        text: renderContentFragmentXml({
          // Use fileId as contentFragmentId to provide a consistent identifier for the model
          // to reference content fragments across different actions like include_file.
          contentFragmentId: fileStringId ?? contentFragment.sId,
          contentType,
          title,
          version: contentFragmentVersion,
          content: null,
        }),
      },
    ],
  };
}

function renderContentFragmentXml({
  contentFragmentId,
  contentType,
  title,
  version,
  content,
}: {
  contentFragmentId: string | null;
  contentType: string;
  title: string;
  version: ContentFragmentVersion;
  content: string | null;
}) {
  let tag = `<attachment id="${contentFragmentId}" type="${contentType}" title="${title}" version="${version}"`;
  if (content) {
    tag += `>\n${content}\n</attachment>`;
  } else {
    tag += "/>";
  }
  return tag;
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
