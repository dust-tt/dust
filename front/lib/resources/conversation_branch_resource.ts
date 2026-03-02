import type { Authenticator } from "@app/lib/auth";
import { ConversationBranchModel } from "@app/lib/models/agent/conversation_branch";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type {
  Attributes,
  CreationAttributes,
  Transaction,
  WhereOptions,
} from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ConversationBranchResource
  extends ReadonlyAttributesType<ConversationBranchModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConversationBranchResource extends BaseResource<ConversationBranchModel> {
  static model: ModelStaticWorkspaceAware<ConversationBranchModel> =
    ConversationBranchModel;

  constructor(
    model: ModelStaticWorkspaceAware<ConversationBranchModel>,
    blob: Attributes<ConversationBranchModel>
  ) {
    super(model, blob);
  }

  /**
   * Creates a new conversation branch in the authenticated workspace.
   */
  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<ConversationBranchModel>, "workspaceId">
  ): Promise<ConversationBranchResource> {
    const workspace = auth.getNonNullableWorkspace();

    const branch = await this.model.create({
      ...blob,
      workspaceId: workspace.id,
    });

    return new this(this.model, branch.get());
  }

  /**
   * Fetches conversation branches by their model IDs within the authenticated workspace.
   */
  static async fetchByModelIds(
    auth: Authenticator,
    ids: number[]
  ): Promise<ConversationBranchResource[]> {
    if (ids.length === 0) {
      return [];
    }

    const workspace = auth.getNonNullableWorkspace();

    const branches = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        id: ids,
      } as WhereOptions<ConversationBranchModel>,
    });

    return branches.map(
      (b) => new this(ConversationBranchResource.model, b.get())
    );
  }

  /**
   * Lists all branches for a given conversation within the authenticated workspace.
   */
  static async listForConversation(
    auth: Authenticator,
    conversationId: number
  ): Promise<ConversationBranchResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const branches = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId,
      } as WhereOptions<ConversationBranchModel>,
    });

    return branches.map(
      (b) => new this(ConversationBranchResource.model, b.get())
    );
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<ConversationBranchResource | null> {
    const [branch] = await this.fetchByIds(auth, [sId]);
    return branch ?? null;
  }

  static async fetchByIds(
    auth: Authenticator,
    sIds: string[]
  ): Promise<ConversationBranchResource[]> {
    const branches = await this.fetchByModelIds(
      auth,
      removeNulls(sIds.map(getResourceIdFromSId))
    );

    // When fetching by sIds, we check read access to the branches.
    const allowedBranches = branches.filter((b) => b.canRead(auth));
    return allowedBranches;
  }

  // When/If we allow more than one user to read a branch, we will need to change this.
  canRead(auth: Authenticator) {
    return auth.isAdmin() || auth.getNonNullableUser().id === this.userId;
  }

  canWrite(auth: Authenticator) {
    return auth.getNonNullableUser().id === this.userId;
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      } as WhereOptions<ConversationBranchModel>,
      transaction,
    });

    return new Ok(undefined);
  }
}
