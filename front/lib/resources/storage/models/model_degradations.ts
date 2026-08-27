import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { CreationOptional } from "sequelize";

export type ModelDegradationStatus = "ongoing" | "resolved";

/**
 * One row per degradation of one model: the model was marked degraded at
 * `startedAt`, and either still is (`status: "ongoing"`, `endedAt: null`) or
 * stopped being at `endedAt` (`status: "resolved"`).
 *
 * The set of models degraded right now is the set of `"ongoing"` rows, so this
 * table is both the live state and its own history: there is no separate switch
 * to keep in sync.
 */
export class ModelDegradationModel extends BaseModel<ModelDegradationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Widened to `string` for dynamic models coming from GCS, and because a model
  // dropped from the catalog must not make its past degradations unreadable.
  declare modelId: string;
  declare providerId: ModelProviderIdType;
  declare startedAt: Date;
  declare endedAt: Date | null;
  declare status: ModelDegradationStatus;
}

ModelDegradationModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    modelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "model_degradation",
    tableName: "model_degradations",
    sequelize: frontSequelize,
    indexes: [
      // At most one ongoing degradation per model: the invariant that lets the
      // ongoing rows stand in for the live degraded set.
      {
        fields: ["modelId"],
        unique: true,
        name: "model_degradations_model_id_ongoing_unique_idx",
        where: { status: "ongoing" },
      },
      { fields: ["startedAt"], name: "model_degradations_started_at_idx" },
    ],
  }
);
