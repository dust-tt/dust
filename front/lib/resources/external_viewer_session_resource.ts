import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ExternalViewerSessionModel } from "@app/lib/resources/storage/models/files";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import crypto from "crypto";
import { addSeconds } from "date-fns";
import type { Transaction, WhereOptions } from "sequelize";
import { Op } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ExternalViewerSessionResource
  extends ReadonlyAttributesType<ExternalViewerSessionModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ExternalViewerSessionResource extends BaseResource<ExternalViewerSessionModel> {
  static model: ModelStaticWorkspaceAware<ExternalViewerSessionModel> =
    ExternalViewerSessionModel;
  static readonly durationSeconds = 7 * 24 * 60 * 60;

  static async create(
    workspace: LightWorkspaceType | WorkspaceResource,
    { email }: { email: string }
  ): Promise<ExternalViewerSessionResource> {
    const session = await this.model.create({
      workspaceId: workspace.id,
      email,
      sessionToken: crypto.randomUUID(),
      expiresAt: addSeconds(new Date(), this.durationSeconds),
    });
    return new this(this.model, session.get());
  }

  /**
   * @cc [owner:flvndvd,label:security] external-viewer-session-scope
   * Accept only unexpired tokens from the requested workspace.
   */
  static async fetchByToken(
    workspace: LightWorkspaceType | WorkspaceResource,
    token: string
  ): Promise<ExternalViewerSessionResource | null> {
    const where: WhereOptions<ExternalViewerSessionModel> = {
      workspaceId: workspace.id,
      sessionToken: token,
      expiresAt: { [Op.gt]: new Date() },
    };
    const session = await this.model.findOne({ where });
    return session ? new this(this.model, session.get()) : null;
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    await this.model.destroy({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { id: this.id, workspaceId: auth.getNonNullableWorkspace().id },
      transaction,
    });
    return new Ok(undefined);
  }
}
