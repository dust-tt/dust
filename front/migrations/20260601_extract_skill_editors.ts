import { writeFile } from "node:fs/promises";

import { sanitizeCsvCell } from "@app/lib/api/analytics/csv_utils";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeSId } from "@app/lib/resources/string_ids";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import { makeScript } from "@app/scripts/helpers";
import { stringify } from "csv-stringify/sync";
import { Op } from "sequelize";

interface WorkspaceInfo {
  id: number;
  sId: string;
  name: string;
}

interface SkillInfo {
  id: string;
  name: string;
  url: string;
}

interface EditorAccumulator {
  workspaceId: string;
  workspaceName: string;
  editorUserId: string;
  editorEmail: string;
  editorName: string;
  skillsById: Map<string, SkillInfo>;
}

interface EditorWithSkills {
  workspaceId: string;
  workspaceName: string;
  editorUserId: string;
  editorEmail: string;
  editorName: string;
  skills: SkillInfo[];
}

type SkillEditorCsvRecord = Record<string, string | number>;

const DUST_APP_URL = "https://app.dust.tt";

async function fetchWorkspaces(
  workspaceId: string | null
): Promise<WorkspaceInfo[]> {
  const workspaces = await WorkspaceModel.findAll({
    where: workspaceId ? { sId: workspaceId } : undefined,
    attributes: ["id", "sId", "name"],
    order: [
      ["name", "ASC"],
      ["sId", "ASC"],
    ],
  });

  if (workspaceId && workspaces.length === 0) {
    throw new Error(`Workspace not found: ${workspaceId}.`);
  }

  return workspaces.map((workspace) => ({
    id: workspace.id,
    sId: workspace.sId,
    name: workspace.name,
  }));
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function getSkillBuilderUrl(workspaceId: string, skillId: string): string {
  return new URL(
    getSkillBuilderRoute(workspaceId, skillId),
    DUST_APP_URL
  ).toString();
}

async function fetchSkillEditorsForWorkspace({
  now,
  workspace,
}: {
  now: Date;
  workspace: WorkspaceInfo;
}): Promise<EditorWithSkills[]> {
  const skills = await SkillConfigurationModel.findAll({
    where: { workspaceId: workspace.id, status: "active" },
    attributes: ["id", "name", "workspaceId"],
    order: [
      ["name", "ASC"],
      ["id", "ASC"],
    ],
  });

  if (skills.length === 0) {
    return [];
  }

  const skillByModelId = new Map<number, SkillInfo>(
    skills.map((skill): [number, SkillInfo] => {
      const skillId = makeSId("skill", {
        id: skill.id,
        workspaceId: workspace.id,
      });

      return [
        skill.id,
        {
          id: skillId,
          name: skill.name,
          url: getSkillBuilderUrl(workspace.sId, skillId),
        },
      ];
    })
  );

  const groupSkillLinks = await GroupSkillModel.findAll({
    where: {
      workspaceId: workspace.id,
      skillConfigurationId: [...skillByModelId.keys()],
    },
    attributes: ["groupId", "skillConfigurationId"],
  });

  if (groupSkillLinks.length === 0) {
    return [];
  }

  const groups = await GroupModel.findAll({
    where: {
      workspaceId: workspace.id,
      id: uniqueNumbers(groupSkillLinks.map((link) => link.groupId)),
      kind: "skill_editors",
    },
    attributes: ["id"],
  });

  const editorGroupIds = new Set(groups.map((group) => group.id));
  if (editorGroupIds.size === 0) {
    return [];
  }

  const skillModelIdsByGroupId = new Map<number, Set<number>>();
  for (const link of groupSkillLinks) {
    if (!editorGroupIds.has(link.groupId)) {
      continue;
    }

    const skillModelIds = skillModelIdsByGroupId.get(link.groupId) ?? new Set();
    skillModelIds.add(link.skillConfigurationId);
    skillModelIdsByGroupId.set(link.groupId, skillModelIds);
  }

  const groupMemberships = await GroupMembershipModel.findAll({
    where: {
      workspaceId: workspace.id,
      groupId: [...editorGroupIds],
      status: "active",
      startAt: { [Op.lte]: now },
      [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: now } }],
    },
    attributes: ["groupId", "userId"],
  });

  if (groupMemberships.length === 0) {
    return [];
  }

  const groupMemberUserIds = uniqueNumbers(
    groupMemberships.map((membership) => membership.userId)
  );

  const activeWorkspaceMemberships = await MembershipModel.findAll({
    where: {
      workspaceId: workspace.id,
      userId: groupMemberUserIds,
      startAt: { [Op.lte]: now },
      [Op.or]: [{ endAt: null }, { endAt: { [Op.gte]: now } }],
    },
    attributes: ["userId"],
  });

  const activeUserIds = new Set(
    activeWorkspaceMemberships.map((membership) => membership.userId)
  );
  if (activeUserIds.size === 0) {
    return [];
  }

  const users = await UserModel.findAll({
    where: { id: [...activeUserIds] },
    attributes: ["id", "sId", "email", "name"],
  });
  const userByModelId = new Map(users.map((user) => [user.id, user]));
  const editorsByUserModelId = new Map<number, EditorAccumulator>();

  for (const membership of groupMemberships) {
    if (!activeUserIds.has(membership.userId)) {
      continue;
    }

    const user = userByModelId.get(membership.userId);
    const skillModelIds = skillModelIdsByGroupId.get(membership.groupId);
    if (!user || !skillModelIds) {
      continue;
    }

    const editor = editorsByUserModelId.get(user.id) ?? {
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      editorUserId: user.sId,
      editorEmail: user.email,
      editorName: user.name,
      skillsById: new Map<string, SkillInfo>(),
    };

    for (const skillModelId of skillModelIds) {
      const skill = skillByModelId.get(skillModelId);
      if (skill) {
        editor.skillsById.set(skill.id, skill);
      }
    }

    if (!editorsByUserModelId.has(user.id)) {
      editorsByUserModelId.set(user.id, editor);
    }
  }

  return [...editorsByUserModelId.values()]
    .map((editor) => ({
      workspaceId: editor.workspaceId,
      workspaceName: editor.workspaceName,
      editorUserId: editor.editorUserId,
      editorEmail: editor.editorEmail,
      editorName: editor.editorName,
      skills: [...editor.skillsById.values()].sort((left, right) => {
        const nameComparison = compareStrings(left.name, right.name);
        return nameComparison === 0
          ? compareStrings(left.id, right.id)
          : nameComparison;
      }),
    }))
    .sort((left, right) => {
      const emailComparison = compareStrings(
        left.editorEmail,
        right.editorEmail
      );
      return emailComparison === 0
        ? compareStrings(left.editorUserId, right.editorUserId)
        : emailComparison;
    });
}

function buildCsvRecords(editors: EditorWithSkills[]): SkillEditorCsvRecord[] {
  return editors.map((editor) => ({
    workspace_id: sanitizeCsvCell(editor.workspaceId),
    workspace_name: sanitizeCsvCell(editor.workspaceName),
    editor_user_id: sanitizeCsvCell(editor.editorUserId),
    editor_email: sanitizeCsvCell(editor.editorEmail),
    editor_name: sanitizeCsvCell(editor.editorName),
    skill_count: editor.skills.length,
    skill_urls: sanitizeCsvCell(
      editor.skills.map((skill) => skill.url).join("|")
    ),
    skill_names: sanitizeCsvCell(
      editor.skills.map((skill) => skill.name).join("|")
    ),
  }));
}

makeScript(
  {
    outputFile: {
      type: "string",
      description: "Write CSV to a file instead of stdout.",
      demandOption: false,
    },
    workspaceId: {
      type: "string",
      description: "Restrict export to one workspace sId.",
      demandOption: false,
    },
  },
  async ({ outputFile, workspaceId }) => {
    const workspaces = await fetchWorkspaces(workspaceId ?? null);
    const now = new Date();
    const editors: EditorWithSkills[] = [];

    for (const workspace of workspaces) {
      const workspaceEditors = await fetchSkillEditorsForWorkspace({
        now,
        workspace,
      });
      editors.push(
        ...workspaceEditors
      );
    }

    const records = buildCsvRecords(editors);
    const csv = stringify(records, {
      columns: [
        { key: "workspace_id", header: "workspace_id" },
        { key: "workspace_name", header: "workspace_name" },
        { key: "editor_user_id", header: "editor_user_id" },
        { key: "editor_email", header: "editor_email" },
        { key: "editor_name", header: "editor_name" },
        { key: "skill_count", header: "skill_count" },
        { key: "skill_urls", header: "skill_urls" },
        { key: "skill_names", header: "skill_names" },
      ],
      header: true,
    });

    if (outputFile) {
      await writeFile(outputFile, csv, "utf-8");
    } else {
      process.stdout.write(csv);
    }
  }
);
