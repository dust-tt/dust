import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  revokeAndTrackMembership,
  updateMembershipRoleAndTrack,
  updateMembershipSeatAndTrack,
} from "@app/lib/api/membership";
import { createPlugin } from "@app/lib/api/poke/types";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  isMembershipSeatType,
  isPaidSeatType,
  MEMBERSHIP_SEAT_TYPES,
} from "@app/types/memberships";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import { ASSIGNABLE_ROLES, isAssignableRoleType } from "@app/types/user";

type MemberIdentifier =
  | { kind: "email"; value: string }
  | { kind: "userId"; value: string };

// One identifier per line: an email (contains "@") or a user ID. Emails are
// lowercased; user IDs are kept verbatim. Lines are trimmed and deduped.
function parseMemberIdentifiers(raw: string): MemberIdentifier[] {
  const seen = new Set<string>();
  const identifiers: MemberIdentifier[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const identifier: MemberIdentifier = trimmed.includes("@")
      ? { kind: "email", value: trimmed.toLowerCase() }
      : { kind: "userId", value: trimmed };
    const key = `${identifier.kind}:${identifier.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      identifiers.push(identifier);
    }
  }
  return identifiers;
}

export const batchUpdateMembersPlugin = createPlugin({
  manifest: {
    id: "batch-update-members",
    name: "Batch Update Members",
    description:
      "Update a batch of members identified by email or user ID: change " +
      "their seat type, change their role (also reactivates revoked " +
      "members), or revoke them. Each identifier is looked up in this " +
      "workspace; the outcome is reported per identifier. Prefer a user ID " +
      "over an email when several accounts share the same email.",
    resourceTypes: ["workspaces"],
    args: {
      action: {
        type: "enum",
        label: "Action",
        description: "The operation to apply to every listed member.",
        values: [
          { label: "Update seat type", value: "update_seat" },
          { label: "Update role", value: "update_role" },
          { label: "Revoke", value: "revoke" },
        ],
        multiple: false,
      },
      seatType: {
        type: "enum",
        label: "Seat type",
        description:
          "The seat type to assign (used when the action is 'Update seat " +
          "type').",
        values: mapToEnumValues(MEMBERSHIP_SEAT_TYPES, (seatType) => ({
          label: seatType,
          value: seatType,
        })),
        multiple: false,
      },
      role: {
        type: "enum",
        label: "Role",
        description:
          "The role to assign (used when the action is 'Update role').",
        values: mapToEnumValues(ASSIGNABLE_ROLES, (role) => ({
          label: role,
          value: role,
        })),
        multiple: false,
      },
      members: {
        type: "text",
        label: "Emails or user IDs",
        description:
          "One email or user ID per line. Use a user ID to target a " +
          "specific account when several share the same email.",
      },
      immediate: {
        type: "boolean",
        label: "Apply immediately",
        description:
          "When checked, apply a seat change right now instead of " +
          "deferring a downgrade to the seat's next billing-period renewal. " +
          "Only used by the 'Update seat type' action.",
        default: true,
      },
    },
    requiredRoles: ["support"],
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const action = args.action[0];

    const identifiers = parseMemberIdentifiers(args.members);
    if (identifiers.length === 0) {
      return new Err(new Error("At least one email or user ID is required."));
    }

    const emails = identifiers
      .filter((identifier) => identifier.kind === "email")
      .map((identifier) => identifier.value);
    const userIds = identifiers
      .filter((identifier) => identifier.kind === "userId")
      .map((identifier) => identifier.value);

    const [emailMatches, idMatches] = await Promise.all([
      UserResource.fetchByEmails(emails),
      UserResource.fetchByIds(userIds),
    ]);

    // An email may resolve to several accounts; keep them all so we can flag
    // the ambiguity instead of silently acting on one.
    const usersByEmail = new Map<string, UserResource[]>();
    for (const user of emailMatches) {
      const key = user.email.toLowerCase();
      const existing = usersByEmail.get(key);
      if (existing) {
        existing.push(user);
      } else {
        usersByEmail.set(key, [user]);
      }
    }
    const usersById = new Map(idMatches.map((user) => [user.sId, user]));

    const resolveUser = (
      identifier: MemberIdentifier
    ):
      | { status: "ok"; user: UserResource }
      | { status: "user_not_found" }
      | { status: "ambiguous_email" } => {
      if (identifier.kind === "userId") {
        const user = usersById.get(identifier.value);
        return user ? { status: "ok", user } : { status: "user_not_found" };
      }
      const users = usersByEmail.get(identifier.value) ?? [];
      if (users.length === 0) {
        return { status: "user_not_found" };
      }
      if (users.length > 1) {
        return { status: "ambiguous_email" };
      }
      return { status: "ok", user: users[0] };
    };

    const author = auth.user()?.toJSON() ?? "no-author";

    // Run `fn` for every identifier, reporting `user_not_found` for identifiers
    // that do not resolve to a user and `ambiguous_email` for emails shared by
    // several accounts (use a user ID to disambiguate).
    const runForEach = (
      fn: (identifier: string, user: UserResource) => Promise<object>
    ) =>
      concurrentExecutor(
        identifiers,
        async (identifier) => {
          const resolution = resolveUser(identifier);
          if (resolution.status !== "ok") {
            return { identifier: identifier.value, status: resolution.status };
          }
          return fn(identifier.value, resolution.user);
        },
        { concurrency: 10 }
      );

    switch (action) {
      case "update_seat": {
        const seatType = args.seatType[0];
        if (!seatType || !isMembershipSeatType(seatType)) {
          return new Err(new Error("Please select a seat type."));
        }
        const { immediate } = args;

        // Guard against assigning a paid seat type the contract does not sell.
        // The contract is the same for every email, so check entitlement once.
        // `none`/`free` are not contract seat subscriptions and are gated by
        // `updateMembershipSeatAndTrack` separately.
        if (isPaidSeatType(seatType)) {
          const contract = await getActiveContract(workspace.sId);
          if (contract) {
            const productSeatTypes = await getProductSeatTypes();
            const entitledSeatTypes = getSeatSubscriptionsFromContract(
              contract,
              productSeatTypes
            );
            // Only enforce when the contract actually sells seats; contracts
            // with no seat subscription fall through to DB-only behavior.
            if (
              entitledSeatTypes.size > 0 &&
              !entitledSeatTypes.has(seatType)
            ) {
              return new Err(
                new Error(
                  `Seat type '${seatType}' is not available on this ` +
                    `workspace's contract. Available seat types: ` +
                    `${[...entitledSeatTypes.keys()].join(", ")}.`
                )
              );
            }
          }
        }

        // `updateMembershipSeatAndTrack` emits a per-member
        // `membership.seat_updated` event; we additionally emit one
        // `membership.bulk_seat_updated` summarizing the batch.
        const updatedEmails: string[] = [];
        const results = await runForEach(async (identifier, user) => {
          const res = await updateMembershipSeatAndTrack({
            user,
            workspace,
            newSeatType: seatType,
            author,
            immediate,
            allowReturningMemberFreeSeat: true,
          });
          if (res.isErr()) {
            return {
              identifier,
              email: user.email,
              status: "failed" as const,
              error: res.error.type,
            };
          }

          const { previousSeatType, newSeatType, scheduledSeatChangeAt } =
            res.value;
          if (previousSeatType === newSeatType && !scheduledSeatChangeAt) {
            return {
              identifier,
              email: user.email,
              status: "unchanged" as const,
              seatType: newSeatType,
            };
          }

          updatedEmails.push(user.email);
          return {
            identifier,
            email: user.email,
            status: "updated" as const,
            previousSeatType,
            newSeatType,
            scheduledSeatChangeAt: scheduledSeatChangeAt?.toISOString() ?? null,
          };
        });

        if (updatedEmails.length > 0) {
          void emitAuditLogEvent({
            auth,
            action: "membership.bulk_seat_updated",
            targets: [buildAuditLogTarget("workspace", workspace)],
            context: getAuditLogContext(auth),
            metadata: {
              new_seat_type: seatType,
              updated_emails: updatedEmails.join(","),
              count: String(updatedEmails.length),
              source: "poke",
            },
          });
        }

        return new Ok({ display: "json", value: { results } });
      }

      case "update_role": {
        const role = args.role[0];
        if (!role || !isAssignableRoleType(role)) {
          return new Err(new Error("Please select a role."));
        }

        // `updateMembershipRoleAndTrack` emits a per-member
        // `membership.role_updated` event; we additionally emit one
        // `membership.bulk_role_updated` summarizing the batch.
        const updatedEmails: string[] = [];
        const results = await runForEach(async (identifier, user) => {
          // `allowTerminated` re-activates revoked members (preserving their
          // previous origin/seat), so this doubles as a "re-add".
          const res = await updateMembershipRoleAndTrack({
            user,
            workspace,
            newRole: role,
            allowTerminated: true,
            author,
          });
          if (res.isErr()) {
            if (res.error.type === "already_on_role") {
              return {
                identifier,
                email: user.email,
                status: "unchanged" as const,
                role,
              };
            }
            return {
              identifier,
              email: user.email,
              status: "failed" as const,
              error: res.error.type,
            };
          }

          updatedEmails.push(user.email);
          return {
            identifier,
            email: user.email,
            status: "updated" as const,
            previousRole: res.value.previousRole,
            newRole: res.value.newRole,
          };
        });

        if (updatedEmails.length > 0) {
          void emitAuditLogEvent({
            auth,
            action: "membership.bulk_role_updated",
            targets: [buildAuditLogTarget("workspace", workspace)],
            context: getAuditLogContext(auth),
            metadata: {
              new_role: role,
              updated_emails: updatedEmails.join(","),
              count: String(updatedEmails.length),
              source: "poke",
            },
          });
        }

        return new Ok({ display: "json", value: { results } });
      }

      case "revoke": {
        // `revokeAndTrackMembership` emits a per-member `membership.revoked`
        // event; we additionally emit one `member.bulk_revoked` summarizing the
        // batch (mirrors the `revoke-users` plugin).
        const revokedEmails: string[] = [];
        const results = await runForEach(async (identifier, user) => {
          const res = await revokeAndTrackMembership(auth, user);
          if (res.isErr()) {
            if (res.error.type === "already_revoked") {
              return {
                identifier,
                email: user.email,
                status: "unchanged" as const,
              };
            }
            return {
              identifier,
              email: user.email,
              status: "failed" as const,
              error: res.error.type,
            };
          }

          revokedEmails.push(user.email);
          return { identifier, email: user.email, status: "revoked" as const };
        });

        if (revokedEmails.length > 0) {
          void emitAuditLogEvent({
            auth,
            action: "member.bulk_revoked",
            targets: [buildAuditLogTarget("workspace", workspace)],
            context: getAuditLogContext(auth),
            metadata: {
              revoked_emails: revokedEmails.join(","),
              count: String(revokedEmails.length),
              source: "poke",
            },
          });
        }

        return new Ok({ display: "json", value: { results } });
      }

      default:
        return new Err(new Error("Please select an action."));
    }
  },
});
