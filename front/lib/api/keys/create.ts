import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS,
  MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS,
  setApiKeySpendLimit,
} from "@app/lib/api/keys/spend_limit";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const MAX_API_KEY_CREATION_PER_DAY = 30;

type CreateApiKeyErrorCode =
  | "invalid_request_error"
  | "name_conflict"
  | "unauthorized"
  | "group_not_found"
  | "limit_reached"
  | "metronome_error";

/**
 * A key always carries the workspace global group, so it can reach everything
 * every workspace member can reach; in addition, it can access the spaces it
 * is scoped to.
 */
async function resolveApiKeyGroups(
  auth: Authenticator,
  { spaceIds, role }: { spaceIds: string[]; role: "user" | "admin" }
): Promise<Result<GroupResource[], DustError<CreateApiKeyErrorCode>>> {
  const globalGroupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
  if (globalGroupRes.isErr()) {
    return new Err(new DustError("group_not_found", "Global group not found"));
  }
  const globalGroup = globalGroupRes.value;

  const resolvedGroups: GroupResource[] = [globalGroup];

  const requestedSpaceIds = [...new Set(spaceIds)];
  if (requestedSpaceIds.length > 0) {
    const spaces = await SpaceResource.fetchByIds(auth, requestedSpaceIds);
    const openSpaceModelIds = await SpaceResource.listOpenSpaceModelIds(
      auth,
      spaces
    );
    const scopableSpaces = spaces.filter(
      (space) =>
        (space.isRegular() || space.isProject()) &&
        !openSpaceModelIds.has(space.id)
    );

    if (scopableSpaces.length !== requestedSpaceIds.length) {
      return new Err(
        new DustError(
          "unauthorized",
          "An API key can only be scoped to restricted spaces or pods."
        )
      );
    }

    resolvedGroups.push(
      ...(await SpaceResource.listRegularAutoGroupsForSpaces(
        auth,
        scopableSpaces,
        {
          includeEditors: role === "admin",
        }
      ))
    );
  }

  return new Ok(resolvedGroups);
}

/**
 * Create a non-system API key for the workspace: validates the name, the spend caps and the
 * requested scope, resolves the groups the key carries, enforces the per-workspace creation rate
 * limit, then persists the key, applies the per-key credit cap and emits the audit log event.
 */
export async function createApiKey(
  auth: Authenticator,
  {
    name,
    spaceIds,
    monthlyCapMicroUsd,
    monthlyCapAwuCredits,
    role,
  }: {
    name: string;
    spaceIds: string[];
    monthlyCapMicroUsd: number | null;
    // Per-key credit cap in AWU credits (credit-priced plans only). null = unlimited.
    monthlyCapAwuCredits: number | null;
    role: "user" | "admin";
  }
): Promise<Result<KeyResource, DustError<CreateApiKeyErrorCode>>> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return new Err(
      new DustError("invalid_request_error", "API key name cannot be empty.")
    );
  }

  if (monthlyCapMicroUsd !== null && monthlyCapMicroUsd < 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "monthly_cap_micro_usd must be greater than or equal to 0"
      )
    );
  }

  // Per-key credit cap: only valid on credit-priced plans and within range. Validated up front so
  // we never create a key whose requested cap can't be applied.
  if (monthlyCapAwuCredits !== null) {
    const plan = auth.subscription()?.plan;
    if (!plan || !isCreditPricedPlan(plan)) {
      return new Err(
        new DustError(
          "invalid_request_error",
          "Per-key credit spend limits are only available on credit-priced plans."
        )
      );
    }
    if (
      monthlyCapAwuCredits < MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS ||
      monthlyCapAwuCredits > MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS
    ) {
      return new Err(
        new DustError(
          "invalid_request_error",
          `monthly_cap_awu_credits must be between ` +
            `${MIN_API_KEY_SPEND_LIMIT_AWU_CREDITS} and ` +
            `${MAX_API_KEY_SPEND_LIMIT_AWU_CREDITS}.`
        )
      );
    }
  }

  const existingKey = await KeyResource.fetchByName(auth, {
    name: trimmedName,
    onlyActive: true,
  });
  if (existingKey) {
    return new Err(
      new DustError(
        "name_conflict",
        "An API key with this name already exists in this workspace."
      )
    );
  }

  const groupsRes = await resolveApiKeyGroups(auth, {
    spaceIds,
    role,
  });
  if (groupsRes.isErr()) {
    return groupsRes;
  }
  const resolvedGroups = groupsRes.value;

  const remaining = await rateLimiter({
    key: `api_key_creation_${owner.sId}`,
    maxPerTimeframe: MAX_API_KEY_CREATION_PER_DAY,
    timeframeSeconds: 24 * 60 * 60, // 1 day
    logger,
  });
  if (remaining === 0) {
    return new Err(
      new DustError(
        "limit_reached",
        `You have reached the limit of ${MAX_API_KEY_CREATION_PER_DAY} API keys ` +
          "creations per day. Please try again later."
      )
    );
  }

  const key = await KeyResource.makeNew(
    {
      name: trimmedName,
      status: "active",
      userId: user.id,
      workspaceId: owner.id,
      isSystem: false,
      role,
      monthlyCapMicroUsd,
    },
    resolvedGroups
  );

  void emitAuditLogEvent({
    auth,
    action: "api_key.created",
    targets: [
      buildAuditLogTarget("workspace", owner),
      buildAuditLogTarget("api_key", {
        sId: String(key.id),
        name: trimmedName,
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      group_ids: resolvedGroups.map((g) => g.sId).join(","),
      role,
    },
  });

  // Apply the per-key credit cap (persists the cap, creates the Metronome alert, reconciles
  // state). Validated above, so only a Metronome failure can error here.
  if (monthlyCapAwuCredits !== null) {
    const limitResult = await setApiKeySpendLimit(auth, {
      keyModelId: key.id,
      limit: { kind: "limited", awuCredits: monthlyCapAwuCredits },
    });
    if (limitResult.isErr()) {
      logger.error(
        {
          workspaceId: owner.sId,
          keyName: trimmedName,
          err: limitResult.error,
        },
        "[Keys] Failed to apply credit cap on newly created key"
      );
      return new Err(
        new DustError(
          "metronome_error",
          `Key created but failed to set credit cap: ${limitResult.error.message}`
        )
      );
    }
  }

  // Re-read so the returned key reflects the persisted cap (`setApiKeySpendLimit` updates its own
  // resource instance).
  const created = await KeyResource.fetchByWorkspaceAndId({
    workspace: owner,
    id: key.id,
  });

  return new Ok(created ?? key);
}
