import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

const { FRONT_DATABASE_URI } = process.env;

export const front_sequelize = new Sequelize(FRONT_DATABASE_URI as string, {
  logging: false,
}); // TODO: type process.env

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  // declare provider: string | null;
  // declare providerId: string | null;
  declare githubId: string;
  declare username: string;
  declare email: string;
  declare name: string;
}
User.init(
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
    // provider: {
    //   type: DataTypes.STRING,
    // },
    // providerId: {
    //   type: DataTypes.STRING,
    // },
    githubId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "user",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["githubId"] },
      { fields: ["username"] },
      // { fields: ["provider", "providerId"] },
    ],
  }
);

export class Workspace extends Model<
  InferAttributes<Workspace>,
  InferCreationAttributes<Workspace>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare uId: string;
  declare sId: string;
  declare name: string;
  declare description?: string;
  declare type: "personal" | "team";
  declare plan?: string;
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
    uId: {
      type: DataTypes.STRING,
      allowNull: false,
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
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    plan: {
      type: DataTypes.STRING,
    },
  },
  {
    modelName: "workspace",
    sequelize: front_sequelize,
    indexes: [{ fields: ["sId"] }],
  }
);

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
    indexes: [{ fields: ["userId"] }],
  }
);
User.hasMany(Membership);
Workspace.hasMany(Membership);

export class App extends Model<
  InferAttributes<App>,
  InferCreationAttributes<App>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare uId: string;
  declare sId: string;
  declare name: string;
  declare description?: string;
  declare visibility: "public" | "private" | "unlisted" | "deleted";
  declare savedSpecification?: string;
  declare savedConfig?: string;
  declare savedRun?: string;
  declare dustAPIProjectId: string;

  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}
App.init(
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
    uId: {
      type: DataTypes.STRING,
      allowNull: false,
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
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    savedSpecification: {
      type: DataTypes.TEXT,
    },
    savedConfig: {
      type: DataTypes.TEXT,
    },
    savedRun: {
      type: DataTypes.TEXT,
    },
    dustAPIProjectId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "app",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["userId", "visibility"] },
      { fields: ["userId", "sId", "visibility"] },
    ],
  }
);
User.hasMany(App);
Workspace.hasMany(App);

export class Provider extends Model<
  InferAttributes<Provider>,
  InferCreationAttributes<Provider>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare providerId: string;
  declare config: string;

  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}
Provider.init(
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
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    config: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    modelName: "provider",
    sequelize: front_sequelize,
    indexes: [{ fields: ["userId"] }],
  }
);
User.hasMany(Provider);
Workspace.hasMany(Provider);

export class Dataset extends Model<
  InferAttributes<Dataset>,
  InferCreationAttributes<Dataset>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare description?: string;

  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare appId: ForeignKey<App["id"]>;
}
Dataset.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
  },
  {
    modelName: "dataset",
    sequelize: front_sequelize,
    indexes: [{ fields: ["userId", "appId", "name"] }],
  }
);
User.hasMany(Dataset);
App.hasMany(Dataset);
Workspace.hasMany(Dataset);

export class Clone extends Model<
  InferAttributes<Clone>,
  InferCreationAttributes<Clone>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare fromId: number;
  declare toId: number;
}
Clone.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
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
    fromId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "apps",
        key: "id",
      },
    },
    toId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "apps",
        key: "id",
      },
    },
  },
  {
    modelName: "clone",
    sequelize: front_sequelize,
  }
);
Clone.belongsTo(App, { as: "from", foreignKey: "fromId" });
Clone.belongsTo(App, { as: "to", foreignKey: "toId" });

export class Key extends Model<
  InferAttributes<Key>,
  InferCreationAttributes<Key>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare secret: string;
  declare status: string;

  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;

  declare isSystem: boolean;
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
      // We want only one system key per user, so allowing the null value allows us to have
      // a unique index on the pair (userId, isSystem=true) without having to use partial indexes
      // We can allow
      allowNull: true,
    },
  },
  {
    modelName: "keys",
    sequelize: front_sequelize,
    indexes: [
      { unique: true, fields: ["secret"] },
      { fields: ["userId"] },
      {
        fields: ["userId", "isSystem"],
        unique: true,
      },
    ],
  }
);
User.hasMany(Key);
Workspace.hasMany(Key);

export class DataSource extends Model<
  InferAttributes<DataSource>,
  InferCreationAttributes<DataSource>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare description?: string;
  declare visibility: "public" | "private";
  declare config?: string;
  declare dustAPIProjectId: string;

  declare userId: ForeignKey<User["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}

DataSource.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    config: {
      type: DataTypes.TEXT,
    },
    dustAPIProjectId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "data_source",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["userId", "visibility"] },
      { fields: ["userId", "name", "visibility"] },
    ],
  }
);
User.hasMany(DataSource);
Workspace.hasMany(DataSource);

export class Run extends Model<
  InferAttributes<Run>,
  InferCreationAttributes<Run>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dustRunId: string;
  declare runType: string;

  declare userId: ForeignKey<User["id"]>;
  declare appId: ForeignKey<App["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
}

Run.init(
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
    dustRunId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    runType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "run",
    sequelize: front_sequelize,
    indexes: [
      { fields: ["userId", "appId", "runType"] },
      { unique: true, fields: ["dustRunId"] },
    ],
  }
);
User.hasMany(Run);
App.hasMany(Run);
Workspace.hasMany(Run);

export class Connector extends Model<
  InferAttributes<Connector>,
  InferCreationAttributes<Connector>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare type: "slack" | "notion" | "google";

  declare nangoConnectionId: string;

  declare dataSourceId: ForeignKey<DataSource["id"]>;
  declare userId: ForeignKey<User["id"]>;
}

Connector.init(
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
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nangoConnectionId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "connector",
    sequelize: front_sequelize,
  }
);
User.hasMany(Connector);
DataSource.hasOne(Connector);
Connector.hasOne(DataSource);

// XP1

const { XP1_DATABASE_URI } = process.env;
const xp1_sequelize = new Sequelize(XP1_DATABASE_URI as string, {
  logging: false,
});

export class XP1User extends Model<
  InferAttributes<XP1User>,
  InferCreationAttributes<XP1User>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare name: string;
  declare email: string;
  declare secret: string;
}

XP1User.init(
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "user",
    sequelize: xp1_sequelize,
    indexes: [{ fields: ["secret"] }],
  }
);

export class XP1Run extends Model<
  InferAttributes<XP1Run>,
  InferCreationAttributes<XP1Run>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare dustUser: string;
  declare dustAppId: string;
  declare dustRunId: string;
  declare runStatus: string;
  declare promptTokens: number;
  declare completionTokens: number;

  declare userId: ForeignKey<XP1User["id"]>;
}

XP1Run.init(
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
    dustUser: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustAppId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustRunId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    runStatus: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    promptTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    completionTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "run",
    sequelize: xp1_sequelize,
    indexes: [{ fields: ["userId"] }],
  }
);
XP1User.hasMany(XP1Run);
