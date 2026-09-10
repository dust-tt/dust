import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxFunctionModel } from "@app/lib/resources/storage/models/sandbox_function";
import { withTransaction } from "@app/lib/utils/sql_utils";
import {
  createTestFrameFunction,
  makeTestFrameFunction,
  TEST_FRAME_BUNDLE_CODE,
} from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { AggregateError } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeWithLockMock = vi.hoisted(() =>
  vi.fn(async (_lockName: string, callback: () => Promise<unknown>) =>
    callback()
  )
);

vi.mock("@app/lib/lock", () => ({
  executeWithLock: executeWithLockMock,
}));

const inputSchema: JSONSchema = { type: "object" };

const outputSchema: JSONSchema = {
  type: "object",
  properties: {
    commentId: { type: "string" },
  },
  required: ["commentId"],
};

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
});

describe("SandboxFunctionResource", () => {
  it("rejects an invalid JSON Schema", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);

    // bulkCreate wraps per-row validation failures in Sequelize's own AggregateError, whose
    // message is empty — so assert on the row error the model validator raised.
    const error = await createTestFrameFunction(authenticator, {
      space,
      inputSchema: { type: "number", multipleOf: 0 },
      outputSchema,
    }).then(
      () => null,
      (err: unknown) => err
    );

    assert(error instanceof AggregateError);
    expect(error.errors.map((rowError) => rowError.message)).toEqual([
      expect.stringContaining("Invalid JSON schema"),
    ]);
  });

  it("declares legacy and publication-scoped uniqueness indexes", () => {
    const indexes = SandboxFunctionModel.options.indexes ?? [];

    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fields: ["fileId"],
        }),
        expect.objectContaining({
          fields: ["workspaceId", "spaceId", "fileId"],
          unique: true,
        }),
        expect.objectContaining({
          fields: ["workspaceId", "spaceId", "slug"],
          unique: true,
        }),
        expect.objectContaining({
          fields: ["workspaceId", "fileId", "publicationId", "slug"],
          unique: true,
        }),
      ])
    );

    const fileIndex = indexes.find((index) => {
      const fields = index.fields ?? [];
      return fields.length === 1 && fields[0] === "fileId";
    });
    expect(fileIndex?.unique).not.toBe(true);
  });

  it("counts a Frame's functions from its active publication only", async () => {
    const { adminAuth, frame } = await makeTestFrameFunction();

    // Simulates a stale prior publish: its function rows remain in the table (they are never
    // pruned), but they must not be counted once a newer publication is active.
    await withTransaction((transaction) =>
      SandboxFunctionResource.createForFramePublication(
        adminAuth,
        {
          frame,
          publicationId: "publication-0",
          functions: [
            {
              name: "stale-function",
              description: "A function from a superseded publication.",
              userIdentity: "optional",
              executionMode: "durable",
              defaultStake: "low",
              bundleCode: TEST_FRAME_BUNDLE_CODE,
              inputSchema,
              outputSchema,
            },
          ],
        },
        transaction
      )
    );

    const counts = await SandboxFunctionResource.countByFrameModelIds(
      adminAuth,
      [{ frameModelId: frame.id, activePublicationId: "publication-1" }]
    );

    expect(counts.get(frame.id)).toBe(1);
  });

  it("returns an empty map for a frame with no active publication, without querying", async () => {
    const findAllSpy = vi.spyOn(SandboxFunctionModel, "findAll");
    const { authenticator } = await createResourceTest({ role: "admin" });

    const counts = await SandboxFunctionResource.countByFrameModelIds(
      authenticator,
      [{ frameModelId: 1, activePublicationId: null }]
    );

    expect(counts.size).toBe(0);
    expect(findAllSpy).not.toHaveBeenCalled();
  });
});
