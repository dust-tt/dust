import {
  DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_NAME,
  DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
  DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import type { ExtractActionBlob } from "@app/lib/actions/types";
import { BaseAction } from "@app/lib/actions/types";
import { conversationAttachmentId } from "@app/lib/api/assistant/conversation/attachments";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import type { Authenticator } from "@app/lib/auth";
import { AgentConversationIncludeFileAction } from "@app/lib/models/assistant/actions/conversation/include_file";
import {
  CONTENT_OUTDATED_MSG,
  getContentFragmentFromAttachmentFile,
} from "@app/lib/resources/content_fragment_resource";
import type {
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ImageContent,
  ModelConfigurationType,
  ModelId,
  Result,
  TextContent,
} from "@app/types";
import {
  assertNever,
  Err,
  isImageContent,
  isTextContent,
  Ok,
} from "@app/types";

const CONTEXT_SIZE_DIVISOR_FOR_INCLUDE = 4;

// Event sent before running the action with the finalized params to be used.
type ConversationIncludeFileParamsEvent = {
  type: "conversation_include_file_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: ConversationIncludeFileActionType;
};

export type ConversationIncludeFileActionRunningEvents =
  ConversationIncludeFileParamsEvent;

type ConversationIncludeFileActionBlob =
  ExtractActionBlob<ConversationIncludeFileActionType>;

export class ConversationIncludeFileActionType extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly params: {
    fileId: string;
  };
  readonly tokensCount: number | null = null;
  readonly fileTitle: string | null = null;
  readonly contentFragments: null[] = [];
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly type = "conversation_include_file_action";

  constructor(blob: ConversationIncludeFileActionBlob) {
    super(blob.id, blob.type);

    this.agentMessageId = blob.agentMessageId;
    this.params = blob.params;
    this.tokensCount = blob.tokensCount;
    this.fileTitle = blob.fileTitle;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  static async fileFromConversation(
    auth: Authenticator,
    fileId: string,
    conversation: ConversationType,
    model: ModelConfigurationType
  ): Promise<
    Result<
      { fileId: string; title: string; content: ImageContent | TextContent },
      string
    >
  > {
    // Note on `contentFragmentVersion`: two content fragment versions are created with different
    // fileIds. So we accept here rendering content fragments that are superseded. This will mean
    // that past actions on a previous version of a content fragment will correctly render the
    // content as being superseded showing the model that a new version available. The fileId of
    // that new version will be different but the title will likely be the same and the model should
    // be able to undertstand the state of affair. We use content.flat() to consider all versions of
    // messages here (to support rendering a file that was part of an old version of a previous
    // message).
    const attachments = listAttachments(conversation);
    const attachment = attachments.find(
      (a) => conversationAttachmentId(a) === fileId
    );
    if (!attachment || !attachment.isIncludable) {
      return new Err(`File \`${fileId}\` not found in conversation`);
    }
    if (attachment.contentFragmentVersion === "superseded") {
      return new Ok({
        fileId,
        title: attachment.title,
        content: {
          type: "text",
          text: CONTENT_OUTDATED_MSG,
        },
      });
    }
    const r = await getContentFragmentFromAttachmentFile(auth, {
      attachment,
      excludeImages: false,
      model,
    });

    if (r.isErr()) {
      return new Err(`Error including conversation file: ${r.error}`);
    }

    if (
      !isTextContent(r.value.content[0]) &&
      !isImageContent(r.value.content[0])
    ) {
      return new Err(`File \`${fileId}\` has no text or image content`);
    }

    return new Ok({
      fileId,
      title: attachment.title,
      content: r.value.content[0],
    });
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name:
        this.functionCallName ?? DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_NAME,
      arguments: JSON.stringify(this.params),
    };
  }

  async renderForMultiActionsModel(
    auth: Authenticator,
    {
      conversation,
      model,
    }: {
      conversation: ConversationType;
      model: ModelConfigurationType;
    }
  ): Promise<FunctionMessageTypeModel> {
    const finalize = (content: string | ImageContent[]) => {
      return {
        role: "function" as const,
        name:
          this.functionCallName ??
          DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_NAME,
        function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
        content,
      };
    };

    const fileRes =
      await ConversationIncludeFileActionType.fileFromConversation(
        auth,
        this.params.fileId,
        conversation,
        model
      );
    if (fileRes.isErr()) {
      return finalize(`Error: ${fileRes.error}`);
    }

    if (this.tokensCount === null) {
      return finalize(`Error: the file content was not tokenized`);
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
      this.tokensCount >
      model.contextSize / CONTEXT_SIZE_DIVISOR_FOR_INCLUDE
    ) {
      return finalize(
        `Error: File \`${this.params.fileId}\` has too many tokens to be included, ` +
          `use the \`${DEFAULT_CONVERSATION_SEARCH_ACTION_NAME}\` or ` +
          `\`${DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME}\` actions instead.`
      );
    }

    if (isTextContent(fileRes.value.content)) {
      return finalize(fileRes.value.content.text);
    } else if (isImageContent(fileRes.value.content)) {
      return finalize([fileRes.value.content]);
    }

    assertNever(fileRes.value.content);
  }
}

/**
 * Action rendering.
 */

// Internal interface for the retrieval and rendering of a ConversationIncludeFile actions. This
// should not be used outside of api/assistant. We allow a ModelId interface here because we don't
// have `sId` on actions (the `sId` is on the `Message` object linked to the `UserMessage` parent of
// this action).
export async function conversationIncludeFileTypesFromAgentMessageIds(
  auth: Authenticator,
  { agentMessageIds }: { agentMessageIds: ModelId[] }
): Promise<ConversationIncludeFileActionType[]> {
  const actions = await AgentConversationIncludeFileAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  return actions.map((action) => {
    return new ConversationIncludeFileActionType({
      id: action.id,
      params: { fileId: action.fileId },
      tokensCount: action.tokensCount,
      fileTitle: action.fileTitle,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      agentMessageId: action.agentMessageId,
      step: action.step,
      type: "conversation_include_file_action",
      generatedFiles: [],
      contentFragments: [],
    });
  });
}
