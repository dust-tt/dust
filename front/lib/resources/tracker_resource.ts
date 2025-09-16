import assert from "assert";
import { parseExpression } from "cron-parser";
import _ from "lodash";
import type { Attributes, CreationAttributes, ModelStatic } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import {
  TrackerConfigurationModel,
  TrackerDataSourceConfigurationModel,
  TrackerGenerationModel,
} from "@app/lib/models/doc_tracker";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { ResourceWithSpace } from "@app/lib/resources/resource_with_space";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type {
  ModelId,
  Result,
  TrackerConfigurationType,
  TrackerDataSourceConfigurationType,
  TrackerIdWorkspaceId,
} from "@app/types";
import { Err, Ok, removeNulls } from "@app/types";

export type TrackerMaintainedScopeType = Array<{
  dataSourceViewId: string;
  dataSourceId: string;
  filter: {
    parents: {
      in: string[] | null;
      not: string[] | null;
    };
  } | null;
}>;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface TrackerConfigurationResource
  extends ReadonlyAttributesType<TrackerConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TrackerConfigurationResource extends ResourceWithSpace<TrackerConfigurationModel> {
  static model: ModelStaticWorkspaceAware<TrackerConfigurationModel> =
    TrackerConfigurationModel;

  readonly dataSourceConfigurations: TrackerDataSourceConfigurationModel[];
  readonly generations: TrackerGenerationModel[];

  constructor(
    model: ModelStatic<TrackerConfigurationModel>,
    blob: Attributes<TrackerConfigurationModel> & {
      dataSourceConfigurations: TrackerDataSourceConfigurationModel[];
      generations: TrackerGenerationModel[];
    },
    space: SpaceResource
  ) {
    super(TrackerConfigurationResource.model, blob, space);
    this.dataSourceConfigurations = blob.dataSourceConfigurations;
    this.generations = blob.generations;
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<TrackerConfigurationModel>,
    maintainedDataSources: TrackerDataSourceConfigurationType[],
    watchedDataSources: TrackerDataSourceConfigurationType[],
    space: SpaceResource
  ) {
    return withTransaction(async (transaction) => {
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
          if (!dataSourceView) {
            throw new Error(
              `Data source view not found: ${m.dataSourceViewId}`
            );
          }
          return TrackerDataSourceConfigurationModel.create(
            {
              scope: "maintained",
              parentsIn: m.filter.parents?.in ?? null,
              parentsNotIn: m.filter.parents?.not ?? null,
              trackerConfigurationId: tracker.id,
              dataSourceViewId: dataSourceView.id,
              dataSourceId: dataSourceView.dataSourceId,
              workspaceId: dataSourceView.workspaceId,
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
          if (!dataSourceView) {
            throw new Error(
              `Data source view not found: ${w.dataSourceViewId}`
            );
          }
          return TrackerDataSourceConfigurationModel.create(
            {
              scope: "watched",
              parentsIn: w.filter.parents?.in ?? null,
              parentsNotIn: w.filter.parents?.not ?? null,
              trackerConfigurationId: tracker.id,
              dataSourceViewId: dataSourceView.id,
              dataSourceId: dataSourceView.dataSourceId,
              workspaceId: dataSourceView.workspaceId,
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
          generations: [],
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

    return withTransaction(async (transaction) => {
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
        if (!dataSourceView) {
          return new Err(
            new Error(`Data source view not found: ${m.dataSourceViewId}`)
          );
        }
        await TrackerDataSourceConfigurationModel.create(
          {
            scope: "maintained",
            parentsIn: m.filter.parents?.in ?? null,
            parentsNotIn: m.filter.parents?.not ?? null,
            trackerConfigurationId: this.id,
            dataSourceViewId: dataSourceView.id,
            dataSourceId: dataSourceView.dataSourceId,
            workspaceId: this.workspaceId,
          },
          { transaction }
        );
      }

      for (const w of watchedDataSources) {
        const dataSourceView = await DataSourceViewResource.fetchById(
          auth,
          w.dataSourceViewId
        );
        if (!dataSourceView) {
          return new Err(
            new Error(`Data source view not found: ${w.dataSourceViewId}`)
          );
        }
        await TrackerDataSourceConfigurationModel.create(
          {
            scope: "watched",
            parentsIn: w.filter.parents?.in ?? null,
            parentsNotIn: w.filter.parents?.not ?? null,
            trackerConfigurationId: this.id,
            dataSourceViewId: dataSourceView.id,
            dataSourceId: dataSourceView.dataSourceId,
            workspaceId: this.workspaceId,
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

  async addGeneration({
    generation,
    thinking,
    dataSourceId,
    documentId,
    maintainedDocumentId,
    maintainedDocumentDataSourceId,
  }: {
    generation: string;
    thinking: string | null;
    dataSourceId: string;
    documentId: string;
    maintainedDocumentId: string;
    maintainedDocumentDataSourceId: string;
  }) {
    const dataSourceModelId = getResourceIdFromSId(dataSourceId);
    if (!dataSourceModelId) {
      throw new Error(`Invalid data source ID: ${dataSourceId}`);
    }
    const maintainedDocumentDataSourceModelId = getResourceIdFromSId(
      maintainedDocumentDataSourceId
    );
    if (!maintainedDocumentDataSourceModelId) {
      throw new Error(
        `Invalid maintained data source ID: ${maintainedDocumentDataSourceId}`
      );
    }

    await TrackerGenerationModel.create({
      content: generation,
      thinking,
      dataSourceId: dataSourceModelId,
      documentId,
      maintainedDocumentId: maintainedDocumentId,
      maintainedDocumentDataSourceId: maintainedDocumentDataSourceModelId,
      trackerConfigurationId: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static async consumeGenerations({
    auth,
    trackerId,
    generationIds,
    currentRunMs,
  }: {
    auth: Authenticator;
    trackerId: ModelId;
    generationIds: ModelId[];
    currentRunMs: number;
  }): Promise<Result<number, Error>> {
    const [tracker] = await this.baseFetch(auth, {
      where: {
        id: trackerId,
        status: "active",
      },
    });

    if (!tracker) {
      return new Err(new Error("Tracker not found"));
    }

    return withTransaction(async (transaction) => {
      await tracker.update(
        { lastNotifiedAt: new Date(currentRunMs) },
        transaction
      );
      // We don't want to consume generations that were created after the notification was sent.
      // So we cannot filter on consumedAt being null and have to provide the IDs explicitly.
      const consumedCount = await TrackerGenerationModel.update(
        { consumedAt: new Date(currentRunMs) },
        {
          where: {
            id: generationIds,
            consumedAt: null,
          },
          transaction,
        }
      );
      return new Ok(consumedCount[0]);
    });
  }

  // Fetching.

  async fetchMaintainedScope(): Promise<TrackerMaintainedScopeType> {
    const maintainedDataSources =
      await TrackerDataSourceConfigurationModel.findAll({
        where: {
          trackerConfigurationId: this.id,
          scope: "maintained",
          workspaceId: this.workspaceId,
        },
      });

    return maintainedDataSources.map((m) => ({
      dataSourceViewId: makeSId("data_source_view", {
        id: m.dataSourceViewId,
        workspaceId: this.workspaceId,
      }),
      dataSourceId: makeSId("data_source", {
        id: m.dataSourceId,
        workspaceId: this.workspaceId,
      }),
      filter:
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        m.parentsIn || m.parentsNotIn
          ? {
              parents: {
                in: m.parentsIn,
                not: m.parentsNotIn,
              },
            }
          : null,
    }));
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<TrackerConfigurationModel>
  ) {
    // @todo(DOC_TRACKER) Fix to remove the ts-expect-error.
    // @ts-expect-error Resource with space does not like my include but it works.
    const trackers = await this.baseFetchWithAuthorization(auth, {
      ...options,
      where: {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        ...(options?.where || {}),
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      includes: [
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        ...(options?.includes || []),
        {
          model: TrackerDataSourceConfigurationModel,
          as: "dataSourceConfigurations",
        },
      ],
    });

    // This is what enforces the accessibility to a Tracker.
    return trackers.filter(
      (tracker) => auth.isAdmin() || tracker.canRead(auth)
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
    space: SpaceResource,
    { includeDeleted }: { includeDeleted?: boolean } = {}
  ): Promise<TrackerConfigurationResource[]> {
    return this.baseFetch(auth, {
      where: {
        vaultId: space.id,
      },
      includeDeleted,
    });
  }

  static async listByWorkspace(
    auth: Authenticator,
    { includeDeleted }: { includeDeleted?: boolean } = {}
  ): Promise<TrackerConfigurationResource[]> {
    return this.baseFetch(auth, {
      includeDeleted,
    });
  }

  static async fetchWithGenerationsToConsume(
    auth: Authenticator,
    id: ModelId
  ): Promise<TrackerConfigurationType | null> {
    const [tracker] = await this.baseFetch(auth, {
      where: {
        id,
        status: "active",
      },
      includes: [
        {
          model: TrackerGenerationModel,
          as: "generations",
          where: {
            consumedAt: null,
          },
          required: false,
          include: [
            {
              model: DataSourceModel,
              as: "dataSource",
              required: true,
            },
            {
              model: DataSourceModel,
              as: "maintainedDocumentDataSource",
              required: false,
            },
          ],
        },
      ],
    });

    return tracker?.toJSON() ?? null;
  }

  // Internal method for fetching trackers without any authorization checks.
  // Not intended for use outside of the Tracker workflow.
  // Fetches the active trackers that need to be processed for notifications.
  static async internalFetchTrackersToNotify(
    currentRunMs: number
  ): Promise<TrackerIdWorkspaceId[]> {
    // Look back 20 minutes to ensure we don't miss any runs.
    const LOOK_BACK_PERIOD_MS = 1 * 20 * 60 * 1000; // 20 minutes.
    const lookBackMs = currentRunMs - LOOK_BACK_PERIOD_MS;
    const lookForwardMs = currentRunMs + LOOK_BACK_PERIOD_MS;

    const trackers = await TrackerConfigurationResource.model.findAll({
      attributes: ["id", "frequency", "lastNotifiedAt", "createdAt"],
      where: {
        status: "active",
        frequency: {
          [Op.not]: null,
        },
        lastNotifiedAt: { [Op.or]: [{ [Op.lt]: new Date(lookBackMs) }, null] },
        deletedAt: null,
      },
      // WORKSPACE_ISOLATION_BYPASS: Allow global query as we have one global workflow for all workspaces
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      include: [
        {
          model: WorkspaceModel,
          attributes: ["sId"],
          required: true,
        },
      ],
    });

    const filteredTrackers = trackers.filter((tracker) => {
      if (!tracker.frequency) {
        return false;
      }

      try {
        const interval = parseExpression(tracker.frequency, {
          currentDate: tracker.lastNotifiedAt ?? tracker.createdAt, // Start from the last run to avoid missing a run.
        });
        const nextExpectedRunMs = interval.next().getTime();

        return (
          nextExpectedRunMs >= lookBackMs && nextExpectedRunMs <= lookForwardMs
        );
      } catch (e) {
        logger.error(
          {
            trackerId: tracker.id,
            frequency: tracker.frequency,
            error: e,
          },
          "[Tracker] Invalid cron expression or parsing error"
        );
        throw new Error(
          `[Tracker] Invalid cron expression or parsing error for #${tracker.id}`
        );
      }
    });

    return filteredTrackers.map((tracker) => ({
      trackerId: tracker.id,
      workspaceId: tracker.workspace.sId,
    }));
  }

  static async fetchAllWatchedForDocument(
    auth: Authenticator,
    {
      dataSourceId,
      parentIds,
    }: {
      dataSourceId: string;
      parentIds: string[] | null;
    }
  ): Promise<TrackerConfigurationResource[]> {
    const owner = auth.getNonNullableWorkspace();

    const dataSourceModelId = getResourceIdFromSId(dataSourceId);

    if (!dataSourceModelId) {
      throw new Error(`Invalid data source ID: ${dataSourceId}`);
    }

    let dsConfigs = await TrackerDataSourceConfigurationModel.findAll({
      where: {
        workspaceId: owner.id,
        dataSourceId: dataSourceModelId,
        scope: "watched",
        // TODO(DOC_TRACKER): GIN index.
        parentsIn: parentIds
          ? {
              [Op.overlap]: parentIds,
            }
          : null,
      },
      attributes: ["trackerConfigurationId", "dataSourceViewId"],
    });

    // Only consider the ds Configs for which the document is in the data source view.
    const dsViewIds = dsConfigs.map((c) =>
      makeSId("data_source_view", {
        id: c.dataSourceViewId,
        workspaceId: owner.id,
      })
    );
    const parentsSet = new Set(parentIds);
    const dsViews = await DataSourceViewResource.fetchByIds(auth, dsViewIds);
    // These are the data source views that contain the document.
    const validDsViewIds = new Set(
      dsViews
        .filter(
          (dsView) =>
            dsView.parentsIn === null ||
            dsView.parentsIn.some((p) => parentsSet.has(p))
        )
        .map((dsView) => dsView.id)
    );

    dsConfigs = dsConfigs.filter((c) => validDsViewIds.has(c.dataSourceViewId));

    // Fetch the associated tracker configurations
    const trackerIds = _.uniq(
      dsConfigs.map((config) => config.trackerConfigurationId)
    );

    return this.baseFetch(auth, {
      where: {
        id: trackerIds,
        status: "active",
      },
    });
  }

  // Deletion.

  protected async hardDelete(
    auth: Authenticator
  ): Promise<Result<number, Error>> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const deletedCount = await withTransaction(async (t) => {
      await TrackerGenerationModel.destroy({
        where: {
          trackerConfigurationId: this.id,
        },
        transaction: t,
        hardDelete: true,
      });
      await TrackerDataSourceConfigurationModel.destroy({
        where: {
          trackerConfigurationId: this.id,
        },
        transaction: t,
        hardDelete: true,
      });
      return TrackerConfigurationModel.destroy({
        where: {
          id: this.id,
          workspaceId,
        },
        transaction: t,
        hardDelete: true,
      });
    });

    return new Ok(deletedCount);
  }

  protected async softDelete(
    auth: Authenticator
  ): Promise<Result<number, Error>> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const deletedCount = await withTransaction(async (t) => {
      await TrackerGenerationModel.destroy({
        where: {
          trackerConfigurationId: this.id,
        },
        transaction: t,
        hardDelete: false,
      });
      await TrackerDataSourceConfigurationModel.destroy({
        where: {
          trackerConfigurationId: this.id,
        },
        transaction: t,
        hardDelete: false,
      });
      return TrackerConfigurationModel.destroy({
        where: {
          id: this.id,
          workspaceId,
        },
        transaction: t,
        hardDelete: false,
      });
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

    const tracker: TrackerConfigurationType = {
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
      skipEmptyEmails: this.skipEmptyEmails,
      recipients: this.recipients ?? [],
      space: this.space.toJSON(),
      maintainedDataSources: this.dataSourceConfigurations
        .filter((dsc) => dsc.scope === "maintained")
        .map(dataSourceToJSON),
      watchedDataSources: this.dataSourceConfigurations
        .filter((dsc) => dsc.scope === "watched")
        .map(dataSourceToJSON),
      createdAt: this.createdAt.getTime(),
    };

    if (this.generations?.length) {
      tracker.generations = this.generations.map((g) => {
        const dataSourceName = g.dataSource.connectorProvider
          ? CONNECTOR_CONFIGURATIONS[g.dataSource.connectorProvider].name
          : `Folder ${g.dataSource.name}`;

        return {
          id: g.id,
          content: g.content,
          thinking: g.thinking,
          documentId: g.documentId,
          dataSource: {
            id: g.dataSourceId,
            name: dataSourceName,
            dustAPIProjectId: g.dataSource.dustAPIProjectId,
            dustAPIDataSourceId: g.dataSource.dustAPIDataSourceId,
          },
          maintainedDocumentDataSource: g.maintainedDocumentDataSource
            ? {
                id: g.maintainedDocumentDataSource.id,
                name: dataSourceName,
                dustAPIProjectId:
                  g.maintainedDocumentDataSource.dustAPIProjectId,
                dustAPIDataSourceId:
                  g.maintainedDocumentDataSource.dustAPIDataSourceId,
              }
            : null,
          maintainedDocumentId: g.maintainedDocumentId,
        };
      });
    }

    return tracker;
  }
}
