import type { Host } from "@app/lib/model_constructors/types/hosts";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { CreationOptional } from "sequelize";

export class ModelDegradationModel extends BaseModel<ModelDegradationModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare modelId: ModelIdType;
  declare providerId: ModelProviderIdType;
  declare host: Host;
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
    host: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "model_degradations",
    tableName: "model_degradations",
    sequelize: frontSequelize,
    indexes: [{ unique: true, fields: ["modelId", "providerId", "host"] }],
  }
);
