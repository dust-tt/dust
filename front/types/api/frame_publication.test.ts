import {
  FramePublicationDescriptorSchema,
  parseFramePublicationDescriptor,
} from "@app/types/api/frame_publication";
import { describe, expect, it } from "vitest";

const SHA256 = "a".repeat(64);

const publication = {
  schemaVersion: 1,
  manifest: {
    version: 1,
    name: "Tasks",
    description: "Track tasks.",
    uiEntryPoint: "index.tsx",
    functions: [
      {
        name: "add-task",
        description: "Add a task.",
        entryPoint: "functions/add_task.ts",
        executionMode: "durable",
        defaultStake: "low",
      },
    ],
    databases: [{ name: "tasks", schema: "databases/tasks.db.ts" }],
    domains: ["api.example.com"],
  },
  publishedAt: "2026-08-28T12:00:00.000Z",
  publisherId: "usr_publisher",
  sourceFiles: [
    { path: "index.tsx", contentSha256: SHA256 },
    { path: "functions/add_task.ts", contentSha256: SHA256 },
    { path: "databases/tasks.db.ts", contentSha256: SHA256 },
  ],
  ui: { bundleSha256: SHA256 },
  functions: [
    {
      name: "add-task",
      bundleSha256: SHA256,
      userIdentity: "frame_author_required",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
  ],
  databases: [
    {
      name: "tasks",
      schemaSource: "export const tasks = {};",
      schemaSha256: SHA256,
    },
  ],
} as const;

describe("FramePublicationDescriptorSchema", () => {
  it("parses a complete immutable publication contract", () => {
    expect(FramePublicationDescriptorSchema.parse(publication)).toEqual(
      publication
    );
  });

  it("requires function and database contracts to match the manifest", () => {
    const result = FramePublicationDescriptorSchema.safeParse({
      ...publication,
      functions: [],
      databases: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate source hashes", () => {
    const result = FramePublicationDescriptorSchema.safeParse({
      ...publication,
      sourceFiles: [publication.sourceFiles[0], publication.sourceFiles[0]],
    });

    expect(result.success).toBe(false);
  });

  it("requires hashes for every manifest-referenced source path", () => {
    const result = FramePublicationDescriptorSchema.safeParse({
      ...publication,
      sourceFiles: publication.sourceFiles.slice(0, 1),
    });

    expect(result.success).toBe(false);
  });

  it("ties each database contract to its schema source hash", () => {
    const result = FramePublicationDescriptorSchema.safeParse({
      ...publication,
      databases: [
        {
          ...publication.databases[0],
          schemaSha256: "b".repeat(64),
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("parseFramePublicationDescriptor", () => {
  it("returns a typed error for invalid JSON", () => {
    const result = parseFramePublicationDescriptor(Buffer.from("not json"));

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error).toContain(
      "publication.json is not valid JSON"
    );
  });
});
