import _ from "lodash";

import { getDustAppRunResultsFileTitle } from "@app/components/actions/dust_app_run/utils";
import { getTablesQueryResultsFileTitle } from "@app/components/actions/tables_query/utils";
import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import {
  isFileTypeUpsertableForUseCase,
  processAndUpsertToDataSource,
} from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type {
  ContentFragmentInputWithContentNode,
  ContentFragmentVersion,
  ContentNodeType,
  ConversationType,
  Result,
  SupportedContentFragmentType,
  SupportedFileContentType,
} from "@app/types";
import { Ok, removeNulls } from "@app/types";
import { DATA_SOURCE_NODE_ID } from "@app/types";

export type BaseConversationAttachmentType = {
  title: string;
  contentType: SupportedContentFragmentType;
  contentFragmentVersion: ContentFragmentVersion;
  snippet: string | null;
  generatedTables: string[];
  isIncludable: boolean;
  isSearchable: boolean;
  isQueryable: boolean;
  isExtractable: boolean;
};

export type ConversationContentNodeType = BaseConversationAttachmentType & {
  contentFragmentId: string;
  nodeId: string;
  nodeDataSourceViewId: string;
  nodeType: ContentNodeType;
};

export type ConversationAttachmentType =
  | ConversationFileType
  | ConversationContentNodeType;

export type ConversationFileType = BaseConversationAttachmentType & {
  fileId: string;
};

export function isConversationFileType(
  attachment: ConversationAttachmentType
): attachment is ConversationFileType {
  return "fileId" in attachment;
}

export function isConversationContentNodeType(
  attachment: ConversationAttachmentType
): attachment is ConversationContentNodeType {
  return "contentFragmentId" in attachment;
}

export function isContentFragmentDataSourceNode(
  attachment: ConversationContentNodeType | ContentFragmentInputWithContentNode
): attachment is ConversationContentNodeType & {
  nodeId: typeof DATA_SOURCE_NODE_ID;
} {
  return attachment.nodeId === DATA_SOURCE_NODE_ID;
}

// If updating this function, make sure to update `contentFragmentId` when we render the conversation
// for the model. So there is a consistent way to reference content fragments across different actions.
export function conversationAttachmentId(
  attachment: ConversationAttachmentType
): string {
  if (isConversationFileType(attachment)) {
    return attachment.fileId;
  }
  return attachment.contentFragmentId;
}

export function renderContentFragmentXml({
  file,
  content,
}: {
  file: ConversationAttachmentType;
  content: string | null;
}) {
  let tag =
    `<attachment ` +
    `id="${conversationAttachmentId(file)}" ` +
    `type="${file.contentType}" ` +
    `title="${file.title}" ` +
    `version="${file.contentFragmentVersion}"`;

  if (content) {
    tag += `>\n${content}\n</attachment>`;
  } else {
    tag += "/>";
  }
  return tag;
}

export function getListFilesAttachment({
  file,
}: {
  file: ConversationAttachmentType;
}) {
  let content =
    `<file ` +
    `id="${conversationAttachmentId(file)}" ` +
    `name="${_.escape(file.title)}" ` +
    `type="${file.contentType}" ` +
    `includable="${file.isIncludable}" ` +
    `queryable="${file.isQueryable}" ` +
    `searchable="${file.isSearchable}"`;

  if (file.snippet) {
    content += ` snippet="${_.escape(file.snippet)}"`;
  }

  content += "/>\n";

  return content;
}

export function getDustAppRunResultsFileAttachment({
  resultsFileId,
  resultsFileSnippet,
  resultsFileContentType,
  includeSnippet = true,
  appName,
}: {
  resultsFileId: string | null;
  resultsFileSnippet: string | null;
  resultsFileContentType: SupportedFileContentType;
  includeSnippet: boolean;
  appName: string;
}): string | null {
  if (!resultsFileId || !resultsFileSnippet) {
    return null;
  }

  const attachment =
    `<file ` +
    `id="${resultsFileId}" type="${resultsFileContentType}" title=${getDustAppRunResultsFileTitle(
      { appName, resultsFileContentType }
    )}`;

  if (!includeSnippet) {
    return `${attachment} />`;
  }

  return `${attachment}>\n${resultsFileSnippet}\n</file>`;
}

export function getTablesQueryResultsFileAttachments({
  resultsFileId,
  resultsFileSnippet,
  sectionFileId,
  output,
}: {
  resultsFileId: string | null;
  resultsFileSnippet: string | null;
  sectionFileId: string | null;
  output: Record<string, unknown> | null;
}): string | null {
  if (!resultsFileId || !resultsFileSnippet) {
    return null;
  }

  const fileTitle = getTablesQueryResultsFileTitle({ output });

  const resultsFileAttachment =
    `<file ` +
    `id="${resultsFileId}" type="text/csv" title="${fileTitle}">\n${resultsFileSnippet}\n</file>`;

  let sectionFileAttachment = "";
  if (sectionFileId) {
    sectionFileAttachment =
      `\n<file ` +
      `id="${sectionFileId}" type="application/vnd.dust.section.json" title="${fileTitle} (Results optimized for search)" />`;
  }

  return `${resultsFileAttachment}${sectionFileAttachment}`;
}

// When we send the attachments at the conversation creation, we are missing the useCaseMetadata
// Therefore, we couldn't upsert them to the conversation datasource.
// We now update the useCaseMetadata and upsert them to the conversation datasource.
export async function maybeUpsertFileAttachment(
  auth: Authenticator,
  {
    contentFragments,
    conversation,
  }: {
    contentFragments: (
      | {
          fileId: string;
        }
      | object
    )[];
    conversation: ConversationType;
  }
): Promise<Result<undefined, Error>> {
  const filesIds = removeNulls(
    contentFragments.map((cf) => {
      if ("fileId" in cf) {
        return cf.fileId;
      }
    })
  );

  if (filesIds.length > 0) {
    const fileResources = await FileResource.fetchByIds(auth, filesIds);
    await Promise.all([
      ...fileResources.map(async (fileResource) => {
        if (
          fileResource.useCase === "conversation" &&
          !fileResource.useCaseMetadata
        ) {
          await fileResource.setUseCaseMetadata({
            conversationId: conversation.sId,
          });

          // Only upsert if the file is upsertable.
          if (isFileTypeUpsertableForUseCase(fileResource)) {
            const jitDataSource =
              await getOrCreateConversationDataSourceFromFile(
                auth,
                fileResource
              );
            if (jitDataSource.isErr()) {
              return jitDataSource;
            }

            const r = await processAndUpsertToDataSource(
              auth,
              jitDataSource.value,
              {
                file: fileResource,
              }
            );
            if (r.isErr()) {
              logger.error({
                fileModelId: fileResource.id,
                workspaceId: conversation.owner.sId,
                contentType: fileResource.contentType,
                useCase: fileResource.useCase,
                useCaseMetadata: fileResource.useCaseMetadata,
                message: "Failed to upsert the file.",
                error: r.error,
              });

              return r;
            }
          }
        }
      }),
    ]);
  }
  return new Ok(undefined);
}
