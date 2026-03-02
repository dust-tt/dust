import type { Authenticator } from "@app/lib/auth";

import { DustError } from "@app/lib/error";
import {
  ConversationParticipantModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ConversationButlerSuggestionModel } from "@app/lib/resources/storage/models/conversation_butler_suggestion";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type {
  ButlerSuggestionPublicType,
  ButlerSuggestionType,
} from "@app/types/conversation_butler_suggestion";
import { parseButlerSuggestionData } from "@app/types/conversation_butler_suggestion";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationButlerSuggestionResource
  extends ReadonlyAttributesType<ConversationButlerSuggestionModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationButlerSuggestionResource extends BaseResource<ConversationButlerSuggestionModel> {
  static model: ModelStaticWorkspaceAware<ConversationButlerSuggestionModel> =
    ConversationButlerSuggestionModel;

  readonly sourceMessageSId: string;
  readonly resultMessageSId: string | null;

  constructor(
    model: ModelStatic<ConversationButlerSuggestionModel>,
    blob: Attributes<ConversationButlerSuggestionModel>,
    {
      sourceMessageSId,
      resultMessageSId,
    }: {
      sourceMessageSId: string;
      resultMessageSId: string | null;
    }
  ) {
    super(ConversationButlerSuggestionModel, blob);
    this.sourceMessageSId = sourceMessageSId;
    this.resultMessageSId = resultMessageSId;
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<ConversationButlerSuggestionModel>,
      "workspaceId"
    >,
    transaction?: Transaction
  ): Promise<ConversationButlerSuggestionResource> {
    const suggestion = await ConversationButlerSuggestionModel.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { transaction }
    );

    // Batch-fetch the message sIds for the new suggestion.
    const workspaceId = auth.getNonNullableWorkspace().id;
    const messageIds = [
      suggestion.sourceMessageId,
      ...(suggestion.resultMessageId ? [suggestion.resultMessageId] : []),
    ];
    const messages = await MessageModel.findAll({
      attributes: ["id", "sId"],
      where: { id: messageIds, workspaceId },
      transaction,
    });
    const sIdByMessageId = new Map(messages.map((m) => [m.id, m.sId]));

    return new this(ConversationButlerSuggestionModel, suggestion.get(), {
      sourceMessageSId: sIdByMessageId.get(suggestion.sourceMessageId) ?? "",
      resultMessageSId: suggestion.resultMessageId
        ? (sIdByMessageId.get(suggestion.resultMessageId) ?? null)
        : null,
    });
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<ConversationButlerSuggestionModel>,
    transaction?: Transaction
  ): Promise<ConversationButlerSuggestionResource[]> {
    const { where, ...otherOptions } = options ?? {};

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
      transaction,
    });

    // Batch-fetch all referenced message sIds in a single query.
    const workspaceId = auth.getNonNullableWorkspace().id;
    const messageIds = [
      ...new Set(
        suggestions.flatMap((s) =>
          [s.sourceMessageId, s.resultMessageId].filter(
            (id): id is ModelId => id !== null
          )
        )
      ),
    ];
    const messages =
      messageIds.length > 0
        ? await MessageModel.findAll({
            attributes: ["id", "sId"],
            where: { id: messageIds, workspaceId },
            transaction,
          })
        : [];
    const sIdByMessageId = new Map(messages.map((m) => [m.id, m.sId]));

    return suggestions.map(
      (s) =>
        new this(ConversationButlerSuggestionModel, s.get(), {
          sourceMessageSId: sIdByMessageId.get(s.sourceMessageId) ?? "",
          resultMessageSId: s.resultMessageId
            ? (sIdByMessageId.get(s.resultMessageId) ?? null)
            : null,
        })
    );
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<ConversationButlerSuggestionResource | null> {
    const modelId = getResourceIdFromSId(sId);
    if (!modelId) {
      return null;
    }

    const results = await this.baseFetch(auth, {
      where: { id: modelId },
    });

    return results[0] ?? null;
  }

  /**
   * Fetch the most recent suggestion for a conversation filtered by type.
   * Returns null if no suggestion of that type exists.
   */
  static async fetchLatestByConversationAndType(
    auth: Authenticator,
    {
      conversationId,
      suggestionType,
    }: {
      conversationId: ModelId;
      suggestionType: ButlerSuggestionType;
    }
  ): Promise<ConversationButlerSuggestionResource | null> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const results = await this.baseFetch(auth, {
      where: { workspaceId, conversationId, suggestionType },
      order: [["createdAt", "DESC"]],
      limit: 1,
    });

    return results[0] ?? null;
  }

  private async checkAccess(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<undefined, DustError>> {
    const user = auth.getNonNullableUser();

    if (this.userId) {
      // If the suggestion targets a specific user, only that user can act on it.
      if (this.userId !== user.id) {
        return new Err(
          new DustError(
            "unauthorized",
            "Only the targeted user can act on this suggestion."
          )
        );
      }
      return new Ok(undefined);
    }

    // If no specific user, the acting user must be a conversation participant.
    const count = await ConversationParticipantModel.count({
      where: {
        conversationId: this.conversationId,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user.id,
      },
      transaction,
    });

    if (count === 0) {
      return new Err(
        new DustError(
          "unauthorized",
          "Only conversation participants can act on this suggestion."
        )
      );
    }

    return new Ok(undefined);
  }

  async accept(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<ConversationButlerSuggestionResource, DustError>> {
    const accessResult = await this.checkAccess(auth, transaction);
    if (accessResult.isErr()) {
      return accessResult;
    }

    await this.update({ status: "accepted" as const }, transaction);
    return new Ok(this);
  }

  async dismiss(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<ConversationButlerSuggestionResource, DustError>> {
    const accessResult = await this.checkAccess(auth, transaction);
    if (accessResult.isErr()) {
      return accessResult;
    }

    await this.update({ status: "dismissed" as const }, transaction);
    return new Ok(this);
  }

  /**
   * System-level dismissal that bypasses user access checks.
   * Used by the butler to auto-dismiss stale pending suggestions.
   */
  async autoDismiss(transaction?: Transaction): Promise<void> {
    await this.update({ status: "dismissed" as const }, transaction);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  // Serialization.

  toJSON(): ButlerSuggestionPublicType {
    const data = parseButlerSuggestionData({
      suggestionType: this.suggestionType,
      metadata: this.metadata,
    });

    return {
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      sourceMessageSId: this.sourceMessageSId,
      resultMessageSId: this.resultMessageSId,
      status: this.status,
      ...data,
    };
  }

  get sId(): string {
    return ConversationButlerSuggestionResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("conversation_butler_suggestion", { id, workspaceId });
  }
}
