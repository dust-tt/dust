import type {
  CompatDiff,
  SiblingManifests,
} from "@app/lib/api/sandbox_functions/compat";
import {
  computeStaleSiblings,
  diffManifestsAgainstSiblings,
} from "@app/lib/api/sandbox_functions/compat";
import type {
  FunctionManifests,
  ManifestColumn,
  ManifestIndex,
  ManifestTable,
} from "@app/lib/api/sandbox_functions/manifests";
import { describe, expect, it } from "vitest";

function col(overrides: Partial<ManifestColumn> = {}): ManifestColumn {
  return {
    type: "text",
    mode: null,
    notNull: false,
    hasDefault: false,
    primaryKey: false,
    autoIncrement: false,
    ...overrides,
  };
}

function idCol(): ManifestColumn {
  return col({
    type: "integer",
    notNull: true,
    hasDefault: true,
    primaryKey: true,
    autoIncrement: true,
  });
}

function table(
  columns: Record<string, ManifestColumn>,
  indexes: Record<string, ManifestIndex> = {}
): ManifestTable {
  return { columns, indexes };
}

function manifests(
  tablesByDb: Record<string, Record<string, ManifestTable>>
): FunctionManifests {
  return {
    version: 1,
    databases: Object.fromEntries(
      Object.entries(tablesByDb).map(([db, tables]) => [
        db,
        { schemaFile: `databases/${db}.db.ts`, tables },
      ])
    ),
  };
}

// The design's canonical chat example: messages(id, body, created_at).
function chatMessagesManifests(): FunctionManifests {
  return manifests({
    chat: {
      messages: table({
        id: idCol(),
        body: col({ notNull: true }),
        created_at: col({ type: "integer", mode: "timestamp", notNull: true }),
      }),
    },
  });
}

function diff({
  newManifests,
  previousManifests = null,
  siblings = [],
}: {
  newManifests: FunctionManifests | null;
  previousManifests?: FunctionManifests | null;
  siblings?: SiblingManifests[];
}): CompatDiff {
  return diffManifestsAgainstSiblings({
    newManifests,
    previousManifests,
    siblings,
  });
}

describe("diffManifestsAgainstSiblings", () => {
  it("is empty for a function declaring no databases", () => {
    const result = diff({
      newManifests: null,
      siblings: [{ slug: "other", manifests: chatMessagesManifests() }],
    });
    expect(result).toEqual({ blocks: [], warnings: [] });
  });

  it("is empty on a first publish with no siblings, even with NOT NULL columns", () => {
    const result = diff({ newManifests: chatMessagesManifests() });
    expect(result).toEqual({ blocks: [], warnings: [] });
  });

  it("ignores siblings without manifests or declaring other databases", () => {
    const result = diff({
      newManifests: chatMessagesManifests(),
      siblings: [
        { slug: "no-db", manifests: null },
        {
          slug: "other-db",
          manifests: manifests({
            analytics: { events: table({ id: idCol() }) },
          }),
        },
      ],
    });
    expect(result).toEqual({ blocks: [], warnings: [] });
  });

  it("blocks the design's rename example: body -> content removes a referenced column", () => {
    // `content` is added nullable (the additive way); the block is purely about `body`.
    const renamed = manifests({
      chat: {
        messages: table({
          id: idCol(),
          content: col(),
          created_at: col({
            type: "integer",
            mode: "timestamp",
            notNull: true,
          }),
        }),
      },
    });

    const result = diff({
      newManifests: renamed,
      siblings: [{ slug: "list-messages", manifests: chatMessagesManifests() }],
    });

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      database: "chat",
      table: "messages",
      column: "body",
      affectedFunctions: ["list-messages"],
    });
    expect(result.blocks[0]?.reason).toContain(
      "removes column chat.messages.body"
    );
  });

  it("blocks removing a table a sibling references", () => {
    const result = diff({
      newManifests: manifests({ chat: { other: table({ id: idCol() }) } }),
      siblings: [{ slug: "list-messages", manifests: chatMessagesManifests() }],
    });

    expect(
      result.blocks.some(
        (block) =>
          block.table === "messages" &&
          block.column === null &&
          block.reason.includes("removes table chat.messages")
      )
    ).toBe(true);
  });

  it("blocks a type change on a referenced column", () => {
    const changed = chatMessagesManifests();
    changed.databases.chat.tables.messages.columns.body = col({
      type: "integer",
      notNull: true,
    });

    const result = diff({
      newManifests: changed,
      siblings: [{ slug: "post-message", manifests: chatMessagesManifests() }],
    });

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.reason).toContain("type text -> integer");
  });

  it("blocks notNull changes in both directions", () => {
    const relaxed = chatMessagesManifests();
    relaxed.databases.chat.tables.messages.columns.body = col({
      notNull: false,
    });
    const relaxedDiff = diff({
      newManifests: relaxed,
      siblings: [{ slug: "sib", manifests: chatMessagesManifests() }],
    });
    expect(relaxedDiff.blocks).toHaveLength(1);
    expect(relaxedDiff.blocks[0]?.reason).toContain("removes NOT NULL");

    const tightened = chatMessagesManifests();
    tightened.databases.chat.tables.messages.columns.created_at = col({
      type: "integer",
      mode: "timestamp",
      notNull: false,
    });
    const base = chatMessagesManifests();
    const tightenedDiff = diff({
      newManifests: base,
      siblings: [{ slug: "sib", manifests: tightened }],
    });
    expect(tightenedDiff.blocks).toHaveLength(1);
    expect(tightenedDiff.blocks[0]?.reason).toContain("adds NOT NULL");
  });

  it("blocks primaryKey and autoIncrement changes", () => {
    const noAutoIncrement = chatMessagesManifests();
    noAutoIncrement.databases.chat.tables.messages.columns.id = col({
      type: "integer",
      notNull: true,
      hasDefault: true,
      primaryKey: true,
      autoIncrement: false,
    });
    const autoIncrementDiff = diff({
      newManifests: noAutoIncrement,
      siblings: [{ slug: "sib", manifests: chatMessagesManifests() }],
    });
    expect(autoIncrementDiff.blocks).toHaveLength(1);
    expect(autoIncrementDiff.blocks[0]?.reason).toContain("autoincrement");

    const noPk = chatMessagesManifests();
    noPk.databases.chat.tables.messages.columns.id = col({
      type: "integer",
      notNull: true,
      hasDefault: true,
      primaryKey: false,
      autoIncrement: false,
    });
    const pkDiff = diff({
      newManifests: noPk,
      siblings: [{ slug: "sib", manifests: chatMessagesManifests() }],
    });
    // The pk flip is reported (autoIncrement differs too; primary key wins the description).
    expect(pkDiff.blocks).toHaveLength(1);
    expect(pkDiff.blocks[0]?.reason).toContain("primary key");
  });

  it("blocks the design's NOT NULL addition example (no default, existing table)", () => {
    const withChannel = chatMessagesManifests();
    withChannel.databases.chat.tables.messages.columns.channel = col({
      notNull: true,
    });

    const result = diff({
      newManifests: withChannel,
      siblings: [{ slug: "list-messages", manifests: chatMessagesManifests() }],
    });

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      database: "chat",
      table: "messages",
      column: "channel",
      affectedFunctions: ["list-messages"],
    });
    expect(result.blocks[0]?.reason).toContain("without a default");
  });

  it("allows a NOT NULL addition with a default, and a nullable addition", () => {
    const withDefault = chatMessagesManifests();
    withDefault.databases.chat.tables.messages.columns.channel = col({
      notNull: true,
      hasDefault: true,
    });
    withDefault.databases.chat.tables.messages.columns.topic = col({});

    const result = diff({
      newManifests: withDefault,
      siblings: [{ slug: "sib", manifests: chatMessagesManifests() }],
    });
    expect(result.blocks).toEqual([]);
  });

  it("blocks a NOT NULL addition against the function's own previous manifests", () => {
    const withChannel = chatMessagesManifests();
    withChannel.databases.chat.tables.messages.columns.channel = col({
      notNull: true,
    });

    const result = diff({
      newManifests: withChannel,
      previousManifests: chatMessagesManifests(),
    });

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.affectedFunctions).toEqual([
      "(this function's previous publish)",
    ]);
  });

  it("does not block a NOT NULL column on a brand-new table", () => {
    const withNewTable = chatMessagesManifests();
    withNewTable.databases.chat.tables.reactions = table({
      id: idCol(),
      emoji: col({ notNull: true }),
    });

    const result = diff({
      newManifests: withNewTable,
      previousManifests: chatMessagesManifests(),
      siblings: [{ slug: "sib", manifests: chatMessagesManifests() }],
    });
    expect(result.blocks).toEqual([]);
  });

  it("warns on the design's mode-drift example instead of blocking", () => {
    // report-activity declares created_at as plain integer (no mode); the siblings declare
    // integer mode=timestamp. Same storage type -> warning, publish proceeds.
    const noMode = chatMessagesManifests();
    noMode.databases.chat.tables.messages.columns.created_at = col({
      type: "integer",
      notNull: true,
    });

    const result = diff({
      newManifests: noMode,
      siblings: [
        { slug: "post-message", manifests: chatMessagesManifests() },
        { slug: "list-messages", manifests: chatMessagesManifests() },
      ],
    });

    expect(result.blocks).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0];
    expect(warning).toMatchObject({
      kind: "mode_drift",
      database: "chat",
      table: "messages",
      subject: "created_at",
    });
    expect(warning?.message).toContain("(no mode)");
    expect(warning?.message).toContain("mode=timestamp");
    expect(warning?.message).toContain("list-messages, post-message");
    expect(warning?.message).toContain("databases/chat.db.ts");
  });

  it("warns on unique tightening for a table a sibling uses", () => {
    const withUnique = chatMessagesManifests();
    withUnique.databases.chat.tables.messages = table(
      withUnique.databases.chat.tables.messages.columns,
      { messages_body_idx: { unique: true, columns: ["body"] } }
    );

    const result = diff({
      newManifests: withUnique,
      siblings: [{ slug: "post-message", manifests: chatMessagesManifests() }],
    });

    expect(result.blocks).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      kind: "unique_tightening",
      subject: "messages_body_idx",
    });
    expect(result.warnings[0]?.message).toContain("post-message");
  });

  it("does not warn when the sibling already carries the same unique index", () => {
    const withUnique = chatMessagesManifests();
    withUnique.databases.chat.tables.messages = table(
      withUnique.databases.chat.tables.messages.columns,
      { messages_body_idx: { unique: true, columns: ["body"] } }
    );

    const result = diff({
      newManifests: withUnique,
      siblings: [{ slug: "sib", manifests: withUnique }],
    });
    expect(result.warnings).toEqual([]);
  });

  it("never blocks on indexes or hasDefault changes", () => {
    const changed = chatMessagesManifests();
    // New non-unique index + hasDefault flip on body.
    changed.databases.chat.tables.messages = table(
      {
        ...changed.databases.chat.tables.messages.columns,
        body: col({ notNull: true, hasDefault: true }),
      },
      { messages_created_idx: { unique: false, columns: ["created_at"] } }
    );

    const result = diff({
      newManifests: changed,
      siblings: [{ slug: "sib", manifests: chatMessagesManifests() }],
    });
    expect(result.blocks).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("merges the affected functions of one breaking change across siblings", () => {
    const renamed = manifests({
      chat: {
        messages: table({
          id: idCol(),
          content: col(),
          created_at: col({
            type: "integer",
            mode: "timestamp",
            notNull: true,
          }),
        }),
      },
    });

    const result = diff({
      newManifests: renamed,
      siblings: [
        { slug: "list-messages", manifests: chatMessagesManifests() },
        { slug: "post-message", manifests: chatMessagesManifests() },
      ],
    });

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.affectedFunctions).toEqual([
      "list-messages",
      "post-message",
    ]);
  });
});

describe("computeStaleSiblings", () => {
  it("flags siblings whose stored manifest for a shared database differs", () => {
    const evolved = chatMessagesManifests();
    evolved.databases.chat.tables.messages.columns.topic = col({});

    const notes = computeStaleSiblings(evolved, [
      { slug: "list-messages", manifests: chatMessagesManifests() },
      { slug: "up-to-date", manifests: evolved },
      { slug: "no-db", manifests: null },
      {
        slug: "other-db",
        manifests: manifests({ analytics: { events: table({ id: idCol() }) } }),
      },
    ]);

    expect(notes).toEqual([{ slug: "list-messages", databases: ["chat"] }]);
  });

  it("is empty when the publish declares no databases", () => {
    expect(
      computeStaleSiblings(null, [
        { slug: "sib", manifests: chatMessagesManifests() },
      ])
    ).toEqual([]);
  });
});
