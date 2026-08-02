import { userIdentityMergePlugin } from "@app/lib/api/poke/plugins/workspaces/user_identity_merge";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { promises as fs } from "fs";
import { z } from "zod";

import { makeScript } from "./helpers";

const MergeFileSchema = z.array(
  z.object({
    email: z.string().email(),
    sIdToKeep: z.string().min(1),
  })
);
const MIN_ADMINS_FOR_REVOCATION = 2;

type Member = Awaited<ReturnType<typeof getMembers>>["members"][number];

interface MergeRecord {
  primaryEmail: string;
  oldUserId: string;
}

interface MergePair extends MergeRecord {
  primaryUserId: string;
  oldUserModelId: number;
  oldEmail: string;
}

interface BlockedRecord extends MergeRecord {
  reason: string;
}

async function loadRecords(filePath: string) {
  const content = await fs.readFile(filePath, "utf-8");
  const inputRecords = MergeFileSchema.parse(JSON.parse(content));
  const primaryEmails = new Set<string>();
  const oldUserIds = new Set<string>();

  return inputRecords.map(({ email, sIdToKeep }) => {
    if (primaryEmails.has(email)) {
      throw new Error(`Duplicate primary email: ${email}`);
    }
    if (oldUserIds.has(sIdToKeep)) {
      throw new Error(`Duplicate old user ID: ${sIdToKeep}`);
    }
    primaryEmails.add(email);
    oldUserIds.add(sIdToKeep);

    // Despite its name, sIdToKeep is the old identity being merged into the primary email.
    return { primaryEmail: email, oldUserId: sIdToKeep };
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
  triggerCountByEditor: Map<number, number>,
  ssoUserIds: Set<string>,
  activeAdminCount: number
) {
  const pairs: MergePair[] = [];
  const blocked: BlockedRecord[] = [];

  for (const record of records) {
    const oldUser = memberById.get(record.oldUserId);
    const primaryUser = primaryByEmail.get(record.primaryEmail);
    const triggerCount = oldUser
      ? triggerCountByEditor.get(oldUser.id)
      : undefined;
    const oldMembership = oldUser?.workspaces[0];
    let reason: string | null = null;

    if (!oldUser) {
      reason = "Old user is not a current or former workspace member.";
    } else if (duplicateEmails.has(record.primaryEmail)) {
      reason = "Multiple active workspace members have the primary email.";
    } else if (!primaryUser) {
      reason = "No active workspace member has the primary email.";
    } else if (primaryUser.sId === oldUser.sId) {
      reason = "Primary and old user are the same identity.";
    } else if (!ssoUserIds.has(primaryUser.sId)) {
      reason = "Primary user has no WorkOS identity.";
    } else if (
      oldMembership?.role === "admin" &&
      activeAdminCount < MIN_ADMINS_FOR_REVOCATION
    ) {
      reason = "Old user is the workspace's last active admin.";
    } else if (triggerCount && triggerCount > 0) {
      reason = "Old user owns triggers that revocation would delete.";
    }

    if (reason) {
      blocked.push({ ...record, reason });
      continue;
    }
    if (!oldUser || !primaryUser) {
      throw new Error("Identity pair preflight invariant failed.");
    }

    pairs.push({
      ...record,
      primaryUserId: primaryUser.sId,
      oldUserModelId: oldUser.id,
      oldEmail: oldUser.email,
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
  // Fetch once for the workspace so trigger checks do not add one query per mapping.
  const triggers = await TriggerResource.listByWorkspace(auth);
  const triggerCountByEditor = new Map<number, number>();
  for (const trigger of triggers) {
    const triggerCount = triggerCountByEditor.get(trigger.editor);
    triggerCountByEditor.set(
      trigger.editor,
      triggerCount ? triggerCount + 1 : 1
    );
  }

  const { pairs, blocked } = buildPairs(
    records,
    memberById,
    primaryByEmail,
    duplicateEmails,
    triggerCountByEditor,
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
      const result = await userIdentityMergePlugin.execute(auth, null, {
        primaryUserId: pair.primaryUserId,
        secondaryUserId: pair.oldUserId,
        ignoreEmailMatch: true,
        revokeSecondaryUser: true,
      });
      if (result.isErr()) {
        throw result.error;
      }
      logger.info(pair, "Successfully merged old identity into primary user");
    }

    await verifyRevoked(auth, readyPairs);
    logger.info({ successful: readyPairs.length }, "Identity merge complete");
  }
);
