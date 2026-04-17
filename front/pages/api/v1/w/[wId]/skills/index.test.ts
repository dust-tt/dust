import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
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
