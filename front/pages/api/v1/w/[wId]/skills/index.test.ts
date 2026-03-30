import type { Authenticator } from "@app/lib/auth";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./index";

type MockSkillResource = {
  toJSON: (auth: Authenticator) => SkillType;
};

const serializedSkill: SkillType = {
  id: 1,
  sId: "skill_new",
  createdAt: null,
  updatedAt: null,
  editedBy: null,
  status: "active",
  name: "Release Notes",
  agentFacingDescription: "Summarize releases",
  userFacingDescription: "Summarize releases",
  instructions: "Use the changelog.",
  icon: null,
  source: "api",
  sourceMetadata: {
    filePath: "skills/release-notes/SKILL.md",
  },
  requestedSpaceIds: [],
  tools: [],
  fileAttachments: [],
  canWrite: true,
  isExtendable: true,
  isDefault: false,
  extendedSkillId: null,
};

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

describe("POST /api/v1/w/[wId]/skills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormidable.mockReturnValue({ parse: mockParse });
  });

  it("returns 400 when no files are uploaded", async () => {
    const { req, res, auth } = await createPublicApiMockRequest({
      method: "POST",
    });

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

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

  it("returns 403 when the workspace does not support skill import", async () => {
    const { req, res } = await createPublicApiMockRequest({
      method: "POST",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Skill import is not supported.",
      },
    });
  });

  it("returns 405 for unsupported methods", async () => {
    const { req, res } = await createPublicApiMockRequest({
      method: "GET",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  });
});
