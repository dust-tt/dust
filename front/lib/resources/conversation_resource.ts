import _ from "lodash";
import type {
  CreationAttributes,
  InferAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { literal, Op, Sequelize } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import {
  ConversationModel,
  ConversationParticipantModel,
  Mention,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type {
  ConversationType,
  ConversationVisibility,
  ConversationWithoutContentType,
  LightAgentConfigurationType,
  Result,
  WorkspaceType,
} from "@app/types";
import { ConversationError, removeNulls } from "@app/types";
import { Err, Ok } from "@app/types";

import { GroupResource } from "./group_resource";
import { frontSequelize } from "./storage";
import type { ResourceFindOptions } from "./types";

export type FetchConversationOptions = {
  includeDeleted?: boolean;
  includeTest?: boolean;
  /**
   * before updatedAt. Less Than
   */
  updatedBefore?: Date;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationResource
  extends ReadonlyAttributesType<ConversationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationResource extends BaseResource<ConversationModel> {
  static model: ModelStatic<ConversationModel> = ConversationModel;

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<ConversationModel>, "workspaceId">
  ): Promise<ConversationResource> {
    const workspace = auth.getNonNullableWorkspace();
    const conversation = await this.model.create({
      ...blob,
      workspaceId: workspace.id,
    });

    return new ConversationResource(
      ConversationResource.model,
      conversation.get()
    );
  }

  private static getOptions(
    options?: FetchConversationOptions
  ): ResourceFindOptions<ConversationModel> {
    const result: ResourceFindOptions<ConversationModel> = {
      where: {
        visibility: options?.includeDeleted ? {} : { [Op.ne]: "deleted" },
      },
    };

    return result;
  }

  static async fetchByIds(
    auth: Authenticator,
    sIds: string[],
    options?: FetchConversationOptions
  ) {
    const workspace = auth.getNonNullableWorkspace();
    const { where } = this.getOptions(options);

    const conversations = await this.model.findAll({
      where: {
        sId: sIds,
        workspaceId: workspace.id,
        ...where,
      },
    });

    return conversations.map((c) => new this(this.model, c.get()));
  }

  static async fetchById(
    auth: Authenticator,
    sId: string,
    options?: FetchConversationOptions
  ): Promise<ConversationResource | null> {
    const res = await this.fetchByIds(auth, [sId], options);

    return res.length > 0 ? res[0] : null;
  }

  static async listAll(
    auth: Authenticator,
    options?: FetchConversationOptions
  ): Promise<ConversationResource[]> {
    const workspace = auth.getNonNullableWorkspace();
    const { where } = this.getOptions(options);
    const conversations = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        ...where,
      },
    });
    return conversations.map((c) => new this(this.model, c.get()));
  }

  static async listMentionsByConfiguration(
    auth: Authenticator,
    {
      agentConfiguration,
      rankingUsageDays,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      rankingUsageDays: number;
    }
  ): Promise<ConversationResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const mentions = await this.model.findAll({
      attributes: [
        [Sequelize.literal('"messages->userMessage"."userId"'), "userId"],
        [
          Sequelize.fn("COUNT", Sequelize.literal('"messages->mentions"."id"')),
          "count",
        ],
      ],
      where: {
        workspaceId: workspace.id,
      },
      include: [
        {
          model: Message,
          required: true,
          attributes: [],
          include: [
            {
              model: Mention,
              as: "mentions",
              required: true,
              attributes: [],
              where: {
                ...(agentConfiguration
                  ? { agentConfigurationId: agentConfiguration.sId }
                  : {}),
                createdAt: {
                  [Op.gt]: literal(
                    `NOW() - INTERVAL '${rankingUsageDays} days'`
                  ),
                },
              },
            },
            {
              model: UserMessage,
              as: "userMessage",
              required: true,
              attributes: [],
            },
          ],
        },
      ],
      order: [["count", "DESC"]],
      group: ['"messages->userMessage"."userId"'],
      raw: true,
    });

    return mentions.map((mention) => new this(this.model, mention.get()));
  }

  static getConversationRequestedGroupIdsFromModel(
    owner: WorkspaceType,
    conversation: ConversationResource
  ): string[][] {
    return conversation.requestedGroupIds.map((groups) =>
      groups.map((g) =>
        GroupResource.modelIdToSId({
          id: g,
          workspaceId: owner.id,
        })
      )
    );
  }

  static canAccessConversation(
    auth: Authenticator,
    conversation:
      | ConversationWithoutContentType
      | ConversationType
      | ConversationResource
  ): boolean {
    const owner = auth.getNonNullableWorkspace();

    const requestedGroupIds =
      conversation instanceof ConversationResource
        ? ConversationResource.getConversationRequestedGroupIdsFromModel(
            owner,
            conversation
          )
        : conversation.requestedGroupIds;

    return auth.canRead(
      Authenticator.createResourcePermissionsFromGroupIds(requestedGroupIds)
    );
  }

  static async fetchConversationWithoutContent(
    auth: Authenticator,
    sId: string,
    options?: FetchConversationOptions & {
      dangerouslySkipPermissionFiltering?: boolean;
    }
  ): Promise<Result<ConversationWithoutContentType, ConversationError>> {
    const owner = auth.getNonNullableWorkspace();

    const conversation = await this.fetchById(auth, sId, {
      includeDeleted: options?.includeDeleted,
    });

    if (!conversation) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    if (
      !options?.dangerouslySkipPermissionFiltering &&
      !ConversationResource.canAccessConversation(auth, conversation)
    ) {
      return new Err(new ConversationError("conversation_access_restricted"));
    }

    return new Ok({
      id: conversation.id,
      created: conversation.createdAt.getTime(),
      sId: conversation.sId,
      owner,
      title: conversation.title,
      visibility: conversation.visibility,
      requestedGroupIds: this.getConversationRequestedGroupIdsFromModel(
        owner,
        conversation
      ),
      // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
      groupIds: [],
    });
  }

  private static async update(
    auth: Authenticator,
    sId: string,
    blob: Partial<
      Omit<InferAttributes<ConversationModel>, "workspace" | "workspaceId">
    >,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    const conversation = await this.fetchById(auth, sId);
    if (conversation == null) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    await conversation.update(blob, transaction);
    return new Ok(undefined);
  }

  static async listConversationsForUser(
    auth: Authenticator,
    options?: FetchConversationOptions
  ): Promise<ConversationWithoutContentType[]> {
    const owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const participations = await ConversationParticipantModel.findAll({
      attributes: ["userId", "updatedAt", "conversationId"],
      where: {
        userId: user.id,
        action: "posted",
      },
      order: [["updatedAt", "DESC"]],
    });

    const includedConversationVisibilities: ConversationVisibility[] = [
      "unlisted",
      "workspace",
    ];

    if (options?.includeDeleted) {
      includedConversationVisibilities.push("deleted");
    }
    if (options?.includeTest) {
      includedConversationVisibilities.push("test");
    }

    const participationsByConversationId = _.groupBy(
      participations,
      "conversationId"
    );
    const conversationUpdated = (c: ConversationResource) => {
      const participations = participationsByConversationId[c.id];
      if (!participations) {
        return undefined;
      }
      return _.sortBy(
        participations,
        "updatedAt",
        "desc"
      )[0].updatedAt.getTime();
    };

    const conversations = (
      await this.model.findAll({
        where: {
          workspaceId: owner.id,
          id: { [Op.in]: _.uniq(participations.map((p) => p.conversationId)) },
          visibility: { [Op.in]: includedConversationVisibilities },
        },
      })
    )
      .map((c) => new this(this.model, c.get()))
      .map(
        (c) =>
          ({
            id: c.id,
            created: c.createdAt.getTime(),
            updated: conversationUpdated(c) ?? c.updatedAt.getTime(),
            sId: c.sId,
            owner,
            title: c.title,
            visibility: c.visibility,
            requestedGroupIds: this.getConversationRequestedGroupIdsFromModel(
              owner,
              c
            ),
            // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
            groupIds: [],
          }) satisfies ConversationWithoutContentType
      );

    const conversationById = _.keyBy(conversations, "id");

    return removeNulls(
      participations.map((p) => {
        const conv: ConversationWithoutContentType | null =
          conversationById[p.conversationId];
        if (!conv) {
          // Deleted / test conversations.
          return null;
        }
        return conv;
      })
    );
  }

  static async upsertParticipation(
    auth: Authenticator,
    conversation: ConversationType
  ) {
    const user = auth.user();
    if (!user) {
      return;
    }

    await frontSequelize.transaction(async (t) => {
      const participant = await ConversationParticipantModel.findOne({
        where: {
          conversationId: conversation.id,
          userId: user.id,
        },
        transaction: t,
      });

      if (participant) {
        participant.changed("updatedAt", true);
        await participant.update(
          {
            action: "posted",
            updatedAt: new Date(),
          },
          { transaction: t }
        );
      } else {
        await ConversationParticipantModel.create(
          {
            conversationId: conversation.id,
            action: "posted",
            userId: user.id,
            workspaceId: conversation.owner.id,
          },
          { transaction: t }
        );
      }
    });
  }

  static async updateRequestedGroupIds(
    auth: Authenticator,
    sId: string,
    requestedGroupIds: number[][],
    transaction?: Transaction
  ) {
    const conversation = await ConversationResource.fetchById(auth, sId);
    if (conversation == null) {
      return new Err(new ConversationError("conversation_not_found"));
    }

    await conversation.updateRequestedGroupIds(requestedGroupIds, transaction);
    return new Ok(undefined);
  }

  static async updateTitle(
    auth: Authenticator,
    sId: string,
    title: string,
    transaction?: Transaction
  ) {
    return this.update(
      auth,
      sId,
      {
        title,
      },
      transaction
    );
  }

  async updateVisiblity(
    visibility: ConversationVisibility,
    title?: string | null
  ) {
    return this.update({
      title,
      visibility,
    });
  }

  async updateRequestedGroupIds(
    requestedGroupIds: number[][],
    transaction?: Transaction
  ) {
    return this.update(
      {
        requestedGroupIds,
      },
      transaction
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction | undefined } = {}
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    try {
      await ConversationParticipantModel.destroy({
        where: { conversationId: this.id },
        transaction,
      });
      await ConversationResource.model.destroy({
        where: {
          workspaceId: owner.id,
          id: this.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }
}
