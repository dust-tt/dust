import {
  MODELS_TIER_NAMES,
  MODELS_TIERS,
  type ModelsTierDefinition,
  type ModelsTierName,
  type ModelTierSelection,
  STATIC_MODEL_TIERS,
} from "@app/lib/api/assistant/token_pricing/tiers";
import type { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { Result } from "@app/types/shared/result";
import type { UserType } from "@app/types/user";
import assert from "assert";
import type { Transaction } from "sequelize";

export type {
  ModelsTierDefinition,
  ModelsTierName,
  ModelTierSelection,
} from "@app/lib/api/assistant/token_pricing/tiers";

const MODELS_TIER_PERMISSION_TYPE = "use" as const;
const MODELS_TIER_RESOURCE_TYPE = "models_tier" as const;

interface ModelsTierUserGrantSpec {
  user: UserType;
  tierName: ModelsTierName;
  transaction?: Transaction;
}

interface ModelsTierGroupGrantSpec {
  group: GroupResource;
  tierName: ModelsTierName;
  transaction?: Transaction;
}

export class ModelsTierResource {
  static readonly TIERS = MODELS_TIERS;

  static readonly TIER_NAMES = MODELS_TIER_NAMES;

  static listTiers(): readonly ModelsTierDefinition[] {
    return MODELS_TIERS;
  }

  static getTier(name: ModelsTierName): ModelsTierDefinition | null {
    return MODELS_TIERS.find((tier) => tier.name === name) ?? null;
  }

  static getTierForSelection(
    selection: ModelTierSelection
  ): ModelsTierName | null {
    return (
      STATIC_MODEL_TIERS[selection.modelId][selection.reasoningEffort] ?? null
    );
  }

  static getTierForModel(
    modelId: ModelTierSelection["modelId"],
    reasoningEffort: ModelTierSelection["reasoningEffort"]
  ): ModelsTierName | null {
    return STATIC_MODEL_TIERS[modelId][reasoningEffort] ?? null;
  }

  private static getTierResourceId(tierName: ModelsTierName): number {
    const tier = this.getTier(tierName);
    assert(tier, `Unknown models tier: ${tierName}`);
    return tier.id;
  }

  static async grantToUser(
    auth: Authenticator,
    { user, tierName, transaction }: ModelsTierUserGrantSpec
  ): Promise<Result<undefined, Error>> {
    return GroupPermissionResource.grantToUser(auth, {
      user,
      permissionType: MODELS_TIER_PERMISSION_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
      resourceId: this.getTierResourceId(tierName),
      transaction,
    });
  }

  static async revokeFromUser(
    auth: Authenticator,
    { user, tierName, transaction }: ModelsTierUserGrantSpec
  ): Promise<Result<undefined, Error>> {
    return GroupPermissionResource.revokeFromUser(auth, {
      user,
      permissionType: MODELS_TIER_PERMISSION_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
      resourceId: this.getTierResourceId(tierName),
      transaction,
    });
  }

  static async grantToGroup(
    auth: Authenticator,
    { group, tierName, transaction }: ModelsTierGroupGrantSpec
  ): Promise<void> {
    await GroupPermissionResource.grant(auth, {
      group,
      permissionType: MODELS_TIER_PERMISSION_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
      resourceId: this.getTierResourceId(tierName),
      transaction,
    });
  }

  static async revokeFromGroup(
    auth: Authenticator,
    { group, tierName, transaction }: ModelsTierGroupGrantSpec
  ): Promise<void> {
    await GroupPermissionResource.revoke(auth, {
      group,
      permissionType: MODELS_TIER_PERMISSION_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
      resourceId: this.getTierResourceId(tierName),
      transaction,
    });
  }
}
