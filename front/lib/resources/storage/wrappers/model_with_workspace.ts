import type {
  ForeignKey,
  InitOptions,
  Model,
  ModelAttributes,
  ModelStatic,
  NonAttribute,
} from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";

export class ModelWithWorkspace<M extends Model> extends BaseModel<M> {
  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare connector: NonAttribute<Workspace>;

  static override init<MS extends ModelStatic<Model>>(
    this: MS,
    attributes: ModelAttributes<InstanceType<MS>>,
    options: InitOptions<InstanceType<MS>> & {
      relationship?: "hasMany" | "hasOne";
      softDeletable?: boolean;
    }
  ): MS {
    const attrs = {
      ...attributes,
      workspaceId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: Workspace.name,
          key: "id",
        },
      },
    };

    const { relationship = "hasMany", ...restOptions } = options;
    const model = super.init(attrs, restOptions);

    if (relationship === "hasOne") {
      Workspace.hasOne(model, {
        foreignKey: { allowNull: false },
        onDelete: "RESTRICT",
      });
    } else {
      Workspace.hasMany(model, {
        foreignKey: { allowNull: false },
        onDelete: "RESTRICT",
      });
    }

    model.belongsTo(Workspace, {
      foreignKey: { allowNull: false },
    });

    return model;
  }
}

export class SoftDeletableModelWithWorkspace<
  M extends Model,
> extends ModelWithWorkspace<M> {}
