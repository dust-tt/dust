import { authorizedToolsCoverRequired } from "@app/lib/api/frames/tool_authorization_coverage";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FrameToolAuthorizationModel } from "@app/lib/resources/storage/models/frame_tool_authorization";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { FrameToolCallPair } from "@app/types/api/frame_publication";
import { FrameToolCallPairSchema } from "@app/types/api/frame_publication";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import type { Attributes, Transaction } from "sequelize";

export interface FrameToolAuthorizationResource extends ReadonlyAttributesType<FrameToolAuthorizationModel> {}

export class FrameToolAuthorizationResource extends BaseResource<FrameToolAuthorizationModel> {
  static model: ModelStaticWorkspaceAware<FrameToolAuthorizationModel> =
    FrameToolAuthorizationModel;

  constructor(
    model: ModelStaticWorkspaceAware<FrameToolAuthorizationModel>,
    blob: Attributes<FrameToolAuthorizationModel>
  ) {
    super(model, blob);
  }

  private static assertFrameOfWorkspace(
    auth: Authenticator,
    frame: FileResource
  ): void {
    assert(frame.isFrameV2, "Tool authorizations require a Frames v2 file.");
    assert(
      frame.workspaceId === auth.getNonNullableWorkspace().id,
      "The Frame must belong to the authenticated workspace."
    );
  }

  static async fetchForUserAndFrame(
    auth: Authenticator,
    frame: FileResource
  ): Promise<FrameToolAuthorizationResource | null> {
    this.assertFrameOfWorkspace(auth, frame);
    const user = auth.user();
    if (!user) {
      return null;
    }

    const row = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        fileId: frame.id,
        userId: user.id,
      },
    });

    return row ? new this(this.model, row.get()) : null;
  }

  /**
   * Upsert the caller's consent to the given tool pairs (typically the active
   * publication's `requiredTools`).
   */
  static async upsertForUserAndFrame(
    auth: Authenticator,
    {
      frame,
      authorizedTools,
    }: {
      frame: FileResource;
      authorizedTools: FrameToolCallPair[];
    }
  ): Promise<FrameToolAuthorizationResource> {
    this.assertFrameOfWorkspace(auth, frame);
    const user = auth.getNonNullableUser();
    const parsedTools = FrameToolCallPairSchema.array().parse(authorizedTools);
    const workspaceId = auth.getNonNullableWorkspace().id;

    const [row] = await this.model.upsert({
      workspaceId,
      fileId: frame.id,
      userId: user.id,
      authorizedTools: parsedTools,
    });

    return new this(this.model, row.get());
  }

  coversRequiredTools(requiredTools: FrameToolCallPair[]): boolean {
    return authorizedToolsCoverRequired(this.authorizedTools, requiredTools);
  }

  static async deleteAllForFrame(
    auth: Authenticator,
    frame: FileResource
  ): Promise<number> {
    this.assertFrameOfWorkspace(auth, frame);
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        fileId: frame.id,
      },
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<number> {
    return this.model.destroy({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    assert(
      this.workspaceId === auth.getNonNullableWorkspace().id,
      "Can only delete tool authorizations for the current workspace"
    );

    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
    });
    return new Ok(undefined);
  }
}
