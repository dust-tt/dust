import { seedFramePublicationFunctionsArchive } from "@app/lib/api/frames/seed_functions_archive";
import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import type { FileResource } from "@app/lib/resources/file_resource";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensureFrameSandboxReady: vi.fn(),
}));

vi.mock("@app/logger/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("seedFramePublicationFunctionsArchive", () => {
  const auth = {
    getNonNullableWorkspace: () => ({ sId: "w_test" }),
  } as never;
  const frame = { sId: "fil_frame" } as FileResource;
  const publicationId = "pub-abc";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips exec when the frame sandbox cannot be ensured", async () => {
    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Err(new Error("no sandbox"))
    );

    await seedFramePublicationFunctionsArchive(auth, { frame, publicationId });

    expect(ensureFrameSandboxReady).toHaveBeenCalledWith(auth, frame);
  });

  it("runs materialize-archive as agent-proxied with DUST_FUNCTIONS_DIR", async () => {
    const exec = vi
      .fn()
      .mockResolvedValue(
        new Ok({ exitCode: 0, stdout: '{"ok":true}', stderr: "" })
      );
    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Ok({
        sandbox: { exec } as never,
        scope: {} as never,
      }) as never
    );

    await seedFramePublicationFunctionsArchive(auth, { frame, publicationId });

    expect(exec).toHaveBeenCalledWith(
      auth,
      "/opt/bin/dsbx function materialize-archive",
      expect.objectContaining({
        user: "agent-proxied",
        envVars: {
          DUST_FUNCTIONS_DIR: `/frames/${frame.sId}/publications/${publicationId}/functions`,
        },
      })
    );
  });

  it("swallows non-zero exit without throwing", async () => {
    const exec = vi
      .fn()
      .mockResolvedValue(new Ok({ exitCode: 1, stdout: "", stderr: "boom" }));
    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Ok({
        sandbox: { exec } as never,
        scope: {} as never,
      }) as never
    );

    await expect(
      seedFramePublicationFunctionsArchive(auth, { frame, publicationId })
    ).resolves.toBeUndefined();
  });
});
