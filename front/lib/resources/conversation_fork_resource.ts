import type { Authenticator } from "@app/lib/auth";
import {
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationForkModel } from "@app/lib/models/agent/conversation_fork";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

export type ConversationForkType = {
  id: ModelId;
  sId: string;
  created: number;
  updated: number;
  parentConversationId: string;
  parentConversationModelId: ModelId;
  childConversationId: string;
  childConversationModelId: ModelId;
  createdByUserId: string;
  createdByUserModelId: ModelId;
  sourceMessageId: string;
  sourceMessageModelId: ModelId;
  branchedAt: number;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationForkResource
  extends ReadonlyAttributesType<ConversationForkModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationForkResource extends BaseResource<ConversationForkModel> {
  static model: ModelStaticWorkspaceAware<ConversationForkModel> =
    ConversationForkModel;

  readonly parentConversationSId: string;
  readonly childConversationSId: string;
  readonly createdByUserSId: string;
  readonly sourceMessageSId: string;

  constructor(
    model: ModelStaticWorkspaceAware<ConversationForkModel>,
    blob: Attributes<ConversationForkModel>,
    {
      parentConversationSId,
      childConversationSId,
      createdByUserSId,
      sourceMessageSId,
    }: {
      parentConversationSId: string;
      childConversationSId: string;
      createdByUserSId: string;
      sourceMessageSId: string;
    }
  ) {
    super(model, blob);

    this.parentConversationSId = parentConversationSId;
    this.childConversationSId = childConversationSId;
    this.createdByUserSId = createdByUserSId;
    this.sourceMessageSId = sourceMessageSId;
  }

  get sId(): string {
    return ConversationForkResource.modelIdToSId({
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
    return makeSId("conversation_fork", { id, workspaceId });
  }

  private static fromModel(
    fork: ConversationForkModel
  ): ConversationForkResource {
    assert(
      fork.parentConversation,
      "Conversation fork parent conversation must be loaded."
    );
    assert(
      fork.childConversation,
      "Conversation fork child conversation must be loaded."
    );
    assert(fork.createdByUser, "Conversation fork creator must be loaded.");
    assert(
      fork.sourceMessage,
      "Conversation fork source message must be loaded."
    );

    return new this(this.model, fork.get(), {
      parentConversationSId: fork.parentConversation.sId,
      childConversationSId: fork.childConversation.sId,
      createdByUserSId: fork.createdByUser.sId,
      sourceMessageSId: fork.sourceMessage.sId,
    });
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<ConversationForkModel> & {
      transaction?: Transaction;
    }
  ): Promise<ConversationForkResource[]> {
    const { where, ...rest } = options ?? {};
    const owner = auth.getNonNullableWorkspace();

    const forks = await this.model.findAll({
      where: {
        ...where,
        workspaceId: owner.id,
      },
      include: [
        {
          model: ConversationModel,
          as: "parentConversation",
          required: true,
          attributes: ["sId"],
        },
        {
          model: ConversationModel,
          as: "childConversation",
          required: true,
          attributes: ["sId"],
        },
        {
          model: UserModel,
          as: "createdByUser",
          required: true,
          attributes: ["sId"],
        },
        {
          model: MessageModel,
          as: "sourceMessage",
          required: true,
          attributes: ["sId"],
        },
      ],
      ...rest,
    });

    return forks.map((f) => this.fromModel(f));
  }

  static async makeNew(
    auth: Authenticator,
    blob: Pick<CreationAttributes<ConversationForkModel>, "branchedAt"> & {
      parentConversation: ConversationResource;
      childConversation: ConversationResource;
      sourceMessageModelId: ModelId;
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<ConversationForkResource> {
    const owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    if (
      blob.parentConversation.workspaceId !== owner.id ||
      blob.childConversation.workspaceId !== owner.id
    ) {
      throw new Error("Cannot create a conversation fork across workspaces.");
    }

    if (blob.parentConversation.id === blob.childConversation.id) {
      throw new Error("Cannot create a conversation fork from itself.");
    }

    const sourceMessage = await MessageModel.findOne({
      attributes: ["id"],
      where: {
        id: blob.sourceMessageModelId,
        workspaceId: owner.id,
        conversationId: blob.parentConversation.id,
        agentMessageId: { [Op.ne]: null },
      },
      transaction,
    });
    if (!sourceMessage) {
      throw new Error(
        "Cannot create a conversation fork from a missing source agent message."
      );
    }

    const fork = await this.model.create(
      {
        workspaceId: owner.id,
        parentConversationId: blob.parentConversation.id,
        childConversationId: blob.childConversation.id,
        createdByUserId: user.id,
        sourceMessageId: blob.sourceMessageModelId,
        branchedAt: blob.branchedAt,
      },
      { transaction }
    );

    const [resource] = await this.fetchByModelIds(auth, [fork.id], {
      transaction,
    });
    assert(resource, "Created conversation fork must be fetchable.");
    return resource;
  }

  static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<ConversationForkResource[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.baseFetch(auth, {
      where: { id: ids },
      ...(transaction && { transaction }),
    });
  }

  static async fetchById(
    auth: Authenticator,
    conversationForkId: string
  ): Promise<ConversationForkResource | null> {
    const modelId = getResourceIdFromSId(conversationForkId);
    if (modelId === null) {
      return null;
    }

    const [fork] = await this.fetchByModelIds(auth, [modelId]);
    return fork ?? null;
  }

  static async fetchByChildConversationModelIds(
    auth: Authenticator,
    childConversationModelIds: ModelId[]
  ): Promise<ConversationForkResource[]> {
    if (childConversationModelIds.length === 0) {
      return [];
    }

    return this.baseFetch(auth, {
      where: {
        childConversationId: childConversationModelIds,
      } as WhereOptions<ConversationForkModel>,
    });
  }

  static async fetchByChildConversationIds(
    auth: Authenticator,
    childConversationIds: string[]
  ): Promise<ConversationForkResource[]> {
    if (childConversationIds.length === 0) {
      return [];
    }

    const childConversations = await ConversationModel.findAll({
      attributes: ["id"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: childConversationIds,
      },
    });

    return this.fetchByChildConversationModelIds(
      auth,
      childConversations.map((c) => c.id)
    );
  }

  static async listByParentConversationModelId(
    auth: Authenticator,
    parentConversationModelId: ModelId
  ): Promise<ConversationForkResource[]> {
    return this.baseFetch(auth, {
      where: {
        parentConversationId: parentConversationModelId,
      } as WhereOptions<ConversationForkModel>,
      order: [
        ["branchedAt", "DESC"],
        ["id", "DESC"],
      ],
    });
  }

  static async deleteBySourceMessageModelIds(
    auth: Authenticator,
    {
      sourceMessageModelIds,
      transaction,
    }: {
      sourceMessageModelIds: ModelId[];
      transaction?: Transaction;
    }
  ): Promise<number> {
    if (sourceMessageModelIds.length === 0) {
      return 0;
    }

    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sourceMessageId: sourceMessageModelIds,
      },
      transaction,
    });
  }

  static async deleteForConversationModelId(
    auth: Authenticator,
    {
      conversationModelId,
      transaction,
    }: {
      conversationModelId: ModelId;
      transaction?: Transaction;
    }
  ): Promise<number> {
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        [Op.or]: [
          { parentConversationId: conversationModelId },
          { childConversationId: conversationModelId },
        ],
      },
      transaction,
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  toJSON(): ConversationForkType {
    return {
      id: this.id,
      sId: this.sId,
      created: this.createdAt.getTime(),
      updated: this.updatedAt.getTime(),
      parentConversationId: this.parentConversationSId,
      parentConversationModelId: this.parentConversationId,
      childConversationId: this.childConversationSId,
      childConversationModelId: this.childConversationId,
      createdByUserId: this.createdByUserSId,
      createdByUserModelId: this.createdByUserId,
      sourceMessageId: this.sourceMessageSId,
      sourceMessageModelId: this.sourceMessageId,
      branchedAt: this.branchedAt.getTime(),
    };
  }
}
