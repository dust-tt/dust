import type { CreationOptional } from "sequelize";
import { DataTypes, Op } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class WorkspaceVerificationAttemptModel extends WorkspaceAwareModel<WorkspaceVerificationAttemptModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare phoneNumberHash: string;
  declare twilioVerificationSid: string | null;
  declare attemptNumber: number;
  declare verifiedAt: Date | null;
  declare failedAt: Date | null;
}

WorkspaceVerificationAttemptModel.init(
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
    phoneNumberHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    twilioVerificationSid: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    attemptNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    failedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "workspace_verification_attempt",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId"] },
      {
        fields: ["phoneNumberHash"],
        unique: true,
        name: "workspace_verification_attempts_phone_hash_unique_idx",
      },
      {
        fields: ["twilioVerificationSid"],
        name: "workspace_verification_attempts_twilio_sid_idx",
        where: { twilioVerificationSid: { [Op.ne]: null } },
      },
    ],
  }
);
