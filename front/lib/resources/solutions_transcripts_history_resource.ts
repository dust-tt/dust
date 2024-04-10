import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import { BaseResource } from "@app/lib/resources/base_resource";
import type { SolutionsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/solutions_transcripts_configuration";
import { SolutionsTranscriptsHistoryModel } from "@app/lib/resources/storage/models/solutions_transcripts_history";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SolutionsTranscriptsHistoryResource
  extends ReadonlyAttributesType<SolutionsTranscriptsHistoryModel> {}
export class SolutionsTranscriptsHistoryResource extends BaseResource<SolutionsTranscriptsHistoryModel> {
  static model: ModelStatic<SolutionsTranscriptsHistoryModel> =
    SolutionsTranscriptsHistoryModel;

  constructor(
    model: ModelStatic<SolutionsTranscriptsHistoryModel>,
    blob: Attributes<SolutionsTranscriptsHistoryModel>
  ) {
    super(SolutionsTranscriptsHistoryModel, blob);
  }

  static async makeNew({
    configurationId,
    fileId,
    fileName,
  }: {
    configurationId: SolutionsTranscriptsConfigurationModel["id"];
    fileId: string;
    fileName: string;
  }): Promise<SolutionsTranscriptsHistoryResource> {
    if (
      await SolutionsTranscriptsHistoryModel.count({
        where: {
          fileId: fileId,
        },
      })
    ) {
      throw new Error(
        `A Solution transcripts history already exists with fileId ${fileId}`
      );
    }
    const history = await SolutionsTranscriptsHistoryModel.create({
      configurationId,
      fileId,
      fileName,
    });

    return new SolutionsTranscriptsHistoryResource(
      SolutionsTranscriptsHistoryModel,
      history.get()
    );
  }

  static async findByFileId({
    fileId,
  }: {
    fileId: SolutionsTranscriptsHistoryModel["fileId"];
  }): Promise<SolutionsTranscriptsHistoryResource | null> {
    const history = await SolutionsTranscriptsHistoryModel.findOne({
      where: {
        fileId,
      },
    });

    if (!history) {
      return null;
    }

    return new SolutionsTranscriptsHistoryResource(
      SolutionsTranscriptsHistoryModel,
      history.get()
    );
  }

  static async listByConfigurationId({
    configurationId,
    limit = 20,
    sort = "DESC",
  }: {
    configurationId: SolutionsTranscriptsConfigurationModel["id"];
    limit: number;
    sort: "ASC" | "DESC";
  }): Promise<SolutionsTranscriptsHistoryResource[]> {
    const histories = await SolutionsTranscriptsHistoryModel.findAll({
      where: {
        configurationId,
      },
      limit,
      order: [["createdAt", sort]],
    });

    return histories.map(
      (history) =>
        new SolutionsTranscriptsHistoryResource(
          SolutionsTranscriptsHistoryModel,
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
