import { processAndStoreFromUrl } from "@app/lib/api/files/upload";
import { untrustedFetch } from "@app/lib/egress/server";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/egress/server", () => ({
  untrustedFetch: vi.fn(),
}));

describe("processAndStoreFromUrl", () => {
  beforeEach(() => {
    vi.mocked(untrustedFetch).mockReset();
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.1/secret.txt",
    "https://127.0.0.1/secret.txt",
    "http://example.com/file.txt",
  ])("rejects %s without fetching it", async (url) => {
    const { authenticator } = await createResourceTest({});

    const result = await processAndStoreFromUrl(authenticator, {
      url,
      useCase: "conversation",
      contentType: "text/plain",
    });

    expect(result.isErr()).toBe(true);
    expect(untrustedFetch).not.toHaveBeenCalled();
  });
});
