import type {
  AgentMessageType,
  ConversationFileType,
  ConversationListFilesActionType,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
} from "@dust-tt/types";
import { BaseAction } from "@dust-tt/types";
import _ from "lodash";

import { isConversationIncludableFileContentType } from "@app/lib/api/assistant/actions/conversation/include_file";
import { listFiles } from "@app/lib/api/assistant/jit_actions";

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
      name: this.functionCallName ?? "list_conversation_files",
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
      content +=
        `<file id="${f.fileId}" name="${_.escape(f.title)}" type="${f.contentType}" ` +
        `includable="${isConversationIncludableFileContentType(f.contentType)}" queryable="${!!f.snippet}"`;

      if (f.snippet) {
        content += ` snippet="${_.escape(f.snippet)}"`;
      }

      content += "/>\n";
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? "list_conversation_files",
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

export function makeConversationListFilesAction({
  agentMessage,
  conversation,
}: {
  agentMessage: AgentMessageType;
  conversation: ConversationType;
}): ConversationListFilesActionType | null {
  const files: ConversationFileType[] = listFiles(conversation);

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
