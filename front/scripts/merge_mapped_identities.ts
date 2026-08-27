import { userIdentityMergePlugin } from "@app/lib/api/poke/plugins/workspaces/user_identity_merge";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { promises as fs } from "fs";
import { z } from "zod";

import { makeScript } from "./helpers";

const EmailSchema = z
  .string()
  .email()
  .transform((email) => email.toLowerCase());
const MergeFileSchema = z.array(
  z.object({
    _comment: z.string().min(1),
    email: EmailSchema,
    sIdToKeep: z.string().min(1),
  })
);
const MIN_ADMINS_FOR_REVOCATION = 2;

type Member = Awaited<ReturnType<typeof getMembers>>["members"][number];

interface MergeRecord {
  primaryEmail: string;
  expectedOldEmail: string;
  oldUserId: string;
}

interface MergePair extends MergeRecord {
  primaryUserId: string;
  oldUserModelId: number;
  oldEmail: string;
  oldRole: Member["workspaces"][number]["role"];
  primaryRole: Member["workspaces"][number]["role"];
  oldSeatType: Member["seatType"];
  primarySeatType: Member["seatType"];
}

interface BlockedRecord extends MergeRecord {
  reason: string;
}

function parseComment(comment: string) {
  const match = comment.match(
    /^(\S+) → (\S+) \| status: (active|inactive|pending)$/
  );
  const oldEmail = match?.[1];
  const primaryEmail = match?.[2];
  if (!oldEmail || !primaryEmail) {
    throw new Error(`Invalid mapping comment: ${comment}`);
  }
  return z
    .object({ oldEmail: EmailSchema, primaryEmail: EmailSchema })
    .parse({ oldEmail, primaryEmail });
}

async function loadRecords(filePath: string) {
  const content = await fs.readFile(filePath, "utf-8");
  const inputRecords = MergeFileSchema.parse(JSON.parse(content));
  const primaryEmails = new Set<string>();
  const oldUserIds = new Set<string>();

  return inputRecords.map(({ _comment, email, sIdToKeep }) => {
    const { oldEmail, primaryEmail } = parseComment(_comment);
    if (primaryEmail !== email) {
      throw new Error(`Comment primary email does not match: ${email}`);
    }
    if (primaryEmails.has(email)) {
      throw new Error(`Duplicate primary email: ${email}`);
    }
    if (oldUserIds.has(sIdToKeep)) {
      throw new Error(`Duplicate old user ID: ${sIdToKeep}`);
    }
    primaryEmails.add(email);
    oldUserIds.add(sIdToKeep);

    // The issue mapping names this field sIdToKeep, but its comment identifies it as the old
    // account whose data must move to the newly provisioned account at `email`.
    return {
      primaryEmail: email,
      expectedOldEmail: oldEmail,
      oldUserId: sIdToKeep,
    };
  });
}

function indexMembers(members: Member[]) {
  const memberById = new Map(members.map((member) => [member.sId, member]));
  const primaryByEmail = new Map<string, Member>();
  const duplicateEmails = new Set<string>();
  let activeAdminCount = 0;

  for (const member of members) {
    const [memberWorkspace] = member.workspaces;
    if (!memberWorkspace) {
      throw new Error(`Workspace membership missing for user: ${member.sId}`);
    }
    if (memberWorkspace.role === "none") {
      continue;
    }
    if (memberWorkspace.role === "admin") {
      activeAdminCount += 1;
    }
    if (primaryByEmail.has(member.email)) {
      duplicateEmails.add(member.email);
      continue;
    }
    primaryByEmail.set(member.email, member);
  }

  return { memberById, primaryByEmail, duplicateEmails, activeAdminCount };
}

function buildPairs(
  records: MergeRecord[],
  memberById: Map<string, Member>,
  primaryByEmail: Map<string, Member>,
  duplicateEmails: Set<string>,
  ssoUserIds: Set<string>,
  activeAdminCount: number
) {
  const pairs: MergePair[] = [];
  const blocked: BlockedRecord[] = [];
  const selectedOldUserIds = new Set(records.map(({ oldUserId }) => oldUserId));

  for (const record of records) {
    const oldUser = memberById.get(record.oldUserId);
    const primaryUser = primaryByEmail.get(record.primaryEmail);
    const oldMembership = oldUser?.workspaces[0];
    const primaryMembership = primaryUser?.workspaces[0];
    let reason: string | null = null;

    if (!oldUser) {
      reason = "Old user is not a current or former workspace member.";
    } else if (oldUser.email.toLowerCase() !== record.expectedOldEmail) {
      reason = "Mapped old user email does not match the issue mapping.";
    } else if (duplicateEmails.has(record.primaryEmail)) {
      reason = "Multiple active workspace members have the primary email.";
    } else if (!primaryUser) {
      reason = "No active workspace member has the primary email.";
    } else if (primaryUser.sId === oldUser.sId) {
      reason = "Primary and old user are the same identity.";
    } else if (selectedOldUserIds.has(primaryUser.sId)) {
      reason = "Primary identity is also selected as an old identity.";
    } else if (!ssoUserIds.has(primaryUser.sId)) {
      reason = "Primary user has no WorkOS identity.";
    } else if (!oldMembership || !primaryMembership) {
      reason = "Workspace membership is missing from an identity.";
    } else if (
      oldMembership.role !== "none" &&
      oldMembership.role !== primaryMembership.role
    ) {
      reason = "Active old and primary users have different workspace roles.";
    } else if (
      oldMembership.role !== "none" &&
      oldUser.seatType !== primaryUser.seatType
    ) {
      reason = "Active old and primary users have different seat types.";
    } else if (
      oldMembership?.role === "admin" &&
      activeAdminCount < MIN_ADMINS_FOR_REVOCATION
    ) {
      reason = "Old user is the workspace's last active admin.";
    }

    if (reason) {
      blocked.push({ ...record, reason });
      continue;
    }
    if (!oldUser || !primaryUser || !oldMembership || !primaryMembership) {
      throw new Error("Identity pair preflight invariant failed.");
    }

    pairs.push({
      ...record,
      primaryUserId: primaryUser.sId,
      oldUserModelId: oldUser.id,
      oldEmail: oldUser.email,
      oldRole: oldMembership.role,
      primaryRole: primaryMembership.role,
      oldSeatType: oldUser.seatType,
      primarySeatType: primaryUser.seatType,
    });
  }

  return { pairs, blocked };
}

async function preflight(auth: Authenticator, records: MergeRecord[]) {
  const { members } = await getMembers(auth);
  const { memberById, primaryByEmail, duplicateEmails, activeAdminCount } =
    indexMembers(members);
  const primaryModelIds = records.flatMap((record) => {
    const primaryUser = primaryByEmail.get(record.primaryEmail);
    return primaryUser ? [primaryUser.id] : [];
  });
  const primaryUsers = await UserResource.fetchByModelIds(primaryModelIds);
  const ssoUserIds = new Set(
    primaryUsers
      .filter((primaryUser) => primaryUser.workOSUserId)
      .map((primaryUser) => primaryUser.sId)
  );

  const { pairs, blocked } = buildPairs(
    records,
    memberById,
    primaryByEmail,
    duplicateEmails,
    ssoUserIds,
    activeAdminCount
  );
  // Memberships are fetched in one query using the workspace/user/startAt index.
  const scheduledMemberships =
    await MembershipResource.getScheduledMembershipsByUserIdInWorkspace({
      workspace: auth.getNonNullableWorkspace(),
      userIds: pairs.map(({ oldUserModelId }) => oldUserModelId),
    });
  for (const pair of pairs) {
    if (scheduledMemberships.has(pair.oldUserModelId)) {
      blocked.push({
        primaryEmail: pair.primaryEmail,
        expectedOldEmail: pair.expectedOldEmail,
        oldUserId: pair.oldUserId,
        reason: "Old user has a scheduled membership change.",
      });
    }
  }

  return {
    readyPairs: pairs.filter(
      ({ oldUserModelId }) => !scheduledMemberships.has(oldUserModelId)
    ),
    blocked,
  };
}

async function verifyRevoked(auth: Authenticator, pairs: MergePair[]) {
  const { members } = await getMembers(auth);
  const memberById = new Map(members.map((member) => [member.sId, member]));
  for (const pair of pairs) {
    const oldUser = memberById.get(pair.oldUserId);
    if (!oldUser) {
      throw new Error(`Old user disappeared after merge: ${pair.oldUserId}`);
    }
    const [memberWorkspace] = oldUser.workspaces;
    if (!memberWorkspace || memberWorkspace.role !== "none") {
      throw new Error(`Old user was not revoked: ${pair.oldUserId}`);
    }
  }
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe: "Workspace sId to process",
      type: "string" as const,
      demandOption: true,
    },
    file: {
      alias: "f",
      describe: "Issue JSON mapping primary emails to old user IDs",
      type: "string" as const,
      demandOption: true,
    },
    userId: {
      describe: "Old user sId to process as a canary",
      type: "string" as const,
    },
    all: {
      describe: "Process every record in the file",
      type: "boolean" as const,
      default: false,
    },
  },
  async ({ workspaceId, file, userId, all, execute }, logger) => {
    if ((!userId && !all) || (userId && all)) {
      throw new Error("Pass exactly one of --userId or --all.");
    }

    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const records = await loadRecords(file);
    const selectedRecords = userId
      ? records.filter((record) => record.oldUserId === userId)
      : records;
    if (selectedRecords.length === 0) {
      throw new Error(`Old user ID not found in file: ${userId}`);
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const { readyPairs, blocked } = await preflight(auth, selectedRecords);

    logger.info(
      {
        workspaceId,
        workspace: workspace.name,
        execute,
        ready: readyPairs,
        blocked,
      },
      "Identity merge preflight complete"
    );

    if (blocked.length > 0) {
      throw new Error("Identity merge preflight has blocked records.");
    }

    if (!execute) {
      return;
    }

    for (const pair of readyPairs) {
      const currentPreflight = await preflight(auth, [pair]);
      if (currentPreflight.blocked.length > 0) {
        logger.error(
          { pair, blocked: currentPreflight.blocked },
          "Identity pair no longer passes preflight"
        );
        throw new Error(`Identity pair preflight failed: ${pair.oldUserId}`);
      }
      const [currentPair] = currentPreflight.readyPairs;
      if (!currentPair) {
        throw new Error(
          `Identity pair missing after preflight: ${pair.oldUserId}`
        );
      }

      const result = await userIdentityMergePlugin.execute(auth, null, {
        primaryUserId: currentPair.primaryUserId,
        secondaryUserId: currentPair.oldUserId,
        ignoreEmailMatch: true,
        revokeSecondaryUser: true,
      });
      if (result.isErr()) {
        throw result.error;
      }
      await verifyRevoked(auth, [currentPair]);
      logger.info(
        { ...currentPair },
        "Successfully merged old identity into primary user"
      );
    }

    logger.info({ successful: readyPairs.length }, "Identity merge complete");
  }
);
