import type {
  AgentMessageType,
  ConversationFileType,
  ConversationListFilesActionType,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  SupportedContentFragmentType,
} from "@dust-tt/types";
import {
  assertNever,
  BaseAction,
  getTablesQueryResultsFileTitle,
  isAgentMessageType,
  isContentFragmentType,
  isSupportedImageContentType,
  isSupportedPlainTextContentType,
  isTablesQueryActionType,
} from "@dust-tt/types";

interface ConversationListFilesActionBlob {
  agentMessageId: ModelId;
  functionCallId: string | null;
  functionCallName: string | null;
  files: ConversationFileType[];
}

export function isIncludableFileContentType(
  contentType: SupportedContentFragmentType
): boolean {
  if (isSupportedImageContentType(contentType)) {
    return false;
  }
  switch (contentType) {
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/pdf":
    case "text/markdown":
    case "text/plain":
    case "dust-application/slack":
      return true;

    case "text/comma-separated-values":
    case "text/csv":
    case "text/tab-separated-values":
    case "text/tsv":
      return false;
    default:
      assertNever(contentType);
  }
}

export class ConversationListFilesAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly files: ConversationFileType[];
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly type = "conversation_list_files_action";

  constructor(blob: ConversationListFilesActionBlob) {
    super(-1, "conversation_list_files_action");

    this.agentMessageId = blob.agentMessageId;
    this.files = blob.files;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? "list_conversation_files",
      arguments: JSON.stringify({}),
    };
  }

  renderForMultiActionsModel(): FunctionMessageTypeModel {
    let content =
      `List of files included in the conversation with their content type.\n\n` +
      `- only the files marked as \`includable\` can be included with ` +
      `the \`include_conversation_files\` tool.\n\n`;
    // TODO(spolu) add file token count, make includabiility dependent on that.
    for (const f of this.files) {
      content +=
        `<file id="${f.fileId}" ` +
        `name="${f.title}" type="${f.contentType}" ` +
        `includable="${isIncludableFileContentType(f.contentType)}"/>\n`;
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? "list_conversation_files",
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

export function makeConversationListFilesAction(
  agentMessage: AgentMessageType,
  conversation: ConversationType
): ConversationListFilesActionType | null {
  const files: ConversationFileType[] = [];

  for (const m of conversation.content.flat(1)) {
    if (
      isContentFragmentType(m) &&
      isSupportedPlainTextContentType(m.contentType)
    ) {
      if (m.fileId) {
        files.push({
          fileId: m.fileId,
          title: m.title,
          contentType: m.contentType,
        });
      }
    } else if (isAgentMessageType(m)) {
      for (const a of m.actions) {
        if (isTablesQueryActionType(a)) {
          if (a.resultsFileId && a.resultsFileSnippet) {
            files.push({
              fileId: a.resultsFileId,
              contentType: "text/csv",
              title: getTablesQueryResultsFileTitle({ output: a.output }),
            });
          }
        }
      }
    }
  }

  if (files.length === 0) {
    return null;
  }

  return new ConversationListFilesAction({
    functionCallId: "call_" + Math.random().toString(36).substring(7),
    functionCallName: "list_conversation_files",
    files,
    agentMessageId: agentMessage.agentMessageId,
  });
}
