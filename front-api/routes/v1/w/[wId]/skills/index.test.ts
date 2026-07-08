// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib)
// This directive makes them available in the test environment.

import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { importSkillsFromFiles } from "@app/lib/api/skills/detection/files/import_skills";
import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import AdmZip from "adm-zip";
import type formidable from "formidable";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/skills/icon_suggestion", () => ({
  getSkillIconSuggestion: vi.fn(async () => ({
    isOk: () => true,
    value: "sparkles",
  })),
}));

vi.mock("@app/lib/api/skills/detection/suggest_mcp_servers", () => ({
  suggestMCPServersForDetectedSkill: vi.fn(async () => []),
}));

function getSkills(
  workspace: { sId: string },
  key: { secret: string },
  query?: Record<string, string>
) {
  const params = query ? `?${new URLSearchParams(query).toString()}` : "";
  return honoApp.request(`/api/v1/w/${workspace.sId}/skills${params}`, {
    headers: { authorization: `Bearer ${key.secret}` },
  });
}

function makeSkillMd(name: string, instructions: string): string {
  return `---
name: ${name}
description: ${name} description
---
${instructions}`;
}

async function makeSkillZipFile({
  instructions,
  name,
}: {
  instructions: string;
  name: string;
}): Promise<formidable.File> {
  const zip = new AdmZip();
  zip.addFile(
    "skills/imported/SKILL.md",
    Buffer.from(makeSkillMd(name, instructions), "utf-8")
  );
  const buffer = zip.toBuffer();
  const filepath = path.join(tmpdir(), `skill-import-${randomUUID()}.zip`);
  await writeFile(filepath, buffer);
  const newFilename = path.basename(filepath);

  return {
    filepath,
    hashAlgorithm: false,
    mimetype: "application/zip",
    newFilename,
    originalFilename: "skills.zip",
    size: buffer.length,
    toJSON() {
      return {
        filepath,
        hash: null,
        length: buffer.length,
        mimetype: "application/zip",
        mtime: null,
        newFilename,
        originalFilename: "skills.zip",
        size: buffer.length,
      };
    },
    toString() {
      return `PersistentFile: ${newFilename}, Original: skills.zip, Path: ${filepath}`;
    },
  } satisfies formidable.File;
}

describe("GET /api/v1/w/[wId]/skills", () => {
  it("returns active skills by default", async () => {
    const { workspace, key } = await createPublicApiMockRequest();
    const user = await UserFactory.basic();
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );

    await SkillFactory.create(auth, {
      name: "Active API Skill",
      instructions: "Test skill instructions",
    });
    await SkillFactory.create(auth, {
      name: "Archived API Skill",
      status: "archived",
      instructions: "Test skill instructions",
    });

    const response = await getSkills(workspace, key);

    expect(response.status).toBe(200);
    const data = await response.json();
    const skillNames = data.skills.map((skill: { name: string }) => skill.name);

    expect(skillNames).toContain("Active API Skill");
    expect(skillNames).not.toContain("Archived API Skill");
  });

  it("returns skills matching the requested status", async () => {
    const { workspace, key } = await createPublicApiMockRequest();
    const user = await UserFactory.basic();
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );

    await SkillFactory.create(auth, {
      name: "Active API Skill",
      instructions: "Test skill instructions",
    });
    await SkillFactory.create(auth, {
      name: "Archived API Skill",
      status: "archived",
      instructions: "Test skill instructions",
    });

    const response = await getSkills(workspace, key, { status: "archived" });

    expect(response.status).toBe(200);
    const data = await response.json();
    const skillNames = data.skills.map((skill: { name: string }) => skill.name);

    expect(skillNames).toContain("Archived API Skill");
    expect(skillNames).not.toContain("Active API Skill");
  });
});

describe("POST /api/v1/w/[wId]/skills", () => {
  it("adds provided editors to new and existing imported skills", async () => {
    const { auth, workspace } = await createPublicApiMockRequest();
    await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );
    const firstEditor = await UserFactory.basic();
    const secondEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, firstEditor, {
      role: "builder",
    });
    await MembershipFactory.associate(workspace, secondEditor, {
      role: "builder",
    });

    const firstImport = await importSkillsFromFiles(auth, {
      uploadedFiles: [
        await makeSkillZipFile({
          name: "Imported API Skill",
          instructions: "Use the first version.",
        }),
      ],
      source: "api",
      onConflict: "error",
      editors: [firstEditor.email],
    });

    expect(firstImport.isOk()).toBe(true);
    if (firstImport.isErr()) {
      throw firstImport.error;
    }
    expect(firstImport.value.imported).toHaveLength(1);
    const importedSkill = firstImport.value.imported[0];
    const importedEditors = await importedSkill.listEditors(auth);
    expect(importedEditors?.map((editor) => editor.email).sort()).toEqual([
      firstEditor.email.toLowerCase(),
    ]);

    const secondImport = await importSkillsFromFiles(auth, {
      uploadedFiles: [
        await makeSkillZipFile({
          name: "Imported API Skill",
          instructions: "Use the second version.",
        }),
      ],
      source: "api",
      onConflict: "error",
      editors: [secondEditor.email],
    });

    expect(secondImport.isOk()).toBe(true);
    if (secondImport.isErr()) {
      throw secondImport.error;
    }
    expect(secondImport.value.updated).toHaveLength(1);

    const updatedSkill = await SkillResource.fetchById(auth, importedSkill.sId);
    expect(updatedSkill).not.toBeNull();
    if (!updatedSkill) {
      throw new Error("Expected imported skill to be found.");
    }
    const updatedEditors = await updatedSkill.listEditors(auth);
    expect(updatedEditors?.map((editor) => editor.email).sort()).toEqual(
      [firstEditor.email, secondEditor.email]
        .map((email) => email.toLowerCase())
        .sort()
    );
  });
});
