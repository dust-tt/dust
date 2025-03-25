import type { DustMimeType } from "@dust-tt/client";

import config from "@app/lib/api/config";
import { getContentNodeFromCoreNode } from "@app/lib/api/content_nodes";
import type { ProcessAndStoreFileError } from "@app/lib/api/files/upload";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { getSearchFilterFromDataSourceViews } from "@app/lib/search";
import logger from "@app/logger/logger";
import type {
  ContentFragmentInputWithContentNode,
  ContentFragmentInputWithFileIdType,
  ContentFragmentInputWithInlinedContent,
  ModelId,
  Result,
  SupportedFileContentType,
} from "@app/types";
import {
  CoreAPI,
  Err,
  extensionsForContentType,
  isContentFragmentInputWithContentNode,
  isContentFragmentInputWithFileId,
  isSupportedContentNodeFragmentContentType,
  Ok,
} from "@app/types";

interface ContentFragmentBlob {
  contentType: DustMimeType | SupportedFileContentType;
  fileId: ModelId | null;
  nodeId: string | null;
  nodeDataSourceViewId: ModelId | null;
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
    contentFragment: ContentFragmentInputWithInlinedContent;
    fileName?: string;
  }
): Promise<
  Result<ContentFragmentInputWithFileIdType, ProcessAndStoreFileError>
> {
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
      name: "dust_error",
      message:
        `Error creating file for content fragment: ` + processRes.error.message,
      code: processRes.error.code,
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
  cf: ContentFragmentInputWithFileIdType | ContentFragmentInputWithContentNode
): Promise<Result<ContentFragmentBlob, Error>> {
  const { title, url } = cf;

  if (isContentFragmentInputWithFileId(cf)) {
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
      nodeId: null,
      nodeDataSourceViewId: null,
      title,
    });
  } else if (isContentFragmentInputWithContentNode(cf)) {
    // For ContentFragmentInputWithContentNode we retrieve the content node from core to validate
    // that it exists and that we have access to it + retrieve its contentType and nodeType.
    const dsView = await DataSourceViewResource.fetchById(
      auth,
      cf.nodeDataSourceViewId
    );
    // If dsView is not defined it means it does not exist of we don't have access to it.
    if (!dsView) {
      return new Err(
        new Error("Unknown data source view for content fragment input")
      );
    }

    const searchFilter = getSearchFilterFromDataSourceViews(
      auth.getNonNullableWorkspace(),
      [dsView],
      {
        excludedNodeMimeTypes: [],
        includeDataSources: false,
        viewType: "all",
        nodeIds: [cf.nodeId],
      }
    );

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const searchRes = await coreAPI.searchNodes({
      filter: searchFilter,
    });
    if (searchRes.isErr()) {
      return new Err(
        new Error("Unknown content node for content fragment input")
      );
    }
    const [coreContentNode] = searchRes.value.nodes;
    if (!coreContentNode) {
      return new Err(
        new Error("Unknown content node for content fragment input")
      );
    }
    const contentNode = getContentNodeFromCoreNode(coreContentNode, "all");

    if (!isSupportedContentNodeFragmentContentType(contentNode.mimeType)) {
      return new Err(
        new Error(
          "Unsupported content node fragment mime type: " + contentNode.mimeType
        )
      );
    }

    console.log(
      ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> HERE",
      cf,
      contentNode
    );
    return new Ok({
      nodeId: contentNode.internalId,
      nodeDataSourceViewId: getResourceIdFromSId(cf.nodeDataSourceViewId),
      contentType: contentNode.mimeType,
      sourceUrl: contentNode.sourceUrl,
      textBytes: null,
      fileId: null,
      title,
    });
  } else {
    return new Err(new Error("Invalid content fragment input."));
  }
}
