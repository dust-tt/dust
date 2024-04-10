import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import { BaseResource } from "@app/lib/resources/base_resource";
import type { LabsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/labs_transcripts_configuration";
import { LabsTranscriptsHistoryModel } from "@app/lib/resources/storage/models/labs_transcripts_history";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface LabsTranscriptsHistoryResource
  extends ReadonlyAttributesType<LabsTranscriptsHistoryModel> {}
export class LabsTranscriptsHistoryResource extends BaseResource<LabsTranscriptsHistoryModel> {
  static model: ModelStatic<LabsTranscriptsHistoryModel> =
    LabsTranscriptsHistoryModel;

  constructor(
    model: ModelStatic<LabsTranscriptsHistoryModel>,
    blob: Attributes<LabsTranscriptsHistoryModel>
  ) {
    super(LabsTranscriptsHistoryModel, blob);
  }

  static async makeNew({
    configurationId,
    fileId,
    fileName,
  }: {
    configurationId: LabsTranscriptsConfigurationModel["id"];
    fileId: string;
    fileName: string;
  }): Promise<LabsTranscriptsHistoryResource> {
    if (
      await LabsTranscriptsHistoryModel.count({
        where: {
          fileId: fileId,
        },
      })
    ) {
      throw new Error(
        `A Solution transcripts history already exists with fileId ${fileId}`
      );
    }
    const history = await LabsTranscriptsHistoryModel.create({
      configurationId,
      fileId,
      fileName,
    });

    return new LabsTranscriptsHistoryResource(
      LabsTranscriptsHistoryModel,
      history.get()
    );
  }

  static async findByFileId({
    fileId,
  }: {
    fileId: LabsTranscriptsHistoryModel["fileId"];
  }): Promise<LabsTranscriptsHistoryResource | null> {
    const history = await LabsTranscriptsHistoryModel.findOne({
      where: {
        fileId,
      },
    });

    if (!history) {
      return null;
    }

    return new LabsTranscriptsHistoryResource(
      LabsTranscriptsHistoryModel,
      history.get()
    );
  }

  static async listByConfigurationId({
    configurationId,
    limit = 20,
    sort = "DESC",
  }: {
    configurationId: LabsTranscriptsConfigurationModel["id"];
    limit: number;
    sort: "ASC" | "DESC";
  }): Promise<LabsTranscriptsHistoryResource[]> {
    const histories = await LabsTranscriptsHistoryModel.findAll({
      where: {
        configurationId,
      },
      limit,
      order: [["createdAt", sort]],
    });

    return histories.map(
      (history) =>
        new LabsTranscriptsHistoryResource(
          LabsTranscriptsHistoryModel,
          history.get()
        )
    );
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }
}
