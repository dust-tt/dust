import { DustFileSystemError } from "@app/lib/api/file_system/dust_file_system";
import { getUserMemory, setUserMemory } from "@app/lib/api/user_memory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import {
  GetUserMemoryResponseBodySchema,
  MAX_USER_MEMORY_CONTENT_LENGTH,
  PatchUserMemoryResponseBodySchema,
} from "@app/types/api/me/memory";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const ApiErrorSchema = z.object({
  error: z.object({
    type: z.string(),
  }),
});

// The content is read/written through GCS via DustFileSystem.forUser, so mock
// those two functions. The enabled flag lives in user metadata and runs for
// real against the test DB.
vi.mock(import("@app/lib/api/user_memory"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    getUserMemory: vi.fn(),
    setUserMemory: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(getUserMemory).mockResolvedValue(new Ok(""));
  vi.mocked(setUserMemory).mockResolvedValue(new Ok(undefined));
});

function getMemory(wId: string) {
  return honoApp.request(`/api/w/${wId}/me/memory`);
}

function patchMemory(wId: string, body: Record<string, unknown>) {
  return honoApp.request(`/api/w/${wId}/me/memory`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function setup() {
  const res = await createPrivateApiMockRequest();
  await FeatureFlagFactory.basic(res.auth, "user_memory");
  return res;
}

describe("feature flag gating", () => {
  it("returns 403 when user_memory is disabled", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await getMemory(workspace.sId);

    expect(response.status).toBe(403);
    const data = ApiErrorSchema.parse(await response.json());
    expect(data.error.type).toBe("feature_flag_not_found");
  });
});

describe("GET /api/w/:wId/me/memory", () => {
  it("returns the user's memory content and enabled flag", async () => {
    vi.mocked(getUserMemory).mockResolvedValue(new Ok("remember this"));
    const { workspace } = await setup();

    const response = await getMemory(workspace.sId);

    expect(response.status).toBe(200);
    const data = GetUserMemoryResponseBodySchema.parse(await response.json());
    expect(data.content).toBe("remember this");
    expect(data.enabled).toBe(true);
  });

  it("returns empty content when memory does not exist yet", async () => {
    const { workspace } = await setup();

    const response = await getMemory(workspace.sId);

    expect(response.status).toBe(200);
    const data = GetUserMemoryResponseBodySchema.parse(await response.json());
    expect(data.content).toBe("");
  });

  it("maps a filesystem error to a 500", async () => {
    vi.mocked(getUserMemory).mockResolvedValue(
      new Err(new DustFileSystemError("internal", "boom"))
    );
    const { workspace } = await setup();

    const response = await getMemory(workspace.sId);

    expect(response.status).toBe(500);
    const data = ApiErrorSchema.parse(await response.json());
    expect(data.error.type).toBe("internal_server_error");
  });
});

describe("PATCH /api/w/:wId/me/memory", () => {
  it("saves the provided content", async () => {
    const { workspace } = await setup();

    const response = await patchMemory(workspace.sId, {
      content: "new memory",
    });

    expect(response.status).toBe(200);
    const data = PatchUserMemoryResponseBodySchema.parse(await response.json());
    expect(data.content).toBe("new memory");
    expect(setUserMemory).toHaveBeenCalledWith(expect.anything(), "new memory");
  });

  it("returns 400 when content exceeds the size limit", async () => {
    const { workspace } = await setup();

    const response = await patchMemory(workspace.sId, {
      content: "a".repeat(MAX_USER_MEMORY_CONTENT_LENGTH + 1),
    });

    expect(response.status).toBe(400);
    const data = ApiErrorSchema.parse(await response.json());
    expect(data.error.type).toBe("invalid_request_error");
    expect(setUserMemory).not.toHaveBeenCalled();
  });

  it("updates the enabled flag without touching content", async () => {
    const { workspace } = await setup();

    const response = await patchMemory(workspace.sId, { enabled: false });

    expect(response.status).toBe(200);
    const data = PatchUserMemoryResponseBodySchema.parse(await response.json());
    expect(data.enabled).toBe(false);
    expect(setUserMemory).not.toHaveBeenCalled();

    const getResponse = await getMemory(workspace.sId);
    const getData = GetUserMemoryResponseBodySchema.parse(
      await getResponse.json()
    );
    expect(getData.enabled).toBe(false);
  });

  it("re-enables memory", async () => {
    const { workspace } = await setup();

    await patchMemory(workspace.sId, { enabled: false });
    await patchMemory(workspace.sId, { enabled: true });

    const getResponse = await getMemory(workspace.sId);
    const getData = GetUserMemoryResponseBodySchema.parse(
      await getResponse.json()
    );
    expect(getData.enabled).toBe(true);
  });

  it("returns 400 for a non-boolean enabled value", async () => {
    const { workspace } = await setup();

    const response = await patchMemory(workspace.sId, { enabled: "yes" });

    expect(response.status).toBe(400);
    const data = ApiErrorSchema.parse(await response.json());
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("returns 400 when neither content nor enabled is provided", async () => {
    const { workspace } = await setup();

    const response = await patchMemory(workspace.sId, {});

    expect(response.status).toBe(400);
    const data = ApiErrorSchema.parse(await response.json());
    expect(data.error.type).toBe("invalid_request_error");
    expect(setUserMemory).not.toHaveBeenCalled();
  });
});
