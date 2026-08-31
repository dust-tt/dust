// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib)
// This directive makes them available in the test environment.

import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { importSkillsFromFiles } from "@app/lib/api/skills/detection/files/import_skills";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
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
    // The skill creator must be a workspace member for the factory's create grant to apply.
    await MembershipFactory.associate(workspace, user, { role: "user" });
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
      availability: "users_and_agents",
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
    // The skill creator must be a workspace member for the factory's create grant to apply.
    await MembershipFactory.associate(workspace, user, { role: "user" });
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
      availability: "users_and_agents",
    });
    await SkillFactory.create(auth, {
      name: "Archived API Skill",
      status: "archived",
      instructions: "Test skill instructions",
      availability: "workspace_users",
    });

    const response = await getSkills(workspace, key, { status: "archived" });

    expect(response.status).toBe(200);
    const data = await response.json();
    const skillNames = data.skills.map((skill: { name: string }) => skill.name);

    expect(skillNames).toContain("Archived API Skill");
    expect(skillNames).not.toContain("Active API Skill");
  });

  it("filters skills by availability", async () => {
    const { workspace, key } = await createPublicApiMockRequest();
    const user = await UserFactory.basic();
    // The skill creator must be a workspace member for the factory's create grant to apply.
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );

    await SkillFactory.create(auth, {
      name: "Workspace Skill",
      availability: "workspace_users",
    });
    await SkillFactory.create(auth, {
      name: "Discoverable Skill",
      availability: "users_and_agents",
    });
    await SkillFactory.create(auth, {
      name: "Unpublished Skill",
      availability: "editors",
    });

    // Unpublished (editors-only) skills are only exposed to admin API keys.
    const defaultResponse = await getSkills(workspace, key);
    expect(defaultResponse.status).toBe(200);
    const defaultSkillNames = (await defaultResponse.json()).skills.map(
      (skill: { name: string }) => skill.name
    );
    expect(defaultSkillNames).toContain("Workspace Skill");
    expect(defaultSkillNames).toContain("Discoverable Skill");
    expect(defaultSkillNames).not.toContain("Unpublished Skill");

    const response = await getSkills(workspace, key, {
      availability: "users_and_agents",
    });
    expect(response.status).toBe(200);
    const skillNames = (await response.json()).skills.map(
      (skill: { name: string }) => skill.name
    );
    expect(skillNames).toEqual(["Discoverable Skill"]);

    // Repeatable to match several availabilities.
    const multiResponse = await honoApp.request(
      `/api/v1/w/${workspace.sId}/skills?availability=workspace_users&availability=users_and_agents`,
      { headers: { authorization: `Bearer ${key.secret}` } }
    );
    expect(multiResponse.status).toBe(200);
    const multiSkillNames = (await multiResponse.json()).skills.map(
      (skill: { name: string }) => skill.name
    );
    expect(multiSkillNames).toContain("Workspace Skill");
    expect(multiSkillNames).toContain("Discoverable Skill");
    expect(multiSkillNames).not.toContain("Unpublished Skill");

    // For non-admin keys, filtering on the unpublished availability returns nothing.
    const editorsResponse = await getSkills(workspace, key, {
      availability: "editors",
    });
    expect(editorsResponse.status).toBe(200);
    expect((await editorsResponse.json()).skills).toEqual([]);

    const invalidResponse = await getSkills(workspace, key, {
      availability: "everyone",
    });
    expect(invalidResponse.status).toBe(400);
  });

  it("lets admin API keys bypass editor visibility to list unpublished skills", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const user = await UserFactory.basic();
    // The skill creator must be a workspace member for the factory's create grant to apply.
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );

    await SkillFactory.create(auth, {
      name: "Workspace Skill",
      availability: "workspace_users",
    });
    await SkillFactory.create(auth, {
      name: "Unpublished Skill",
      availability: "editors",
    });

    // The bypass is opt-in: without the param, admin keys don't see unpublished skills.
    const defaultResponse = await getSkills(workspace, key);
    expect(defaultResponse.status).toBe(200);
    const defaultSkillNames = (await defaultResponse.json()).skills.map(
      (skill: { name: string }) => skill.name
    );
    expect(defaultSkillNames).toContain("Workspace Skill");
    expect(defaultSkillNames).not.toContain("Unpublished Skill");

    // With the param, admin keys see unpublished skills, e.g. when exporting all
    // workspace skills.
    const bypassResponse = await getSkills(workspace, key, {
      bypassEditorVisibility: "true",
    });
    expect(bypassResponse.status).toBe(200);
    const bypassSkillNames = (await bypassResponse.json()).skills.map(
      (skill: { name: string }) => skill.name
    );
    expect(bypassSkillNames).toContain("Workspace Skill");
    expect(bypassSkillNames).toContain("Unpublished Skill");

    const editorsResponse = await getSkills(workspace, key, {
      availability: "editors",
      bypassEditorVisibility: "true",
    });
    expect(editorsResponse.status).toBe(200);
    const editorsSkillNames = (await editorsResponse.json()).skills.map(
      (skill: { name: string }) => skill.name
    );
    expect(editorsSkillNames).toEqual(["Unpublished Skill"]);
  });

  it("rejects bypassEditorVisibility for non-admin API keys", async () => {
    const { workspace, key } = await createPublicApiMockRequest();
    await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );

    const response = await getSkills(workspace, key, {
      bypassEditorVisibility: "true",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Only admins can bypass editor visibility.",
      },
    });
  });
});

describe("POST /api/v1/w/[wId]/skills", () => {
  it("sets availability when creating and updating imported skills", async () => {
    const { key, workspace } = await createPublicApiMockRequest();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceFactory.defaults(adminAuth);
    for (const grantType of [
      "create",
      "publish",
      "make_discoverable",
    ] as const) {
      await GroupPermissionResource.setForEverybody(adminAuth, {
        grantType,
        resourceType: "skill",
      });
    }
    // The permission set is resolved once at Authenticator construction, so build the request auth
    // after the grants above for its snapshot to include them.
    const { workspaceAuth: auth } = await Authenticator.fromKey(
      key,
      workspace.sId
    );

    const importWithAvailability = async ({
      availability,
      instructions,
    }: {
      availability: SkillAvailability;
      instructions: string;
    }) => {
      const result = await importSkillsFromFiles(auth, {
        uploadedFiles: [
          await makeSkillZipFile({
            name: "Imported Skill with Availability",
            instructions,
          }),
        ],
        availability,
        source: "api",
        onConflict: "error",
      });
      if (result.isErr()) {
        throw result.error;
      }
      return result.value;
    };

    const published = await importWithAvailability({
      availability: "workspace_users",
      instructions: "Published version.",
    });
    expect(published.imported[0]?.availability).toBe("workspace_users");

    const discoverable = await importWithAvailability({
      availability: "users_and_agents",
      instructions: "Discoverable version.",
    });
    expect(discoverable.updated[0]?.availability).toBe("users_and_agents");

    const unpublished = await importWithAvailability({
      availability: "editors",
      instructions: "Unpublished version.",
    });
    expect(unpublished.updated[0]?.availability).toBe("editors");
  });

  it("rejects discoverable imports without the make-discoverable permission", async () => {
    const { key, workspace } = await createPublicApiMockRequest();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceFactory.defaults(adminAuth);
    // Everything but make_discoverable, which is what this test asserts is missing.
    for (const grantType of ["create", "publish"] as const) {
      await GroupPermissionResource.setForEverybody(adminAuth, {
        grantType,
        resourceType: "skill",
      });
    }
    // The permission set is resolved once at Authenticator construction, so build the request auth
    // after the grants above for its snapshot to include them.
    const { workspaceAuth: auth } = await Authenticator.fromKey(
      key,
      workspace.sId
    );

    const result = await importSkillsFromFiles(auth, {
      uploadedFiles: [
        await makeSkillZipFile({
          name: "Unauthorized Discoverable Skill",
          instructions: "Should not be imported.",
        }),
      ],
      availability: "users_and_agents",
      source: "api",
      onConflict: "error",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "You don't have permission to change a skill's auto-discoverable status."
      );
    }
    expect(
      await SkillResource.fetchByName(auth, "Unauthorized Discoverable Skill")
    ).toBeNull();
  });

  it("adds provided editors to new and existing imported skills", async () => {
    const { key, workspace } = await createPublicApiMockRequest();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceFactory.defaults(adminAuth);
    // The mock key's role doesn't grant create/skill by itself — it requires a group grant. The
    // key is scoped to the workspace's global group, so granting the capability to everybody
    // satisfies it.
    await GroupPermissionResource.setForEverybody(adminAuth, {
      grantType: "create",
      resourceType: "skill",
    });
    // The permission set is resolved once at Authenticator construction, so build the request auth
    // after the grant above for its snapshot to include the create/skill capability.
    const { workspaceAuth: auth } = await Authenticator.fromKey(
      key,
      workspace.sId
    );
    const firstEditor = await UserFactory.basic();
    const secondEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, firstEditor, {
      role: "user",
    });
    await MembershipFactory.associate(workspace, secondEditor, {
      role: "user",
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
    expect(updatedSkill.availability).toBe("editors");
    const updatedEditors = await updatedSkill.listEditors(auth);
    expect(updatedEditors?.map((editor) => editor.email).sort()).toEqual(
      [firstEditor.email, secondEditor.email]
        .map((email) => email.toLowerCase())
        .sort()
    );
  });

  it("rejects the import for a key without the create/skill capability", async () => {
    const { auth, workspace } = await createPublicApiMockRequest({
      role: "user",
    });
    await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );

    const result = await importSkillsFromFiles(auth, {
      uploadedFiles: [
        await makeSkillZipFile({
          name: "Unauthorized Import",
          instructions: "Should never be imported.",
        }),
      ],
      source: "api",
      onConflict: "error",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Creating skills is restricted.");
    }
  });
});
