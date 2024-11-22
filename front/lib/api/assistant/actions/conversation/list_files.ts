import type {
  AgentMessageType,
  ConversationFileType,
  ConversationListFilesActionType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
} from "@dust-tt/types";
import { BaseAction } from "@dust-tt/types";
import _ from "lodash";

import { DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME } from "@app/lib/api/assistant/actions/constants";

interface ConversationListFilesActionBlob {
  agentMessageId: ModelId;
  functionCallId: string | null;
  functionCallName: string | null;
  files: ConversationFileType[];
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
      name:
        this.functionCallName ?? DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
      arguments: JSON.stringify({}),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    let content =
      `List of files attached to the conversation with their content type.\n\n` +
      `- only the files marked as \`includable\` can be included with ` +
      `the \`include_conversation_file\` tool.\n` +
      // TODO(spolu): add mention of viz if enabled and other tools.
      `\n`;
    for (const f of this.files) {
      content += `<file id="${f.fileId}" name="${_.escape(f.title)}" type="${f.contentType}" includable="${f.isIncludable}" queryable="${f.isQueryable}" searchable="${f.isSearchable}"`;

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
  files: ConversationFileType[];
}): ConversationListFilesActionType | null {
  if (files.length === 0) {
    return null;
  }

  return new ConversationListFilesAction({
    functionCallId: "call_" + Math.random().toString(36).substring(7),
    functionCallName: DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
    files,
    agentMessageId: agentMessage.agentMessageId,
  });
}
