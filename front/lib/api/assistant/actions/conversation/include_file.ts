import type {
  AgentMessageType,
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

interface ConversationIncludeFilesActionBlob {
  id: ModelId;
  agentMessageId: ModelId;
  params: {
    fileIds: string[];
  };
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

export class ConversationIncludeFilesAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly params: {
    fileIds: string[];
  };
  readonly contentFragments: null[] = [];
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly type = "conversation_list_files_action";

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

  renderForMultiActionsModel(
    conversation: ConversationType
  ): FunctionMessageTypeModel {
    let content = "CONVERSATION FILES:\n";
    for (const f of this.files) {
      content += `<file id="${f.fileId}" name="${f.title}" type="${f.contentType}" />\n`;
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? "list_conversation_files",
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}
