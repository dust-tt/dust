import type {
  AgentMessageType,
  ContentFragmentType,
  ConversationFileType,
  ConversationListFilesActionType,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
} from "@dust-tt/types";
import {
  BaseAction,
  getTablesQueryResultsFileTitle,
  isAgentMessageType,
  isContentFragmentType,
  isTablesQueryActionType,
} from "@dust-tt/types";
import { isIncludableFileContentType } from "./list_files";
import { getContentFragmentText } from "@app/lib/resources/content_fragment_resource";

interface ConversationIncludeFilesActionBlob {
  id: ModelId;
  agentMessageId: ModelId;
  params: {
    fileId: string;
  };
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

export class ConversationIncludeFilesAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly params: {
    fileId: string;
  };
  readonly contentFragments: null[] = [];
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly type = "conversation_include_files_action";

  constructor(blob: ConversationIncludeFilesActionBlob) {
    super(blob.id, "conversation_include_files_action");

    this.agentMessageId = blob.agentMessageId;
    this.params = blob.params;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? "include_conversation_files",
      arguments: JSON.stringify(this.params),
    };
  }

  async renderForMultiActionsModel(
    conversation: ConversationType
  ): Promise<FunctionMessageTypeModel> {
    const m = (conversation.content.flat(1).find((m) => {
      if (
        isContentFragmentType(m) &&
        isIncludableFileContentType(m.contentType) &&
        isIncludableFileContentType(m.contentType) &&
        m.fileId === this.params.fileId
      ) {
        return true;
      }
      return false;
    }) || null) as ContentFragmentType | null;

    let content = "";
    if (!m) {
      content = `Error: File \`${this.params.fileId}\` not found in conversation`;
    } else {
      // TODO switch as in content_fragment_resource
      const content = await getContentFragmentText({
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        messageId: sId,
      });

      content = `<file id="${m.fileId}" name="${m.title}" type="${m.contentType}">\n`;
      content += `${m.content}\n`;
      content += `</file>`;
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? "include_conversation_files",
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}
