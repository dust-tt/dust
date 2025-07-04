import { DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME } from "@app/lib/actions/constants";
import type { ExtractActionBlob } from "@app/lib/actions/types";
import { BaseAction } from "@app/lib/actions/types";
import type { ConversationAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { renderAttachmentXml } from "@app/lib/api/assistant/conversation/attachments";
import type {
  AgentMessageType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
} from "@app/types";

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
    let content = `The following files are currently attached to the conversation:\n`;
    for (const [i, attachment] of this.files.entries()) {
      if (i > 0) {
        content += "\n";
      }
      content += renderAttachmentXml({ attachment });
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
  attachments,
}: {
  agentMessage: AgentMessageType;
  attachments: ConversationAttachmentType[];
}): ConversationListFilesActionType | null {
  if (attachments.length === 0) {
    return null;
  }

  return new ConversationListFilesActionType({
    id: -1,
    functionCallId: "call_" + Math.random().toString(36).substring(7),
    functionCallName: DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
    files: attachments,
    agentMessageId: agentMessage.agentMessageId,
    step: -1,
    type: "conversation_list_files_action",
    generatedFiles: [],
  });
}
