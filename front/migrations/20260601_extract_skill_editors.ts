import { writeFile } from "node:fs/promises";

import { sanitizeCsvCell } from "@app/lib/api/analytics/csv_utils";
import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { stringify } from "csv-stringify/sync";

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
  workspace,
}: {
  workspace: LightWorkspaceType;
}): Promise<EditorWithSkills[]> {
  // The export must include skills in restricted spaces.
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });
  const skills = await SkillResource.listByWorkspace(auth, {
    onlyCustom: true,
    status: "active",
    withInstructions: false,
    withTools: false,
  });

  if (skills.length === 0) {
    return [];
  }

  const editorsBySkillId = await SkillResource.batchListEditors(auth, skills);
  const editorsByUserModelId = new Map<number, EditorAccumulator>();

  for (const skill of [...skills].sort((left, right) => {
    const nameComparison = compareStrings(left.name, right.name);
    return nameComparison === 0
      ? compareStrings(left.sId, right.sId)
      : nameComparison;
  })) {
    const skillEditors = editorsBySkillId.get(skill.sId) ?? [];
    if (skillEditors.length === 0) {
      continue;
    }

    const skillInfo = {
      id: skill.sId,
      name: skill.name,
      url: getSkillBuilderUrl(workspace.sId, skill.sId),
    };

    for (const user of skillEditors) {
      const editor = editorsByUserModelId.get(user.id) ?? {
        workspaceId: workspace.sId,
        workspaceName: workspace.name,
        editorUserId: user.sId,
        editorEmail: user.email,
        editorName: user.name,
        skillsById: new Map<string, SkillInfo>(),
      };

      editor.skillsById.set(skillInfo.id, skillInfo);

      if (!editorsByUserModelId.has(user.id)) {
        editorsByUserModelId.set(user.id, editor);
      }
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
    const editors: EditorWithSkills[] = [];

    await runOnAllWorkspaces(
      async (workspace) => {
        const workspaceEditors = await fetchSkillEditorsForWorkspace({
          workspace,
        });
        editors.push(...workspaceEditors);
      },
      { concurrency: 1, wId: workspaceId }
    );

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
