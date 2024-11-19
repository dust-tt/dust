import type {
  ContentFragmentType,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelConfigurationType,
  ModelId,
  SupportedContentFragmentType,
} from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import {
  assertNever,
  BaseAction,
  isContentFragmentType,
  isSupportedImageContentType,
  isTextContent,
} from "@dust-tt/types";

import config from "@app/lib/api/config";
import { renderContentFragmentForModel } from "@app/lib/resources/content_fragment_resource";
import logger from "@app/logger/logger";

export function isConversationIncludableFileContentType(
  contentType: SupportedContentFragmentType
): boolean {
  if (isSupportedImageContentType(contentType)) {
    return false;
  }
  // For now we only allow including text files.
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

const CONTEXT_SIZE_DIVISOR_FOR_INCLUDE = 4;

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
    const finalize = (content: string) => {
      return {
        role: "function" as const,
        name: this.functionCallName ?? "include_conversation_files",
        function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
        content,
      };
    };

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

    if (!m) {
      return finalize(
        `Error: File \`${this.params.fileId}\` not found in conversation`
      );
    }

    const rRes = await renderContentFragmentForModel(m, conversation, model, {
      // We're not supposed to get images here and we would not know what to do with them.
      excludeImages: true,
    });

    if (rRes.isErr()) {
      return finalize(`Error: ${rRes.error}`);
    }
    if (!isTextContent(rRes.value.content[0])) {
      return finalize(
        `Error: File \`${this.params.fileId}\` has no text content`
      );
    }
    const text = rRes.value.content[0].text;

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const tokensRes = await coreAPI.tokenize({
      text,
      providerId: model.providerId,
      modelId: model.modelId,
    });
    if (tokensRes.isErr()) {
      return finalize(`Error: ${tokensRes.error}`);
    }

    // We include a file only if it's smaller than the context size divided by
    // CONTEXT_SIZE_DIVISOR_FOR_INCLUDE. This is a departure form the existing logic where we
    // present attachments as user messages whose content is possibly truncated. The rationale is to
    // only allow including files that are resonably large otherwise rely on semantic search. If >1
    // files are included they will be represented in the conversation as separate funciton messages
    // which may be filtered out if they overflow the context size. This may lead to a weird
    // situation where the model includes file 1 2 3 4 5 and at this stage only sees 2 3 4 5 and
    // attempts to include 1.
    // TODO(spolu): test this scenario.
    if (
      tokensRes.value.tokens.length >
      model.contextSize / CONTEXT_SIZE_DIVISOR_FOR_INCLUDE
    ) {
      return finalize(
        // TODO(spolu): refer to the tool exactly
        `Error: File \`${this.params.fileId}\` has too many tokens to be included, use semantic search instead.`
      );
    }

    return finalize(text);
  }
}
