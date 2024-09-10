// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface

import type {
  ModelId,
  Result,
  RetrievalDocumentChunkType,
  RetrievalDocumentType,
} from "@dust-tt/types";
import type { Attributes, CreationAttributes, ModelStatic } from "sequelize";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import {
  RetrievalDocument,
  RetrievalDocumentChunk,
} from "@app/lib/models/assistant/actions/retrieval";
import { BaseResource } from "@app/lib/resources/base_resource";
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
    readonly chunks: RetrievalDocumentChunkType[]
  ) {
    super(RetrievalDocument, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: RetrievalDocumentBlob,
    chunks: RetrievalDocumentChunkType[]
    // TODO(GROUPS_INFRA) Add supports for dataSourceViewId.
  ) {
    const [doc] = await this.makeNewBatch(auth, [{ blob, chunks }]);

    return doc;
  }

  static async makeNewBatch(
    auth: Authenticator,
    blobs: {
      blob: RetrievalDocumentBlob;
      chunks: RetrievalDocumentChunkType[];
      // TODO(GROUPS_INFRA) Add supports for dataSourceViewId.
    }[]
  ) {
    // TODO(GROUPS_INFRA) Use auth.workspaceId.
    const results = await frontSequelize.transaction(async (transaction) => {
      const createdDocuments = [];

      for (const { blob, chunks } of blobs) {
        const doc = await RetrievalDocument.create(blob, { transaction });

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

        createdDocuments.push(new this(RetrievalDocument, doc.get(), chunks));
      }

      return createdDocuments;
    });

    return results;
  }

  static async listAllForActions(actionIds: ModelId[]) {
    const docs = await RetrievalDocument.findAll({
      where: {
        retrievalActionId: actionIds,
      },
      order: [["documentTimestamp", "DESC"]],
      include: [
        {
          model: RetrievalDocumentChunk,
          as: "chunks",
        },
      ],
    });

    return docs.map(
      (d) => new RetrievalDocumentResource(this.model, d.get(), d.chunks)
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
  getSourceUrl(): string | null {
    if (this.sourceUrl) {
      return this.sourceUrl;
    }

    return `${config.getClientFacingUrl()}/w/${
      this.dataSourceWorkspaceId
    }/builder/data-sources/${
      this.dataSourceId
    }/upsert?documentId=${encodeURIComponent(this.documentId)}`;
  }

  // Serialization.

  toJSON(): RetrievalDocumentType {
    return {
      id: this.id,
      dataSourceWorkspaceId: this.dataSourceWorkspaceId,
      dataSourceId: this.dataSourceId,
      sourceUrl: this.getSourceUrl(),
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
