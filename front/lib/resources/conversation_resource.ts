import type {
  CreationAttributes,
  InferAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { literal, Op, Sequelize } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import {
  ConversationModel,
  Mention,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type {
  ConversationType,
  ConversationWithoutContentType,
  LightAgentConfigurationType,
  Result,
  WorkspaceType,
} from "@app/types";
import { ConversationError } from "@app/types";
import { Err, Ok } from "@app/types";

import { GroupResource } from "./group_resource";

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
    const conversation = await ConversationResource.model.create({
      ...blob,
      workspaceId: workspace.id,
    });

    return new ConversationResource(
      ConversationResource.model,
      conversation.get()
    );
  }

  static async fetchWithId(
    auth: Authenticator,
    sId: string
  ): Promise<ConversationResource | null> {
    const workspace = auth.getNonNullableWorkspace();

    const conversation = await ConversationResource.model.findOne({
      where: {
        sId,
        workspaceId: workspace.id,
      },
    });

    return conversation
      ? new ConversationResource(ConversationModel, conversation.get())
      : null;
  }

  static async fetchOne(
    auth: Authenticator,
    {
      where,
    }: {
      where?: WhereOptions<
        Omit<ConversationModel, "workspaceId" | "workspace">
      >;
    } = {}
  ): Promise<ConversationResource | null> {
    const workspace = auth.getNonNullableWorkspace();
    const conversation = await ConversationResource.model.findOne({
      where: {
        workspaceId: workspace.id,
        ...where,
      },
    });

    return conversation
      ? new ConversationResource(ConversationResource.model, conversation.get())
      : null;
  }

  static async listAll(
    auth: Authenticator,
    {
      where,
    }: {
      where?: WhereOptions<
        Omit<ConversationModel, "workspaceId" | "workspace">
      >;
    } = {}
  ): Promise<ConversationResource[]> {
    const workspace = auth.getNonNullableWorkspace();
    const conversations = await ConversationResource.model.findAll({
      where: {
        workspaceId: workspace.id,
        ...where,
      },
    });
    return conversations.map(
      (c) => new ConversationResource(ConversationModel, c.get())
    );
  }

  static async fetchMetionsByConfiguration(
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

    const mentions = await ConversationResource.model.findAll({
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

    return mentions.map(
      (mention) =>
        new ConversationResource(ConversationResource.model, mention.get())
    );
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
    options?: {
      includeDeleted?: boolean;
      dangerouslySkipPermissionFiltering?: boolean;
    }
  ): Promise<Result<ConversationWithoutContentType, ConversationError>> {
    const owner = auth.getNonNullableWorkspace();

    const conversation = await ConversationResource.fetchOne(auth, {
      where: {
        sId,
        ...(options?.includeDeleted
          ? {}
          : { visibility: { [Op.ne]: "deleted" } }),
      },
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
      requestedGroupIds:
        ConversationResource.getConversationRequestedGroupIdsFromModel(
          owner,
          conversation
        ),
      // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
      groupIds: [],
    });
  }

  async updateAttributes(
    blob: Partial<
      Pick<InferAttributes<ConversationModel>, "title" | "visibility">
    >
  ): Promise<[affectedCount: number]> {
    return this.update(blob);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction | undefined } = {}
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();

    try {
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
