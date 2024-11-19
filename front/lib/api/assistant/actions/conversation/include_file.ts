import type {
  ContentFragmentType,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelConfigurationType,
  ModelId,
} from "@dust-tt/types";
import {
  BaseAction,
  isContentFragmentType,
  isTextContent,
} from "@dust-tt/types";

import { isConversationIncludableFileContentType } from "@app/lib/api/assistant/actions/conversation/list_files";
import {
  renderContentFragmentForModel,
} from "@app/lib/resources/content_fragment_resource";

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

  async renderForMultiActionsModel({
    conversation,
    model,
  }: {
    conversation: ConversationType;
    model: ModelConfigurationType;
  }): Promise<FunctionMessageTypeModel> {
    const m = (conversation.content.flat(1).find((m) => {
      if (
        isContentFragmentType(m) &&
        isConversationIncludableFileContentType(m.contentType) &&
        isConversationIncludableFileContentType(m.contentType) &&
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
      const rRes = await renderContentFragmentForModel(m, conversation, model, {
        // We're not supposed to get images here and we would not know what to do with them.
        excludeImages: true,
      });
      if (rRes.isErr()) {
        content = `Error: ${rRes.error}`;
      } else if (!isTextContent(rRes.value.content[0])) {
        content = `Error: File \`${this.params.fileId}\` has no text content`;
      } else {
        content = rRes.value.content[0].text;
      }
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? "include_conversation_files",
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}
