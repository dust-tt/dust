import _ from "lodash";

import {
  DEFAULT_CONVERSATION_EXTRACT_ACTION_NAME,
  DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_NAME,
  DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
  DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
  DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import type { ExtractActionBlob } from "@app/lib/actions/types";
import { BaseAction } from "@app/lib/actions/types";
import type {
  AgentMessageType,
  ContentFragmentInputWithContentNode,
  ContentFragmentVersion,
  ContentNodeType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  SupportedContentFragmentType,
} from "@app/types";
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

export type ConversationFileType = BaseConversationAttachmentType & {
  fileId: string;
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

type ConversationListFilesActionBlob =
  ExtractActionBlob<ConversationListFilesActionType>;

export class ConversationListFilesActionType extends BaseAction {
  readonly id: ModelId = -1;
  readonly agentMessageId: ModelId;
  readonly files: ConversationAttachmentType[];
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly type = "conversation_list_files_action";

  constructor(blob: ConversationListFilesActionBlob) {
    super(blob.id, blob.type);

    this.agentMessageId = blob.agentMessageId;
    this.files = blob.files;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name:
        this.functionCallName ?? DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
      arguments: JSON.stringify({}),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    let content =
      `When a user attaches a file to the conversation, an <attachment> tag marks its position in the conversation history. ` +
      `This tag indicates when the file was attached but does not contain its content. ` +
      `Files attached to the conversation are listed below with their content type and status (includable, queryable, searchable):\n\n` +
      `// includable: full content can be retrieved using \`${DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_NAME}\`\n` +
      `// queryable: represents tabular data that can be queried alongside other queryable files' tabular data using \`${DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME}\`\n` +
      `// searchable: content can be searched alongside other searchable files' content using \`${DEFAULT_CONVERSATION_SEARCH_ACTION_NAME}\`\n` +
      `// extractable: files can also be processed to extract structured data using \`${DEFAULT_CONVERSATION_EXTRACT_ACTION_NAME}\`\n` +
      `Other tools that accept files (referenced by their id) as arguments can be available. Rely on their description and the files mime types to decide which tool to use on which file.`;
    for (const f of this.files) {
      content += `<file id="${conversationAttachmentId(f)}" name="${_.escape(f.title)}" type="${f.contentType}" includable="${f.isIncludable}" queryable="${f.isQueryable}" searchable="${f.isSearchable}"`;

      if (f.snippet) {
        content += ` snippet="${_.escape(f.snippet)}"`;
      }

      content += "/>\n";
    }

    return {
      role: "function" as const,
      name:
        this.functionCallName ?? DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

export function makeConversationListFilesAction({
  agentMessage,
  files,
}: {
  agentMessage: AgentMessageType;
  files: ConversationAttachmentType[];
}): ConversationListFilesActionType | null {
  if (files.length === 0) {
    return null;
  }

  return new ConversationListFilesActionType({
    id: -1,
    functionCallId: "call_" + Math.random().toString(36).substring(7),
    functionCallName: DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
    files,
    agentMessageId: agentMessage.agentMessageId,
    step: -1,
    type: "conversation_list_files_action",
    generatedFiles: [],
  });
}
