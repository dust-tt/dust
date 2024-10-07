// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface

import type {
  ModelId,
  Result,
  RetrievalDocumentChunkType,
  RetrievalDocumentType,
} from "@dust-tt/types";
import { removeNulls } from "@dust-tt/types";
import type { Attributes, CreationAttributes, ModelStatic } from "sequelize";
import { Op } from "sequelize";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { isWebsite } from "@app/lib/data_sources";
import {
  RetrievalDocument,
  RetrievalDocumentChunk,
} from "@app/lib/models/assistant/actions/retrieval";
import { BaseResource } from "@app/lib/resources/base_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

export type RetrievalDocumentBlob = CreationAttributes<RetrievalDocument>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface RetrievalDocumentResource
  extends ReadonlyAttributesType<RetrievalDocument> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RetrievalDocumentResource extends BaseResource<RetrievalDocument> {
  static model: ModelStatic<RetrievalDocument> = RetrievalDocument;

  constructor(
    model: ModelStatic<RetrievalDocument>,
    blob: Attributes<RetrievalDocument>,
    readonly chunks: RetrievalDocumentChunkType[],
    readonly dataSourceView?: DataSourceViewResource
  ) {
    super(RetrievalDocument, blob);
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
        const doc = await RetrievalDocument.create(
          {
            ...blob,
            dataSourceViewId: dataSourceView.id,
          },
          { transaction }
        );

        for (const c of chunks) {
          await RetrievalDocumentChunk.create(
            {
              text: c.text,
              offset: c.offset,
              score: c.score,
              retrievalDocumentId: doc.id,
            },
            { transaction }
          );
        }

        createdDocuments.push(
          new this(RetrievalDocument, doc.get(), chunks, dataSourceView)
        );
      }

      return createdDocuments;
    });

    return results;
  }

  static async listAllForActions(auth: Authenticator, actionIds: ModelId[]) {
    const docs = await RetrievalDocument.findAll({
      where: {
        retrievalActionId: {
          [Op.in]: actionIds,
        },
      },
      order: [["documentTimestamp", "DESC"]],
      include: [
        {
          model: RetrievalDocumentChunk,
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

  static async deleteAllForActions(actionIds: ModelId[]) {
    const retrievalDocuments = await RetrievalDocument.findAll({
      attributes: ["id"],
      where: { retrievalActionId: actionIds },
    });

    await RetrievalDocumentChunk.destroy({
      where: { retrievalDocumentId: retrievalDocuments.map((d) => d.id) },
    });

    await RetrievalDocument.destroy({
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
    const { vault, workspaceId, dataSource } = this.dataSourceView || {};
    const userWorkspaceId = auth.getNonNullableWorkspace().id;

    if (
      vault?.isPublic() &&
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
    }/vaults/${dsv.vaultId}/categories/${
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
