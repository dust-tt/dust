import type {
  FreeBillingType,
  PaidBillingType,
  SubscriptionStatusType,
} from "@dust-tt/types";
import {
  FREE_BILLING_TYPES,
  PAID_BILLING_TYPES,
  SUBSCRIPTION_STATUSES,
} from "@dust-tt/types";
import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
  Transaction,
} from "sequelize";
import { DataTypes, Model } from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import { Workspace } from "@app/lib/models/workspace";

export class Plan extends Model<
  InferAttributes<Plan>,
  InferCreationAttributes<Plan>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare code: string; // unique
  declare name: string;
  declare stripeProductId: string | null;
  declare billingType: FreeBillingType | PaidBillingType;
  declare trialPeriodDays: number;

  // workspace limitations
  declare maxMessages: number;
  declare maxUsersInWorkspace: number;
  declare isSlackbotAllowed: boolean;
  declare isManagedConfluenceAllowed: boolean;
  declare isManagedSlackAllowed: boolean;
  declare isManagedNotionAllowed: boolean;
  declare isManagedGoogleDriveAllowed: boolean;
  declare isManagedGithubAllowed: boolean;
  declare isManagedIntercomAllowed: boolean;
  declare isManagedWebCrawlerAllowed: boolean;
  declare maxDataSourcesCount: number;
  declare maxDataSourcesDocumentsCount: number;
  declare maxDataSourcesDocumentsSizeMb: number;
}
Plan.init(
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
    code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    stripeProductId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    billingType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "fixed",
      validate: {
        isIn: [[...FREE_BILLING_TYPES, ...PAID_BILLING_TYPES]],
      },
    },
    trialPeriodDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    maxMessages: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    maxUsersInWorkspace: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    isSlackbotAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // TODO(2024-01-10 flav) Use a JSON Types field instead of group of booleans.
    isManagedConfluenceAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isManagedSlackAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isManagedNotionAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isManagedGoogleDriveAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isManagedGithubAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isManagedIntercomAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isManagedWebCrawlerAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    maxDataSourcesCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: -1,
    },
    maxDataSourcesDocumentsCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: -1,
    },
    maxDataSourcesDocumentsSizeMb: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2,
    },
  },
  {
    modelName: "plan",
    sequelize: front_sequelize,
    indexes: [{ unique: true, fields: ["code"] }],
  }
);

export class Subscription extends Model<
  InferAttributes<Subscription>,
  InferCreationAttributes<Subscription>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string; // unique
  declare status: SubscriptionStatusType;
  declare paymentFailingSince: Date | null;

  declare startDate: Date;
  declare endDate: Date | null;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare workspace: NonAttribute<Workspace>;

  declare planId: ForeignKey<Plan["id"]>;
  declare plan: NonAttribute<Plan>;

  declare stripeCustomerId: string | null;
  declare stripeSubscriptionId: string | null;
}
Subscription.init(
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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [SUBSCRIPTION_STATUSES],
      },
    },
    paymentFailingSince: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    stripeCustomerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stripeSubscriptionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    modelName: "subscription",
    sequelize: front_sequelize,
    indexes: [
      { unique: true, fields: ["sId"] },
      { fields: ["workspaceId", "status"] },
    ],
  }
);
// Define a hook to ensure there's only one active subscription for each workspace
Subscription.addHook(
  "beforeCreate",
  "enforce_single_active_subscription",
  async (subscription: Subscription, options: { transaction: Transaction }) => {
    if (subscription.status === "active") {
      // Check if there's already an active subscription for the same workspace
      const existingActiveSubscription = await Subscription.findOne({
        where: {
          workspaceId: subscription.workspaceId,
          status: "active",
        },
        transaction: options.transaction, // Include the transaction in your query
      });

      if (existingActiveSubscription) {
        throw new Error(
          "An active subscription already exists for this workspace."
        );
      }
    }
  }
);

export class PlanInvitation extends Model<
  InferAttributes<PlanInvitation>,
  InferCreationAttributes<PlanInvitation>
> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare secret: string;

  declare workspaceId: ForeignKey<Workspace["id"]>;
  declare workspace: NonAttribute<Workspace>;

  declare planId: ForeignKey<Plan["id"]>;
  declare plan: NonAttribute<Plan>;

  declare consumedAt: Date | null;
}

PlanInvitation.init(
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
    consumedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    modelName: "plan_invitation",
    sequelize: front_sequelize,
  }
);

PlanInvitation.addHook(
  "beforeCreate",
  "enforce_single_unconsumed_invitation",
  async (invitation: PlanInvitation, options: { transaction: Transaction }) => {
    // Check if there's already an unconsumed invitation for the same workspace
    const existingUnconsumedInvitation = await PlanInvitation.findOne({
      where: {
        workspaceId: invitation.workspaceId,
        consumedAt: null,
      },
      transaction: options.transaction, // Include the transaction in your query
    });

    if (existingUnconsumedInvitation) {
      throw new Error(
        "An unconsumed invitation already exists for this workspace."
      );
    }
  }
);

// Plan <> Subscription relationship: attribute "planId" in Subscription
Plan.hasMany(Subscription, {
  foreignKey: { name: "planId", allowNull: false },
  onDelete: "CASCADE",
});
Subscription.belongsTo(Plan, {
  foreignKey: { name: "planId", allowNull: false },
});

// Subscription <> Workspace relationship: attribute "workspaceId" in Subscription
Workspace.hasMany(Subscription, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "CASCADE",
});
Subscription.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});

// Plan <> PlanInvitation relationship: attribute "planId" in PlanInvitation
Plan.hasMany(PlanInvitation, {
  foreignKey: { name: "planId", allowNull: false },
  onDelete: "CASCADE",
});
PlanInvitation.belongsTo(Plan, {
  foreignKey: { name: "planId", allowNull: false },
});

// PlanInvitation <> Workspace relationship: attribute "workspaceId" in PlanInvitation
Workspace.hasMany(PlanInvitation, {
  foreignKey: { name: "workspaceId", allowNull: false },
  onDelete: "CASCADE",
});
PlanInvitation.belongsTo(Workspace, {
  foreignKey: { name: "workspaceId", allowNull: false },
});
