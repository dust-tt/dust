import type { WorkspaceSegmentationType } from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import type { Subscription } from "@app/lib/models/plan";
import { User } from "@app/lib/models/user";

export class Workspace extends Model<
  InferAttributes<Workspace>,
  InferCreationAttributes<Workspace>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare upgradedAt: Date | null;

  declare sId: string;
  declare name: string;
  declare description: string | null;
  declare allowedDomain: string | null;
  declare segmentation: WorkspaceSegmentationType;
  declare subscriptions: NonAttribute<Subscription[]>;
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
    upgradedAt: {
      type: DataTypes.DATE,
      allowNull: true,
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
    allowedDomain: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    segmentation: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "workspace",
    sequelize: front_sequelize,
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
    sequelize: front_sequelize,
    indexes: [{ unique: true, fields: ["domain"] }],
  }
);
Workspace.hasMany(WorkspaceHasDomain, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
WorkspaceHasDomain.belongsTo(Workspace);

export class Membership extends Model<
  InferAttributes<Membership>,
  InferCreationAttributes<Membership>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare role: "admin" | "builder" | "user" | "revoked";

  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}
Membership.init(
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
    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "membership",
    sequelize: front_sequelize,
    indexes: [{ fields: ["userId", "role"] }],
  }
);
User.hasMany(Membership, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
Workspace.hasMany(Membership, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
Membership.belongsTo(Workspace);
Membership.belongsTo(User);

export class MembershipInvitation extends Model<
  InferAttributes<MembershipInvitation>,
  InferCreationAttributes<MembershipInvitation>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare inviteEmail: "string";
  declare status: "pending" | "consumed" | "revoked";

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare invitedUserId: ForeignKey<User["id"]> | null;
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
    inviteEmail: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
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
    sequelize: front_sequelize,
    indexes: [{ fields: ["workspaceId", "status"] }],
  }
);
Workspace.hasMany(MembershipInvitation, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
User.hasMany(MembershipInvitation, {
  foreignKey: "invitedUserId",
});

export class Key extends Model<
  InferAttributes<Key>,
  InferCreationAttributes<Key>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare secret: string;
  declare status: "active" | "disabled";
  declare isSystem: boolean;

  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;

  declare user: NonAttribute<User>;
}
Key.init(
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
    secret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    modelName: "keys",
    sequelize: front_sequelize,
    indexes: [
      { unique: true, fields: ["secret"] },
      { fields: ["userId"] },
      { fields: ["workspaceId"] },
    ],
  }
);
Workspace.hasMany(Key, {
  foreignKey: { allowNull: false },
  onDelete: "CASCADE",
});
// We don't want to delete keys when a user gets deleted.
User.hasMany(Key, {
  foreignKey: { allowNull: true },
  onDelete: "SET NULL",
});
Key.belongsTo(User);
