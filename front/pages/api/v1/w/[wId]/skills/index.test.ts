import { Authenticator } from "@app/lib/auth";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./index";

const { mockFormidable, mockImportSkillsFromFiles, mockParse } = vi.hoisted(
  () => ({
    mockFormidable: vi.fn(),
    mockImportSkillsFromFiles: vi.fn(),
    mockParse: vi.fn(),
  })
);

vi.mock("formidable", () => ({
  default: mockFormidable,
}));

vi.mock("@app/lib/api/skills/detection/files/import_skills", () => ({
  importSkillsFromFiles: mockImportSkillsFromFiles,
}));

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

describe("GET /api/v1/w/[wId]/skills", () => {
  it("returns active skills by default", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest();
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

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    const skillNames = data.skills.map((skill: { name: string }) => skill.name);

    expect(skillNames).toContain("Active API Skill");
    expect(skillNames).not.toContain("Archived API Skill");
  });

  it("returns skills matching the requested status", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest();
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
    req.query = { ...req.query, status: "archived" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    const skillNames = data.skills.map((skill: { name: string }) => skill.name);

    expect(skillNames).toContain("Archived API Skill");
    expect(skillNames).not.toContain("Active API Skill");
  });
});

describe("POST /api/v1/w/[wId]/skills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormidable.mockReturnValue({ parse: mockParse });
  });

  it("returns 400 when no files are uploaded", async () => {
    const { req, res } = await createPublicApiMockRequest({
      method: "POST",
    });

    mockParse.mockResolvedValue([{}, {}]);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "No files uploaded.",
      },
    });
  });
});
