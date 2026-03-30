import type { SkillType } from "@app/types/assistant/skill_configuration";
import { Ok } from "@app/types/shared/result";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./index";

type TestAuth = {
  isBuilder: () => boolean;
};

type AuthedRequest = NextApiRequest & {
  auth: TestAuth;
};

type MockSkillResource = {
  toJSON: (auth: TestAuth) => SkillType;
};

type ApiErrorPayload = {
  status_code: number;
  api_error: {
    type: string;
    message: string;
  };
};

type PublicHandler = (
  req: AuthedRequest,
  res: NextApiResponse,
  auth: TestAuth,
  _session: null
) => Promise<void> | void;

const {
  mockFormidable,
  mockGetFeatureFlags,
  mockImportSkillsFromFiles,
  mockParse,
} = vi.hoisted(() => ({
  mockFormidable: vi.fn(),
  mockGetFeatureFlags: vi.fn(),
  mockImportSkillsFromFiles: vi.fn(),
  mockParse: vi.fn(),
}));

vi.mock("formidable", () => ({
  default: mockFormidable,
}));

vi.mock("@app/lib/api/skills/detection/files/import_skills", () => ({
  importSkillsFromFiles: mockImportSkillsFromFiles,
}));

vi.mock("@app/lib/api/auth_wrappers", () => ({
  withPublicAPIAuthentication: (handler: PublicHandler) => {
    return async (req: AuthedRequest, res: NextApiResponse) =>
      handler(req, res, req.auth, null);
  },
}));

vi.mock("@app/lib/auth", () => ({
  getFeatureFlags: mockGetFeatureFlags,
}));

vi.mock("@app/logger/withlogging", () => ({
  apiError: vi.fn(
    (_req: NextApiRequest, res: NextApiResponse, error: ApiErrorPayload) => {
      res.status(error.status_code).json({ error: error.api_error });
    }
  ),
}));

function makeSerializedSkill(): SkillType {
  return {
    id: 1,
    sId: "skill_new",
    createdAt: null,
    updatedAt: null,
    editedBy: 1,
    status: "active",
    name: "Release Notes",
    agentFacingDescription: "Summarize releases",
    userFacingDescription: "Summarize releases",
    instructions: "Use the changelog.",
    icon: null,
    source: "api",
    sourceMetadata: {
      repoUrl: "https://github.com/dust-tt/dust",
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
}

function makeImportedSkill(): MockSkillResource {
  return {
    toJSON: vi.fn((_auth: TestAuth) => makeSerializedSkill()),
  };
}

function makeRequest({
  method = "POST",
  isBuilder = true,
}: {
  method?: "GET" | "POST";
  isBuilder?: boolean;
} = {}) {
  const { req: baseReq, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    query: { wId: "w_123" },
  });

  const req = Object.assign(baseReq, {
    auth: {
      isBuilder: vi.fn().mockReturnValue(isBuilder),
    },
  });

  return { req, res };
}

describe("POST /api/v1/w/[wId]/skills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormidable.mockReturnValue({ parse: mockParse });
    mockGetFeatureFlags.mockResolvedValue(["sandbox_tools"]);
  });

  it("imports all uploaded skills through the api source", async () => {
    const { req, res } = makeRequest();

    mockParse.mockResolvedValue([
      {
        repoUrl: ["https://github.com/dust-tt/dust"],
      },
      {
        files: [
          { filepath: "/tmp/skills.zip", originalFilename: "skills.zip" },
        ],
      },
    ]);

    mockImportSkillsFromFiles.mockResolvedValue(
      new Ok({
        imported: [makeImportedSkill()],
        updated: [],
        errored: [],
      })
    );

    await handler(req, res);

    expect(mockImportSkillsFromFiles).toHaveBeenCalledTimes(1);
    expect(mockImportSkillsFromFiles).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "api",
        repoUrl: "https://github.com/dust-tt/dust",
      })
    );
    expect(mockImportSkillsFromFiles.mock.calls[0]?.[1]).not.toHaveProperty(
      "names"
    );
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      imported: [makeSerializedSkill()],
      updated: [],
      errored: [],
    });
  });

  it("returns 403 when the caller is not a builder", async () => {
    const { req, res } = makeRequest({ isBuilder: false });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "app_auth_error",
        message: "User is not a builder.",
      },
    });
  });

  it("returns 400 when no files are uploaded", async () => {
    const { req, res } = makeRequest();

    mockParse.mockResolvedValue([
      { repoUrl: ["https://github.com/dust-tt/dust"] },
      {},
    ]);

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
    const { req, res } = makeRequest();

    mockGetFeatureFlags.mockResolvedValue([]);

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
    const { req, res } = makeRequest({ method: "GET" });

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
