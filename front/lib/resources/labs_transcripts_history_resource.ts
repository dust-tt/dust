import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import type { CreationAttributes } from "sequelize";

import { BaseResource } from "@app/lib/resources/base_resource";
import type { LabsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/labs_transcripts";
import { LabsTranscriptsHistoryModel } from "@app/lib/resources/storage/models/labs_transcripts";
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
    blob: Attributes<LabsTranscriptsHistoryModel>
  ) {
    super(LabsTranscriptsHistoryModel, blob);
  }

  static async makeNew(blob: Omit<CreationAttributes<LabsTranscriptsHistoryModel>, "id">): Promise<LabsTranscriptsHistoryResource> {
    const { configurationId, fileId, fileName } = blob;

    const history = await LabsTranscriptsHistoryModel.create({
      configurationId,
      fileId,
      fileName,
    });

    return new LabsTranscriptsHistoryResource(
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
