import type {
  EmbeddingProviderIdType,
  RoleType,
  WorkspaceSegmentationType,
} from "@dust-tt/types";
import { MODEL_PROVIDER_IDS } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import type { Subscription } from "@app/lib/models/plan";
import { User } from "@app/lib/models/user";
import { frontSequelize } from "@app/lib/resources/storage";

const modelProviders = [...MODEL_PROVIDER_IDS] as string[];
export type ModelProviderIdType = (typeof MODEL_PROVIDER_IDS)[number];

export class Workspace extends Model<
  InferAttributes<Workspace>,
  InferCreationAttributes<Workspace>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare name: string;
  declare description: string | null;
  declare segmentation: WorkspaceSegmentationType;
  declare ssoEnforced?: boolean;
  declare subscriptions: NonAttribute<Subscription[]>;
  declare whiteListedProviders: ModelProviderIdType[] | null;
  declare defaultEmbeddingProvider: EmbeddingProviderIdType | null;
}
Workspace.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
    segmentation: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ssoEnforced: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    whiteListedProviders: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: null,
      allowNull: true,
      validate: {
        isProviderValid(value: string[] | null) {
          if (value && !value.every((val) => modelProviders.includes(val))) {
            throw new Error("Invalid provider in whiteListedProviders");
          }
        },
      },
    },
    defaultEmbeddingProvider: {
      type: DataTypes.STRING,
      defaultValue: null,
      allowNull: true,
      validate: {
        isIn: [modelProviders],
      },
    },
  },
  {
    modelName: "workspace",
    sequelize: frontSequelize,
    indexes: [{ unique: true, fields: ["sId"] }],
  }
);

export class WorkspaceHasDomain extends Model<
  InferAttributes<WorkspaceHasDomain>,
  InferCreationAttributes<WorkspaceHasDomain>
> {
  declare createdAt: CreationOptional<Date>;
  declare domain: string;
  declare domainAutoJoinEnabled: CreationOptional<boolean>;
  declare id: CreationOptional<number>;
  declare updatedAt: CreationOptional<Date>;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare workspace?: NonAttribute<Workspace>;
}
WorkspaceHasDomain.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    domainAutoJoinEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    domain: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "workspace_has_domains",
    sequelize: frontSequelize,
    indexes: [{ unique: true, fields: ["domain"] }],
  }
);
Workspace.hasMany(WorkspaceHasDomain, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
WorkspaceHasDomain.belongsTo(Workspace);

export class MembershipInvitation extends Model<
  InferAttributes<MembershipInvitation>,
  InferCreationAttributes<MembershipInvitation>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare inviteEmail: string;
  declare status: "pending" | "consumed" | "revoked";
  declare initialRole: Exclude<RoleType, "none">;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare invitedUserId: ForeignKey<User["id"]> | null;

  declare workspace: NonAttribute<Workspace>;
}
MembershipInvitation.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    inviteEmail: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    initialRole: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "user",
    },
    invitedUserId: {
      type: DataTypes.INTEGER,
      references: {
        model: "users",
        key: "id",
      },
    },
  },
  {
    modelName: "membership_invitation",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "status"] },
      { unique: true, fields: ["sId"] },
      { fields: ["inviteEmail", "status"] },
    ],
  }
);
Workspace.hasMany(MembershipInvitation, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
MembershipInvitation.belongsTo(Workspace);

User.hasMany(MembershipInvitation, {
  foreignKey: "invitedUserId",
});

export class DustAppSecret extends Model<
  InferAttributes<DustAppSecret>,
  InferCreationAttributes<DustAppSecret>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;

  declare name: string;
  declare hash: string;

  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;

  declare user: NonAttribute<User>;
}
DustAppSecret.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "dust_app_secrets",
    sequelize: frontSequelize,
    indexes: [{ fields: ["workspaceId"] }],
  }
);
Workspace.hasMany(DustAppSecret, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
// We don't want to delete keys when a user gets deleted.
User.hasMany(DustAppSecret, {
  foreignKey: { allowNull: true },
  onDelete: "SET NULL",
});
DustAppSecret.belongsTo(User);
