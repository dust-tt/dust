import assert from "assert";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ConversationMCPServerViewModel } from "@app/lib/models/assistant/actions/conversation_mcp_server_view";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getIdsFromSId, makeSId } from "@app/lib/resources/string_ids";
import type {
  ConversationMCPServerViewType,
  ConversationWithoutContentType,
  ModelId,
  Result,
} from "@app/types";
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
      conversation,
      mcpServerViewId,
      enabled = true,
    }: {
      conversation: ConversationWithoutContentType;
      mcpServerViewId: ModelId;
      enabled?: boolean;
    },
    transaction?: Transaction
  ): Promise<Result<ConversationMCPServerViewResource, Error>> {
    try {
      if (auth.getNonNullableWorkspace().id !== conversation.owner.id) {
        return new Err(
          new Error(
            "Workspace ID mismatch between conversation and authenticated workspace"
          )
        );
      }

      const conversationMCPServerView =
        await ConversationMCPServerViewModel.create(
          {
            workspaceId: auth.getNonNullableWorkspace().id,
            conversationId: conversation.id,
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
    conversationId: ModelId,
    onlyEnabled?: boolean
  ): Promise<ConversationMCPServerViewResource[]> {
    const conversationMCPServerViews = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId,
        ...(onlyEnabled ? { enabled: true } : {}),
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

  static async fetchByMCPServerViewModelId(
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

  static async fetchByConversationAndMCPServerViewModelId(
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

  static async fetchByConversationAndMCPServerViewIds(
    auth: Authenticator,
    conversationId: ModelId,
    mcpServerViewIds: string[]
  ): Promise<Result<ConversationMCPServerViewResource[], Error>> {
    const mcpServerViewModelIds: ModelId[] = [];

    for (const mcpServerViewId of mcpServerViewIds) {
      const res = getIdsFromSId(mcpServerViewId);
      if (res.isErr()) {
        return new Err(res.error);
      } else if (
        res.value.workspaceModelId !== auth.getNonNullableWorkspace().id
      ) {
        return new Err(
          new Error(
            "MCP server view IDs do not belong to the authenticated workspace"
          )
        );
      }

      mcpServerViewModelIds.push(res.value.resourceModelId);
    }

    const conversationMCPServerViews =
      await ConversationMCPServerViewModel.findAll({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          conversationId,
          mcpServerViewId: {
            [Op.in]: mcpServerViewModelIds,
          },
        },
      });

    return new Ok(
      conversationMCPServerViews.map(
        (view) =>
          new ConversationMCPServerViewResource(
            ConversationMCPServerViewModel,
            view.get()
          )
      )
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

  static async upsertByConversationAndMCPServerViewIds(
    auth: Authenticator,
    {
      conversation,
      mcpServerViewIds,
      enabled,
    }: {
      conversation: ConversationWithoutContentType;
      mcpServerViewIds: string[];
      enabled: boolean;
    }
  ): Promise<Result<undefined, Error>> {
    const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
    if (!featureFlags.includes("jit_tools")) {
      return new Err(new Error("JIT Tools are not enabled for this workspace"));
    }

    const res = await this.fetchByConversationAndMCPServerViewIds(
      auth,
      conversation.id,
      mcpServerViewIds
    );
    if (res.isErr()) {
      return res;
    }

    const existingConversationMCPServerViews = res.value;

    const mcpServerViewResources = await MCPServerViewResource.fetchByIds(
      auth,
      mcpServerViewIds
    );

    // Cycle through the mcpServerViewIds and create or update the conversationMCPServerView
    for (const mcpServerViewResource of mcpServerViewResources) {
      // For now we only allow MCP server views from the Company Space.
      // It's blocked in the UI but it's a last line of defense.
      // If we lift this limit, we should handle the requestedGroupIds on the conversation.
      assert(
        mcpServerViewResource.space.kind === "global",
        "MCP server view is not part of the Company Space. It should not happen."
      );

      const existingConversationMCPServerView =
        existingConversationMCPServerViews.find(
          (view) => view.mcpServerViewId === mcpServerViewResource.id
        );
      if (existingConversationMCPServerView) {
        const r =
          await existingConversationMCPServerView.updateEnabled(enabled);

        if (r.isErr()) {
          return r;
        }
      } else {
        const r = await this.makeNew(auth, {
          conversation,
          mcpServerViewId: mcpServerViewResource.id,
          enabled,
        });
        if (r.isErr()) {
          return r;
        }
      }
    }

    return new Ok(undefined);
  }

  toJSON(): ConversationMCPServerViewType {
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
