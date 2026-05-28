import { describe, expect, test } from "vitest";

import { buildMountCommand } from "./mount";

describe("GCS mount command", () => {
  test("uses absolute root-owned binaries for root gcsfuse mounts", () => {
    const command = buildMountCommand({
      bucket: "dust-bucket",
      prefix: "w/workspace/conversations/conversation/files",
      mountPoint: "/files/conversation",
    });

    expect(command).toContain("/usr/bin/timeout 30 /usr/bin/gcsfuse");
    expect(command).toContain(
      "--only-dir 'w/workspace/conversations/conversation/files'"
    );
    expect(command).toContain("'dust-bucket' '/files/conversation'");
    expect(command).not.toContain("timeout 30 gcsfuse");
  });
});
