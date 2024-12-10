import type { ModelId, Result, TrackerConfigurationType } from "@dust-tt/types";
import { Err, Ok, removeNulls } from "@dust-tt/types";
import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { TrackerConfigurationModel } from "@app/lib/models/doc_tracker";
import { ResourceWithSpace } from "@app/lib/resources/resource_with_space";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface TrackerConfigurationResource
  extends ReadonlyAttributesType<TrackerConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TrackerConfigurationResource extends ResourceWithSpace<TrackerConfigurationModel> {
  static model: ModelStatic<TrackerConfigurationModel> =
    TrackerConfigurationModel;

  constructor(
    model: ModelStatic<TrackerConfigurationModel>,
    blob: Attributes<TrackerConfigurationModel>,
    space: SpaceResource
  ) {
    super(TrackerConfigurationResource.model, blob, space);
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<TrackerConfigurationModel>,
    space: SpaceResource,
    transaction?: Transaction
  ) {
    // TODO Daph: Create all related resources.
    const tracker = await TrackerConfigurationModel.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
        vaultId: space.id,
        userId: auth.user()?.id ?? null,
      },
      { transaction }
    );

    return new this(TrackerConfigurationResource.model, tracker.get(), space);
  }

  // sId.

  get sId(): string {
    return TrackerConfigurationResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("tracker", {
      id,
      workspaceId,
    });
  }

  // Update.

  async updateConfig(
    auth: Authenticator,
    blob: Partial<CreationAttributes<TrackerConfigurationModel>>
  ): Promise<Result<TrackerConfigurationResource, Error>> {
    assert(this.canWrite(auth), "Unauthorized write attempt");

    await this.update(blob);
    const updatedTracker = await TrackerConfigurationResource.fetchById(
      auth,
      this.sId
    );
    if (updatedTracker) {
      return new Ok(updatedTracker);
    }
    return new Err(new Error("Failed to update tracker."));
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<TrackerConfigurationModel>
  ) {
    const trackers = await this.baseFetchWithAuthorization(auth, {
      ...options,
    });

    // This is what enforces the accessibility to an app.
    return trackers.filter(
      (tracker) => auth.isBuilder() || tracker.canRead(auth)
    );
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<TrackerConfigurationResource[]> {
    const modelIds = removeNulls(ids.map((id) => getResourceIdFromSId(id)));
    return this.baseFetch(auth, {
      where: {
        id: modelIds,
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<TrackerConfigurationResource | null> {
    const [tracker] = await this.fetchByIds(auth, [id]);

    return tracker ?? null;
  }

  static async listBySpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<TrackerConfigurationResource[]> {
    return this.baseFetch(auth, {
      where: {
        vaultId: space.id,
      },
    });
  }

  // Deletion.

  protected async hardDelete(
    auth: Authenticator
  ): Promise<Result<number, Error>> {
    const deletedCount = await frontSequelize.transaction(async (t) => {
      // TODO Daph: Delete all related resources.
      // await TrackerDataSourceConfigurationResource.deleteAllByTrackerId(this.id, t);
      // await TrackerGenerationResource.deleteAllByTrackerId(this.id, t);

      return TrackerConfigurationModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        transaction: t,
        // Use 'hardDelete: true' to ensure the record is permanently deleted from the database,
        // bypassing the soft deletion in place.
        hardDelete: true,
      });
    });

    return new Ok(deletedCount);
  }

  protected async softDelete(
    auth: Authenticator
  ): Promise<Result<number, Error>> {
    const deletedCount = await TrackerConfigurationModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      hardDelete: false,
    });

    return new Ok(deletedCount);
  }

  // Serialization.

  toJSON(): TrackerConfigurationType {
    return {
      id: this.id,
      sId: this.sId,
      name: this.name,
      description: this.description,
      status: this.status,
      modelId: this.modelId,
      providerId: this.providerId,
      temperature: this.temperature,
      prompt: this.prompt,
      frequency: this.frequency,
      recipients: this.recipients ?? [],
      space: this.space.toJSON(),
    };
  }
}
