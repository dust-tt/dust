import { DustProjectMountFileModel } from "@connectors/lib/models/dust_project";
import logger from "@connectors/logger/logger";
import { BaseResource } from "@connectors/resources/base_resource";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";
import type { ModelId } from "@connectors/types";
import { normalizeError } from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DustProjectMountFileResource
  extends ReadonlyAttributesType<DustProjectMountFileModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DustProjectMountFileResource extends BaseResource<DustProjectMountFileModel> {
  static model: ModelStatic<DustProjectMountFileModel> =
    DustProjectMountFileModel;

  constructor(
    model: ModelStatic<DustProjectMountFileModel>,
    blob: Attributes<DustProjectMountFileModel>
  ) {
    super(DustProjectMountFileModel, blob);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  static async makeNew({
    connectorId,
    projectId,
    scopedPath,
    documentId,
    sourceUpdatedAt,
    transaction,
  }: {
    connectorId: ModelId;
    projectId: string;
    scopedPath: string;
    documentId: string;
    sourceUpdatedAt: Date;
    transaction?: Transaction;
  }): Promise<DustProjectMountFileResource> {
    const model = await DustProjectMountFileModel.create(
      {
        connectorId,
        projectId,
        scopedPath,
        documentId,
        sourceUpdatedAt,
      },
      { transaction }
    );

    return new DustProjectMountFileResource(DustProjectMountFileModel, {
      ...model.get({ plain: true }),
    });
  }

  static async fetchByConnectorId(
    connectorId: ModelId
  ): Promise<DustProjectMountFileResource[]> {
    const models = await DustProjectMountFileModel.findAll({
      where: { connectorId },
    });

    return models.map(
      (m) =>
        new DustProjectMountFileResource(DustProjectMountFileModel, {
          ...m.get({ plain: true }),
        })
    );
  }

  static async fetchByConnectorIdAndScopedPath(
    connectorId: ModelId,
    scopedPath: string
  ): Promise<DustProjectMountFileResource | null> {
    const model = await DustProjectMountFileModel.findOne({
      where: { connectorId, scopedPath },
    });

    if (!model) {
      return null;
    }

    return new DustProjectMountFileResource(DustProjectMountFileModel, {
      ...model.get({ plain: true }),
    });
  }

  static async getMaxSourceUpdatedAt(
    connectorId: ModelId
  ): Promise<Date | null> {
    return DustProjectMountFileModel.max<
      Date | null,
      DustProjectMountFileModel
    >("sourceUpdatedAt", {
      where: { connectorId },
    });
  }

  async updateRow({
    documentId,
    sourceUpdatedAt,
    transaction,
  }: {
    documentId: string;
    sourceUpdatedAt: Date;
    transaction?: Transaction;
  }): Promise<Result<void, Error>> {
    try {
      await DustProjectMountFileModel.update(
        { documentId, sourceUpdatedAt },
        { where: { id: this.id }, transaction }
      );
      return new Ok(undefined);
    } catch (err) {
      logger.error(
        { connectorId: this.connectorId, error: err },
        "Error updating dust_project_mount_file"
      );
      return new Err(normalizeError(err));
    }
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    try {
      await DustProjectMountFileModel.destroy({
        where: { id: this.id },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      logger.error(
        { connectorId: this.connectorId, error: err },
        "Error deleting dust_project_mount_file"
      );
      return new Err(normalizeError(err));
    }
  }

  static async deleteByConnector(
    connector: ConnectorResource,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: { connectorId: connector.id },
      transaction,
    });
    return new Ok(undefined);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      connectorId: this.connectorId,
      projectId: this.projectId,
      scopedPath: this.scopedPath,
      documentId: this.documentId,
      sourceUpdatedAt: this.sourceUpdatedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
