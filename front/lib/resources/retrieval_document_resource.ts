// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface

import type { Attributes, CreationAttributes } from "sequelize";
import { Op } from "sequelize";

import type {
  RetrievalDocumentChunkType,
  RetrievalDocumentType,
} from "@app/lib/actions/retrieval";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { isWebsite } from "@app/lib/data_sources";
import {
  RetrievalDocumentChunkModel,
  RetrievalDocumentModel,
} from "@app/lib/models/assistant/actions/retrieval";
import { BaseResource } from "@app/lib/resources/base_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelId, Result } from "@app/types";
import { removeNulls } from "@app/types";

export type RetrievalDocumentBlob = CreationAttributes<RetrievalDocumentModel>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface RetrievalDocumentResource
  extends ReadonlyAttributesType<RetrievalDocumentModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RetrievalDocumentResource extends BaseResource<RetrievalDocumentModel> {
  static model: ModelStaticWorkspaceAware<RetrievalDocumentModel> =
    RetrievalDocumentModel;

  constructor(
    model: ModelStaticWorkspaceAware<RetrievalDocumentModel>,
    blob: Attributes<RetrievalDocumentModel>,
    readonly chunks: RetrievalDocumentChunkType[],
    readonly dataSourceView?: DataSourceViewResource
  ) {
    super(RetrievalDocumentModel, blob);
  }

  static async makeNew(
    blob: RetrievalDocumentBlob,
    chunks: RetrievalDocumentChunkType[],
    dataSourceView: DataSourceViewResource
  ) {
    const [doc] = await this.makeNewBatch([{ blob, chunks, dataSourceView }]);

    return doc;
  }

  static async makeNewBatch(
    blobs: {
      blob: RetrievalDocumentBlob;
      chunks: RetrievalDocumentChunkType[];
      dataSourceView: DataSourceViewResource;
    }[]
  ) {
    const results = await frontSequelize.transaction(async (transaction) => {
      const createdDocuments = [];

      for (const { blob, chunks, dataSourceView } of blobs) {
        const doc = await this.model.create(
          {
            ...blob,
            dataSourceViewId: dataSourceView.id,
            workspaceId: dataSourceView.workspaceId,
          },
          { transaction }
        );

        for (const c of chunks) {
          await RetrievalDocumentChunkModel.create(
            {
              text: c.text,
              offset: c.offset,
              score: c.score,
              retrievalDocumentId: doc.id,
              workspaceId: dataSourceView.workspaceId,
            },
            { transaction }
          );
        }

        createdDocuments.push(
          new this(this.model, doc.get(), chunks, dataSourceView)
        );
      }

      return createdDocuments;
    });

    return results;
  }

  static async listAllForActions(auth: Authenticator, actionIds: ModelId[]) {
    const docs = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        retrievalActionId: {
          [Op.in]: actionIds,
        },
      },
      include: [
        {
          model: RetrievalDocumentChunkModel,
          as: "chunks",
        },
      ],
    });

    const uniqueDataSourceViewIds = removeNulls([
      ...new Set(docs.map((d) => d.dataSourceViewId)),
    ]);
    const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
      auth,
      uniqueDataSourceViewIds
    );

    const dataSourceViewsMap = dataSourceViews.reduce<
      Record<ModelId, DataSourceViewResource>
    >((acc, dsv) => {
      acc[dsv.id] = dsv;
      return acc;
    }, {});

    return docs.map(
      (d) =>
        new RetrievalDocumentResource(
          this.model,
          d.get(),
          d.chunks,
          d.dataSourceViewId
            ? dataSourceViewsMap[d.dataSourceViewId]
            : undefined
        )
    );
  }

  static async deleteAllForActions(auth: Authenticator, actionIds: ModelId[]) {
    const retrievalDocuments = await this.model.findAll({
      attributes: ["id"],
      where: {
        retrievalActionId: actionIds,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    await RetrievalDocumentChunkModel.destroy({
      where: { retrievalDocumentId: retrievalDocuments.map((d) => d.id) },
    });

    await this.model.destroy({
      where: { retrievalActionId: actionIds },
    });
  }

  delete(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  // Helpers.
  getSourceUrl(auth: Authenticator): string | null {
    // Prevent users from accessing document contents of a public data source
    // not associated with their workspace, unless it's a website.
    const { space, workspaceId, dataSource } = this.dataSourceView || {};
    const userWorkspaceId = auth.getNonNullableWorkspace().id;

    if (
      space?.isPublic() &&
      workspaceId !== userWorkspaceId &&
      dataSource &&
      !isWebsite(dataSource)
    ) {
      return null;
    }

    if (this.sourceUrl) {
      return this.sourceUrl;
    }

    if (!this.dataSourceView) {
      return null;
    }

    const dsv = this.dataSourceView.toJSON();

    return `${config.getClientFacingUrl()}/w/${
      auth.getNonNullableWorkspace().sId
    }/spaces/${dsv.spaceId}/categories/${
      dsv.category
    }/data_source_views/${dsv.sId}#?documentId=${encodeURIComponent(this.documentId)}`;
  }

  // Serialization.
  toJSON(auth: Authenticator): RetrievalDocumentType {
    return {
      id: this.id,
      dataSourceView: this.dataSourceView?.toJSON() || null,
      sourceUrl: this.getSourceUrl(auth),
      documentId: this.documentId,
      reference: this.reference,
      timestamp: this.documentTimestamp.getTime(),
      tags: this.tags,
      score: this.score,
      chunks: this.chunks
        ?.map((c) => ({
          offset: c.offset,
          score: c.score,
          text: c.text,
        }))
        .sort((a, b) => {
          if (a.score === null && b.score === null) {
            return a.offset - b.offset;
          }
          if (a.score !== null && b.score !== null) {
            return b.score - a.score;
          }
          throw new Error(
            "Unexpected comparison of null and non-null scored chunks."
          );
        }),
    };
  }
}
