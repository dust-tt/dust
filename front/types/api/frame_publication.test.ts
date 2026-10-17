import { FrameManifestSchema } from "@app/types/api/frame_manifest";
import {
  FramePublicationDescriptorSchema,
  isSameFramePublicationContent,
  parseFramePublicationDescriptor,
} from "@app/types/api/frame_publication";
import { describe, expect, it } from "vitest";

const SHA256 = "a".repeat(64);

const publication = {
  schemaVersion: 1,
  manifest: {
    version: 1,
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
      toolCalls: [["gmail", "get_messages"]] as [string, string][],
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

  it("defaults missing toolCalls to an empty list for older publications", () => {
    const { toolCalls: _omitted, ...functionWithoutToolCalls } =
      publication.functions[0];
    const parsed = FramePublicationDescriptorSchema.parse({
      ...publication,
      functions: [functionWithoutToolCalls],
    });

    expect(parsed.functions[0]?.toolCalls).toEqual([]);
  });

  it("rejects toolCalls that are not length-2 string pairs", () => {
    const result = FramePublicationDescriptorSchema.safeParse({
      ...publication,
      functions: [
        {
          ...publication.functions[0],
          toolCalls: [["gmail"]],
        },
      ],
    });

    expect(result.success).toBe(false);
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

describe("isSameFramePublicationContent", () => {
  const base = {
    schemaVersion: 1 as const,
    manifest: FrameManifestSchema.parse({
      version: 1,
      description: "Track tasks.",
    }),
    publishedAt: "2026-10-14T00:00:00.000Z",
    publisherId: null,
    sourceFiles: [{ path: "index.tsx", contentSha256: SHA256 }],
    ui: { bundleSha256: SHA256 },
    functions: [],
    databases: [],
  };

  it("ignores publish time, publisher and source hashes", () => {
    expect(
      isSameFramePublicationContent(base, {
        ...base,
        publishedAt: "2026-10-15T00:00:00.000Z",
        publisherId: "user_2",
        sourceFiles: [{ path: "README.md", contentSha256: "b".repeat(64) }],
      })
    ).toBe(true);
  });

  it("differs when the UI bundle differs", () => {
    expect(
      isSameFramePublicationContent(base, {
        ...base,
        ui: { bundleSha256: "c".repeat(64) },
      })
    ).toBe(false);
  });

  it("differs when the manifest differs", () => {
    expect(
      isSameFramePublicationContent(base, {
        ...base,
        manifest: FrameManifestSchema.parse({
          version: 1,
          description: "Track bugs.",
        }),
      })
    ).toBe(false);
  });
});
