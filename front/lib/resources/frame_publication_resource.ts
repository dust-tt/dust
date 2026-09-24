import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationModel } from "@app/lib/resources/storage/models/frame_publication";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import assert from "assert";
import type { Attributes, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FramePublicationResource
  extends ReadonlyAttributesType<FramePublicationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FramePublicationResource extends BaseResource<FramePublicationModel> {
  static model: ModelStaticWorkspaceAware<FramePublicationModel> =
    FramePublicationModel;

  constructor(
    model: ModelStaticWorkspaceAware<FramePublicationModel>,
    blob: Attributes<FramePublicationModel>
  ) {
    super(model, blob);
  }

  private static assertFrameOfWorkspace(
    auth: Authenticator,
    frame: FileResource
  ): void {
    assert(frame.isFrameV2, "Frame publications require a Frames v2 file.");
    assert(
      frame.workspaceId === auth.getNonNullableWorkspace().id,
      "The Frame must belong to the authenticated workspace."
    );
  }

  /**
   * The publisher is the auth's user, null for a non-user caller.
   */
  static async makeNew(
    auth: Authenticator,
    { frame, publicationId }: { frame: FileResource; publicationId: string }
  ): Promise<FramePublicationResource> {
    this.assertFrameOfWorkspace(auth, frame);

    const row = await this.model.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      fileId: frame.id,
      publicationId,
      publishedByUserId: auth.user()?.id ?? null,
    });

    return new this(this.model, row.get());
  }

  static async deleteForFramePublications(
    auth: Authenticator,
    { frame, publicationIds }: { frame: FileResource; publicationIds: string[] }
  ): Promise<number> {
    this.assertFrameOfWorkspace(auth, frame);

    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        fileId: frame.id,
        publicationId: publicationIds,
      },
    });
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

  /**
   * A publication row describes objects in GCS: it goes with its Frame, or with its GCS prefix
   * through `deleteForFramePublications`, never on its own.
   */
  async delete(
    _auth: Authenticator,
    _options: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    return new Err(
      new Error(
        "A Frame publication cannot be deleted on its own: delete its Frame instead."
      )
    );
  }
}
