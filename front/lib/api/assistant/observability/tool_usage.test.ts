import { resolveServerDisplayNames } from "@app/lib/api/assistant/observability/tool_usage";
import logger from "@app/logger/logger";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("resolveServerDisplayNames", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("only parses remote server ids as ids", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Customer records",
    });
    const error = vi.spyOn(logger, "error");

    const names = await resolveServerDisplayNames(authenticator, [
      "image_generation",
      server.cachedName,
      server.sId,
    ]);

    expect(names.get("image_generation")).toBe("Create Images");
    expect(names.get(server.cachedName)).toBe("Customer Records");
    expect(names.get(server.sId)).toBe("Customer records");
    expect(error).not.toHaveBeenCalled();
  });
});
