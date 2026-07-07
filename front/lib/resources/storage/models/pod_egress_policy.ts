import { frontSequelize } from "@app/lib/resources/storage";
import {
  DANGEROUSLY_UNBOUNDED_TEXT,
  DataTypes,
} from "@app/lib/resources/storage/data_types";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey } from "sequelize";

// Admin record of truth for a pod's egress allowlist (pods are project
// spaces, so the FK targets the `vaults` table via SpaceModel). The GCS file
// `pods/{spaceSId}.json` that the egress proxy reads is a render of this row,
// rewritten on every admin change. Dedicated table rather than a column on
// ProjectMetadata: pod sandbox config does not hang off ProjectMetadata (see
// the pod-secrets design and PodSandboxEnvVarModel, which this mirrors).
export class PodEgressPolicyModel extends WorkspaceAwareModel<PodEgressPolicyModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare spaceId: ForeignKey<SpaceModel["id"]>;
  declare allowedDomains: string[];
}

PodEgressPolicyModel.init(
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
    allowedDomains: {
      type: DataTypes.ARRAY(DANGEROUSLY_UNBOUNDED_TEXT),
      allowNull: false,
      defaultValue: [],
      field: "allowed_domains",
    },
  },
  {
    modelName: "pod_egress_policy",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "pod_egress_policies_space_idx",
        unique: true,
        fields: ["spaceId"],
        concurrently: true,
      },
      { fields: ["workspaceId"], concurrently: true },
    ],
  }
);

PodEgressPolicyModel.belongsTo(SpaceModel, {
  foreignKey: { name: "spaceId", allowNull: false },
  onDelete: "RESTRICT",
});
