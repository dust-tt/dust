import type {
  ModelId,
  Result,
  TrackerConfigurationType,
  TrackerDataSourceConfigurationType,
} from "@dust-tt/types";
import { Err, Ok, removeNulls } from "@dust-tt/types";
import assert from "assert";
import type { Attributes, CreationAttributes, ModelStatic } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import {
  TrackerConfigurationModel,
  TrackerDataSourceConfigurationModel,
} from "@app/lib/models/doc_tracker";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
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

  readonly dataSourceConfigurations: TrackerDataSourceConfigurationModel[];

  constructor(
    model: ModelStatic<TrackerConfigurationModel>,
    blob: Attributes<TrackerConfigurationModel> & {
      dataSourceConfigurations: TrackerDataSourceConfigurationModel[];
    },
    space: SpaceResource
  ) {
    super(TrackerConfigurationResource.model, blob, space);
    this.dataSourceConfigurations = blob.dataSourceConfigurations;
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<TrackerConfigurationModel>,
    maintainedDataSources: TrackerDataSourceConfigurationType[],
    watchedDataSources: TrackerDataSourceConfigurationType[],
    space: SpaceResource
  ) {
    return frontSequelize.transaction(async (transaction) => {
      const tracker = await TrackerConfigurationModel.create(
        {
          ...blob,
          workspaceId: auth.getNonNullableWorkspace().id,
          vaultId: space.id,
          userId: auth.user()?.id ?? null,
        },
        { transaction }
      );

      const createdMaintainedDs = await Promise.all(
        maintainedDataSources.map(async (m) => {
          const dataSourceView = await DataSourceViewResource.fetchById(
            auth,
            m.dataSourceViewId
          );
          return TrackerDataSourceConfigurationModel.create(
            {
              scope: "maintained",
              parentsIn: m.filter.parents?.in ?? null,
              parentsNotIn: m.filter.parents?.not ?? null,
              trackerConfigurationId: tracker.id,
              dataSourceViewId: dataSourceView.id,
              dataSourceId: dataSourceView.dataSourceId,
            },
            { transaction }
          );
        })
      );

      const createdWatchedDs = await Promise.all(
        watchedDataSources.map(async (w) => {
          const dataSourceView = await DataSourceViewResource.fetchById(
            auth,
            w.dataSourceViewId
          );
          return TrackerDataSourceConfigurationModel.create(
            {
              scope: "watched",
              parentsIn: w.filter.parents?.in ?? null,
              parentsNotIn: w.filter.parents?.not ?? null,
              trackerConfigurationId: tracker.id,
              dataSourceViewId: dataSourceView.id,
              dataSourceId: dataSourceView.dataSourceId,
            },
            { transaction }
          );
        })
      );

      const dataSourceConfigurations = [
        ...createdMaintainedDs,
        ...createdWatchedDs,
      ];

      return new this(
        TrackerConfigurationResource.model,
        {
          ...tracker.get(),
          dataSourceConfigurations,
        },
        space
      );
    });
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
    blob: Partial<CreationAttributes<TrackerConfigurationModel>>,
    maintainedDataSources: TrackerDataSourceConfigurationType[],
    watchedDataSources: TrackerDataSourceConfigurationType[]
  ): Promise<Result<TrackerConfigurationResource, Error>> {
    assert(this.canWrite(auth), "Unauthorized write attempt");

    return frontSequelize.transaction(async (transaction) => {
      await this.update(blob);

      await TrackerDataSourceConfigurationModel.destroy({
        where: {
          trackerConfigurationId: this.id,
        },
        hardDelete: true,
        transaction,
      });

      for (const m of maintainedDataSources) {
        const dataSourceView = await DataSourceViewResource.fetchById(
          auth,
          m.dataSourceViewId
        );
        await TrackerDataSourceConfigurationModel.create(
          {
            scope: "maintained",
            parentsIn: m.filter.parents?.in ?? null,
            parentsNotIn: m.filter.parents?.not ?? null,
            trackerConfigurationId: this.id,
            dataSourceViewId: dataSourceView.id,
            dataSourceId: dataSourceView.dataSourceId,
          },
          { transaction }
        );
      }

      for (const w of watchedDataSources) {
        const dataSourceView = await DataSourceViewResource.fetchById(
          auth,
          w.dataSourceViewId
        );
        await TrackerDataSourceConfigurationModel.create(
          {
            scope: "watched",
            parentsIn: w.filter.parents?.in ?? null,
            parentsNotIn: w.filter.parents?.not ?? null,
            trackerConfigurationId: this.id,
            dataSourceViewId: dataSourceView.id,
            dataSourceId: dataSourceView.dataSourceId,
          },
          { transaction }
        );
      }

      const updatedTracker = await TrackerConfigurationResource.fetchById(
        auth,
        this.sId
      );
      if (updatedTracker) {
        return new Ok(updatedTracker);
      }
      return new Err(new Error("Failed to update tracker."));
    });
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<TrackerConfigurationModel>
  ) {
    // @todo(DOC_TRACKER) Fix to remove the ts-expect-error.
    // @ts-expect-error Resource with space does not like my include but it works.
    const trackers = await this.baseFetchWithAuthorization(auth, {
      ...options,
      includes: [
        {
          model: TrackerDataSourceConfigurationModel,
          as: "dataSourceConfigurations",
        },
      ],
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
    const dataSourceToJSON = (dsc: TrackerDataSourceConfigurationModel) => ({
      dataSourceViewId: makeSId("data_source_view", {
        id: dsc.dataSourceViewId,
        workspaceId: this.workspaceId,
      }),
      filter: {
        parents:
          dsc.parentsIn === null && dsc.parentsNotIn === null
            ? null
            : {
                in: dsc.parentsIn ?? [],
                not: dsc.parentsNotIn ?? [],
              },
      },
    });

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
      frequency: this.frequency ?? "daily",
      recipients: this.recipients ?? [],
      space: this.space.toJSON(),
      maintainedDataSources: this.dataSourceConfigurations
        .filter((dsc) => dsc.scope === "maintained")
        .map(dataSourceToJSON),
      watchedDataSources: this.dataSourceConfigurations
        .filter((dsc) => dsc.scope === "watched")
        .map(dataSourceToJSON),
    };
  }
}
