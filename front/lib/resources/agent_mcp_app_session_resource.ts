import type { Attributes, CreationAttributes, Transaction } from "sequelize";

import { AgentMCPAppSessionModel } from "@app/lib/models/agent/actions/mcp_app_session";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { Authenticator } from "@app/lib/auth";
import type { ModelId, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AgentMCPAppSessionResource
  extends ReadonlyAttributesType<AgentMCPAppSessionModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentMCPAppSessionResource extends BaseResource<AgentMCPAppSessionModel> {
  static model: ModelStaticWorkspaceAware<AgentMCPAppSessionModel> =
    AgentMCPAppSessionModel;

  constructor(
    model: ModelStaticWorkspaceAware<AgentMCPAppSessionModel>,
    blob: Attributes<AgentMCPAppSessionModel>
  ) {
    super(model, blob);
  }

  /**
   * Creates a new MCP App session.
   */
  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<AgentMCPAppSessionModel>, "workspaceId" | "sId">,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<AgentMCPAppSessionResource> {
    const workspace = auth.getNonNullableWorkspace();

    // Generate a unique sId for the session
    const sId = makeSId("mcp_app_session", {
      id: Date.now(), // Use timestamp as a temporary ID for sId generation
      workspaceId: workspace.id,
    });

    const session = await AgentMCPAppSessionModel.create(
      {
        ...blob,
        sId,
        workspaceId: workspace.id,
      },
      { transaction }
    );

    // Update sId to use the actual model ID
    const actualSId = AgentMCPAppSessionResource.modelIdToSId({
      id: session.id,
      workspaceId: workspace.id,
    });

    await session.update({ sId: actualSId }, { transaction });

    return new this(this.model, { ...session.get(), sId: actualSId });
  }

  /**
   * Fetches a session by its sId.
   */
  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<AgentMCPAppSessionResource | null> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const session = await AgentMCPAppSessionModel.findOne({
      where: {
        sId,
        workspaceId,
      },
    });

    if (!session) {
      return null;
    }

    return new this(this.model, session.get());
  }

  /**
   * Fetches a session by model ID.
   */
  static async fetchByModelIdWithAuth(
    auth: Authenticator,
    id: ModelId,
    transaction?: Transaction
  ): Promise<AgentMCPAppSessionResource | null> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const session = await AgentMCPAppSessionModel.findOne({
      where: {
        id,
        workspaceId,
      },
      transaction,
    });

    if (!session) {
      return null;
    }

    return new this(this.model, session.get());
  }

  /**
   * Fetches all sessions for a conversation.
   */
  static async fetchByConversation(
    auth: Authenticator,
    conversationId: string
  ): Promise<AgentMCPAppSessionResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const sessions = await AgentMCPAppSessionModel.findAll({
      where: {
        conversationId,
        workspaceId,
      },
      order: [["createdAt", "DESC"]],
    });

    return sessions.map((s) => new this(this.model, s.get()));
  }

  /**
   * Fetches sessions for a specific MCP action.
   */
  static async fetchByActionId(
    auth: Authenticator,
    agentMCPActionId: ModelId
  ): Promise<AgentMCPAppSessionResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const sessions = await AgentMCPAppSessionModel.findAll({
      where: {
        agentMCPActionId,
        workspaceId,
      },
    });

    return sessions.map((s) => new this(this.model, s.get()));
  }

  /**
   * Deletes this session.
   */
  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await AgentMCPAppSessionModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  // Note: sId is stored in the database and accessed via the model attribute.
  // Unlike other resources, we store sId directly because sessions need to be
  // queried by sId and the id isn't available at creation time.

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("mcp_app_session", {
      id,
      workspaceId,
    });
  }

  static getModelIdFromSId(sId: string): ModelId | null {
    return getResourceIdFromSId(sId);
  }

  toJSON(): AgentMCPAppSessionType {
    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      conversationId: this.conversationId,
      agentMessageId: this.agentMessageId,
      agentMCPActionId: this.agentMCPActionId,
      resourceUri: this.resourceUri,
      csp: this.csp,
      state: this.state,
    };
  }
}

// Type for the JSON representation
export interface AgentMCPAppSessionType {
  id: ModelId;
  sId: string;
  createdAt: number;
  updatedAt: number;
  conversationId: string;
  agentMessageId: ModelId;
  agentMCPActionId: ModelId;
  resourceUri: string;
  csp: Record<string, string> | null;
  state: "active" | "closed";
}
