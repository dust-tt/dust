import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FrameTrustModel } from "@app/lib/resources/storage/models/frame_trust";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

export interface FrameTrustResource extends ReadonlyAttributesType<FrameTrustModel> {}

/**
 * @cc [owner:davidebbo,label:security;backend] trust-is-per-publisher
 * A trust row only covers code published by its `publisherUserId`. Lookups MUST match the
 * authenticated user, the Frame and the publisher together; trust given to one publisher of a
 * Frame MUST NOT cover code published by another user in that Frame.
 */
export class FrameTrustResource extends BaseResource<FrameTrustModel> {
  static model: ModelStaticWorkspaceAware<FrameTrustModel> = FrameTrustModel;

  constructor(
    model: ModelStaticWorkspaceAware<FrameTrustModel>,
    blob: Attributes<FrameTrustModel>
  ) {
    super(model, blob);
  }

  private static assertFrameOfWorkspace(
    auth: Authenticator,
    frame: FileResource
  ): void {
    assert(frame.isFrameV2, "Frame trust requires a Frames v2 file.");
    assert(
      frame.workspaceId === auth.getNonNullableWorkspace().id,
      "The Frame must belong to the authenticated workspace."
    );
  }

  /**
   * Records that the authenticated user trusts code published by `publisherUserModelId` in
   * `frame`. Idempotent.
   */
  static async grant(
    auth: Authenticator,
    {
      frame,
      publisherUserModelId,
    }: { frame: FileResource; publisherUserModelId: ModelId }
  ): Promise<FrameTrustResource> {
    this.assertFrameOfWorkspace(auth, frame);

    const [row] = await this.model.findOrCreate({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: auth.getNonNullableUser().id,
        fileId: frame.id,
        publisherUserId: publisherUserModelId,
      },
    });

    return new this(this.model, row.get());
  }

  static async isTrusted(
    auth: Authenticator,
    {
      frame,
      publisherUserModelId,
    }: { frame: FileResource; publisherUserModelId: ModelId }
  ): Promise<boolean> {
    this.assertFrameOfWorkspace(auth, frame);

    const row = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: auth.getNonNullableUser().id,
        fileId: frame.id,
        publisherUserId: publisherUserModelId,
      },
    });

    return row !== null;
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

  /**
   * Deletes the rows where `user` is either the trusting viewer or the trusted publisher.
   */
  static async deleteAllForUser(
    auth: Authenticator,
    user: UserResource
  ): Promise<number> {
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        [Op.or]: [{ userId: user.id }, { publisherUserId: user.id }],
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
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
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
}
