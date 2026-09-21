import { getBucketInstance } from "@app/lib/file_storage";
import { processFrontTableChunkWithIdNormalization } from "@app/temporal/relocation/activities/destination_region/front/sql";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("processFrontTableChunkWithIdNormalization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    new Error("Cannot create a string longer than 0x1fffffe8 characters"),
    new SyntaxError("Unexpected end of JSON input"),
  ])("keeps unreadable chunks for retry: %s", async (error) => {
    const bucket = getBucketInstance("relocation-test");
    vi.mocked(getBucketInstance).mockReturnValue(bucket);
    vi.spyOn(bucket, "fetchFileContent").mockRejectedValueOnce(error);
    const deleteFile = vi.spyOn(bucket, "delete");

    await expect(
      processFrontTableChunkWithIdNormalization({
        dataPath: "gs://relocation-test/chunk.json",
        sourceCell: "cell-00000",
        destCell: "cell-00001",
        workspaceId: "test-workspace",
        tableName: "agent_mcp_action_output_items",
      })
    ).rejects.toBe(error);
    expect(deleteFile).not.toHaveBeenCalled();
  });
});
