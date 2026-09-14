import {
  DATABASE_FILE_SYSTEM_POD_PREFIX,
  fileSystemStorageModeForPod,
  fileSystemStorageModeForStandaloneConversation,
  isDatabaseFileSystemPodName,
} from "@app/lib/api/file_system/storage_mode";
import { describe, expect, it } from "vitest";

describe("filesystem storage mode", () => {
  it("selects the database backend from the Pod name prefix", () => {
    expect(
      isDatabaseFileSystemPodName(
        `${DATABASE_FILE_SYSTEM_POD_PREFIX}Playground`
      )
    ).toBe(true);
    expect(fileSystemStorageModeForPod({ name: "Regular Pod" })).toBe("gcs");
    expect(
      fileSystemStorageModeForPod({
        name: `${DATABASE_FILE_SYSTEM_POD_PREFIX}Playground`,
      })
    ).toBe("database");
  });

  it("selects the database backend from standalone conversation metadata", () => {
    expect(
      fileSystemStorageModeForStandaloneConversation({ metadata: {} })
    ).toBe("gcs");
    expect(
      fileSystemStorageModeForStandaloneConversation({
        metadata: { useDatabaseFileSystem: true },
      })
    ).toBe("database");
  });
});
