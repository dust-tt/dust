import type { Attributes, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { ConversationMCPServerViewModel } from "@app/lib/models/assistant/actions/conversation_mcp_server_view";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationMCPServerViewResource
  extends ReadonlyAttributesType<ConversationMCPServerViewModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationMCPServerViewResource extends BaseResource<ConversationMCPServerViewModel> {
  static model: typeof ConversationMCPServerViewModel =
    ConversationMCPServerViewModel;

  constructor(
    model: typeof ConversationMCPServerViewModel,
    blob: Attributes<ConversationMCPServerViewModel>
  ) {
    super(ConversationMCPServerViewModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    {
      conversationId,
      mcpServerViewId,
      enabled = true,
    }: {
      conversationId: ModelId;
      mcpServerViewId: ModelId;
      enabled?: boolean;
    },
    transaction?: Transaction
  ): Promise<Result<ConversationMCPServerViewResource, Error>> {
    try {
      const conversationMCPServerView =
        await ConversationMCPServerViewModel.create(
          {
            workspaceId: auth.getNonNullableWorkspace().id,
            conversationId,
            mcpServerViewId,
            userId: auth.getNonNullableUser().id,
            enabled,
          },
          { transaction }
        );

      return new Ok(
        new ConversationMCPServerViewResource(
          ConversationMCPServerViewModel,
          conversationMCPServerView.get()
        )
      );
    } catch (error) {
      return new Err(error as Error);
    }
  }

  static async fetchByConversationId(
    auth: Authenticator,
    conversationId: ModelId
  ): Promise<ConversationMCPServerViewResource[]> {
    const conversationMCPServerViews = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId,
      },
    });

    return conversationMCPServerViews.map(
      (view) =>
        new ConversationMCPServerViewResource(
          ConversationMCPServerViewModel,
          view.get()
        )
    );
  }

  static async fetchByMCPServerViewId(
    auth: Authenticator,
    mcpServerViewId: ModelId
  ): Promise<ConversationMCPServerViewResource[]> {
    const conversationMCPServerViews =
      await ConversationMCPServerViewModel.findAll({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          mcpServerViewId,
        },
      });

    return conversationMCPServerViews.map(
      (view) =>
        new ConversationMCPServerViewResource(
          ConversationMCPServerViewModel,
          view.get()
        )
    );
  }

  static async fetchByConversationAndMCPServerView(
    auth: Authenticator,
    conversationId: ModelId,
    mcpServerViewId: ModelId
  ): Promise<ConversationMCPServerViewResource | null> {
    const conversationMCPServerView =
      await ConversationMCPServerViewModel.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId,
          mcpServerViewId,
        },
      });

    if (!conversationMCPServerView) {
      return null;
    }

    return new ConversationMCPServerViewResource(
      ConversationMCPServerViewModel,
      conversationMCPServerView.get()
    );
  }

  async updateEnabled(
    enabled: boolean,
    transaction?: Transaction
  ): Promise<Result<ConversationMCPServerViewResource, Error>> {
    await this.update({ enabled, updatedAt: new Date() }, transaction);

    return new Ok(this);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { id: this.id, workspaceId: auth.getNonNullableWorkspace().id },
      transaction,
    });

    return new Ok(undefined);
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("conversation_mcp_server_view", {
      id,
      workspaceId,
    });
  }

  toJSON(): {
    id: ModelId;
    sId: string;
    workspaceId: ModelId;
    conversationId: ModelId;
    mcpServerViewId: ModelId;
    userId: ModelId;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      id: this.id,
      sId: ConversationMCPServerViewResource.modelIdToSId({
        id: this.id,
        workspaceId: this.workspaceId,
      }),
      workspaceId: this.workspaceId,
      conversationId: this.conversationId,
      mcpServerViewId: this.mcpServerViewId,
      userId: this.userId,
      enabled: this.enabled,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
