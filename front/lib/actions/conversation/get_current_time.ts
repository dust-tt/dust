import moment from "moment-timezone";

import { DEFAULT_CONVERSATION_GET_CURRENT_TIME_ACTION_NAME } from "@app/lib/actions/constants";
import type { ExtractActionBlob } from "@app/lib/actions/types";
import { BaseAction } from "@app/lib/actions/types";
import type {
  AgentMessageType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
} from "@app/types";

type ConversationGetCurrentTimeActionBlob =
  ExtractActionBlob<ConversationGetCurrentTimeActionType>;

export class ConversationGetCurrentTimeActionType extends BaseAction {
  readonly id: ModelId = -1;
  readonly agentMessageId: ModelId;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly type = "conversation_get_current_time_action";
  readonly timezone: string;

  constructor(blob: ConversationGetCurrentTimeActionBlob) {
    super(blob.id, blob.type);

    this.agentMessageId = blob.agentMessageId;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.timezone = blob.timezone;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name:
        this.functionCallName ??
        DEFAULT_CONVERSATION_GET_CURRENT_TIME_ACTION_NAME,
      arguments: JSON.stringify({}),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    const now = moment().tz(this.timezone);

    const content =
      `Current date and time information:\n\n` +
      `Timezone: ${this.timezone}\n` +
      `Date: ${now.format("YYYY-MM-DD (ddd)")}\n` +
      `Time: ${now.format("HH:mm")}\n` +
      `Full: ${now.format("YYYY-MM-DD HH:mm:ss (Z)")}\n` +
      `Day of week: ${now.format("dddd")}\n` +
      `Week of year: ${now.format("W")}\n` +
      `Unix timestamp: ${now.unix()}`;

    return {
      role: "function" as const,
      name:
        this.functionCallName ??
        DEFAULT_CONVERSATION_GET_CURRENT_TIME_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

export function makeConversationGetCurrentTimeAction({
  agentMessage,
  timezone,
}: {
  agentMessage: AgentMessageType;
  timezone: string;
}): ConversationGetCurrentTimeActionType {
  return new ConversationGetCurrentTimeActionType({
    id: -1,
    functionCallId: "call_" + Math.random().toString(36).substring(7),
    functionCallName: DEFAULT_CONVERSATION_GET_CURRENT_TIME_ACTION_NAME,
    agentMessageId: agentMessage.agentMessageId,
    step: -1,
    type: "conversation_get_current_time_action",
    generatedFiles: [],
    timezone,
  });
}
