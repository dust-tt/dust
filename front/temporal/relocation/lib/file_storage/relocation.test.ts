import { randomBytes } from "node:crypto";

import config from "@app/temporal/relocation/activities/config";
import type { RelocationBlob } from "@app/temporal/relocation/activities/types";
import {
  parseRelocationStorageContent,
  readFromRelocationStorage,
  writeToRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("relocation storage", () => {
  beforeEach(() => {
    vi.spyOn(config, "getGcsRelocationBucket").mockReturnValue(
      "relocation-bucket"
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fileStorageMock.reset();
  });

  it("reads bytea parameters back as Buffers", async () => {
    const nonce = randomBytes(16);
    const blob: RelocationBlob = {
      statements: {
        workspace_sandbox_env_vars: [
          {
            columns: ["id", "placeholder_nonce", "name", "spaceId"],
            sql: 'INSERT INTO "workspace_sandbox_env_vars" ("id","placeholder_nonce","name","spaceId") VALUES ($1,$2,$3,$4);',
            params: [1, nonce, "FOO", null],
          },
        ],
      },
    };

    const dataPath = await writeToRelocationStorage(blob, {
      workspaceId: "test-workspace",
      type: "front",
      operation: "read_table_chunk_workspace_sandbox_env_vars",
      fileName: "chunk",
    });

    const read = await readFromRelocationStorage<RelocationBlob>(dataPath);
    const params = read.statements.workspace_sandbox_env_vars[0].params;

    expect(Buffer.isBuffer(params[1])).toBe(true);
    expect(params).toEqual([1, nonce, "FOO", null]);
  });

  it("leaves values that only resemble a serialized Buffer untouched", () => {
    expect(
      parseRelocationStorageContent('{"type":"Buffer","data":["a"]}')
    ).toEqual({ type: "Buffer", data: ["a"] });
    expect(parseRelocationStorageContent('{"type":"Buffer"}')).toEqual({
      type: "Buffer",
    });
    expect(
      parseRelocationStorageContent('[{"type":"Buffer","data":1}]')
    ).toEqual([{ type: "Buffer", data: 1 }]);
  });
});
