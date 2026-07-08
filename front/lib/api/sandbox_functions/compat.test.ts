import type {
  CompatDiff,
  SiblingState,
} from "@app/lib/api/sandbox_functions/compat";
import {
  computeStaleSiblings,
  diffStateAgainstSiblings,
} from "@app/lib/api/sandbox_functions/compat";
import type {
  DatabaseColumn,
  DatabaseIndex,
  DatabaseTable,
  FunctionState,
} from "@app/lib/api/sandbox_functions/manifests";
import { describe, expect, it } from "vitest";

function col(overrides: Partial<DatabaseColumn> = {}): DatabaseColumn {
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

function idCol(): DatabaseColumn {
  return col({
    type: "integer",
    notNull: true,
    hasDefault: true,
    primaryKey: true,
    autoIncrement: true,
  });
}

function table(
  columns: Record<string, DatabaseColumn>,
  indexes: Record<string, DatabaseIndex> = {}
): DatabaseTable {
  return { columns, indexes };
}

function state(
  tablesByDb: Record<string, Record<string, DatabaseTable>>
): FunctionState {
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
function chatMessagesState(): FunctionState {
  return state({
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
  newState,
  previousState = null,
  siblings = [],
}: {
  newState: FunctionState | null;
  previousState?: FunctionState | null;
  siblings?: SiblingState[];
}): CompatDiff {
  return diffStateAgainstSiblings({
    newState,
    previousState,
    siblings,
  });
}

describe("diffStateAgainstSiblings", () => {
  it("is empty for a function declaring no databases", () => {
    const result = diff({
      newState: null,
      siblings: [{ slug: "other", state: chatMessagesState() }],
    });
    expect(result).toEqual({ blocks: [], warnings: [] });
  });

  it("is empty on a first publish with no siblings, even with NOT NULL columns", () => {
    const result = diff({ newState: chatMessagesState() });
    expect(result).toEqual({ blocks: [], warnings: [] });
  });

  it("ignores siblings without state or declaring other databases", () => {
    const result = diff({
      newState: chatMessagesState(),
      siblings: [
        { slug: "no-db", state: null },
        {
          slug: "other-db",
          state: state({
            analytics: { events: table({ id: idCol() }) },
          }),
        },
      ],
    });
    expect(result).toEqual({ blocks: [], warnings: [] });
  });

  it("blocks the design's rename example: body -> content removes a referenced column", () => {
    // `content` is added nullable (the additive way); the block is purely about `body`.
    const renamed = state({
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
      newState: renamed,
      siblings: [{ slug: "list-messages", state: chatMessagesState() }],
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
      newState: state({ chat: { other: table({ id: idCol() }) } }),
      siblings: [{ slug: "list-messages", state: chatMessagesState() }],
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
    const changed = chatMessagesState();
    changed.databases.chat.tables.messages.columns.body = col({
      type: "integer",
      notNull: true,
    });

    const result = diff({
      newState: changed,
      siblings: [{ slug: "post-message", state: chatMessagesState() }],
    });

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.reason).toContain("type text -> integer");
  });

  it("blocks notNull changes in both directions", () => {
    const relaxed = chatMessagesState();
    relaxed.databases.chat.tables.messages.columns.body = col({
      notNull: false,
    });
    const relaxedDiff = diff({
      newState: relaxed,
      siblings: [{ slug: "sib", state: chatMessagesState() }],
    });
    expect(relaxedDiff.blocks).toHaveLength(1);
    expect(relaxedDiff.blocks[0]?.reason).toContain("removes NOT NULL");

    const tightened = chatMessagesState();
    tightened.databases.chat.tables.messages.columns.created_at = col({
      type: "integer",
      mode: "timestamp",
      notNull: false,
    });
    const base = chatMessagesState();
    const tightenedDiff = diff({
      newState: base,
      siblings: [{ slug: "sib", state: tightened }],
    });
    expect(tightenedDiff.blocks).toHaveLength(1);
    expect(tightenedDiff.blocks[0]?.reason).toContain("adds NOT NULL");
  });

  it("blocks primaryKey and autoIncrement changes", () => {
    const noAutoIncrement = chatMessagesState();
    noAutoIncrement.databases.chat.tables.messages.columns.id = col({
      type: "integer",
      notNull: true,
      hasDefault: true,
      primaryKey: true,
      autoIncrement: false,
    });
    const autoIncrementDiff = diff({
      newState: noAutoIncrement,
      siblings: [{ slug: "sib", state: chatMessagesState() }],
    });
    expect(autoIncrementDiff.blocks).toHaveLength(1);
    expect(autoIncrementDiff.blocks[0]?.reason).toContain("autoincrement");

    const noPk = chatMessagesState();
    noPk.databases.chat.tables.messages.columns.id = col({
      type: "integer",
      notNull: true,
      hasDefault: true,
      primaryKey: false,
      autoIncrement: false,
    });
    const pkDiff = diff({
      newState: noPk,
      siblings: [{ slug: "sib", state: chatMessagesState() }],
    });
    // The pk flip is reported (autoIncrement differs too; primary key wins the description).
    expect(pkDiff.blocks).toHaveLength(1);
    expect(pkDiff.blocks[0]?.reason).toContain("primary key");
  });

  it("blocks the design's NOT NULL addition example (no default, existing table)", () => {
    const withChannel = chatMessagesState();
    withChannel.databases.chat.tables.messages.columns.channel = col({
      notNull: true,
    });

    const result = diff({
      newState: withChannel,
      siblings: [{ slug: "list-messages", state: chatMessagesState() }],
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
    const withDefault = chatMessagesState();
    withDefault.databases.chat.tables.messages.columns.channel = col({
      notNull: true,
      hasDefault: true,
    });
    withDefault.databases.chat.tables.messages.columns.topic = col({});

    const result = diff({
      newState: withDefault,
      siblings: [{ slug: "sib", state: chatMessagesState() }],
    });
    expect(result.blocks).toEqual([]);
  });

  it("blocks a NOT NULL addition against the function's own previous state", () => {
    const withChannel = chatMessagesState();
    withChannel.databases.chat.tables.messages.columns.channel = col({
      notNull: true,
    });

    const result = diff({
      newState: withChannel,
      previousState: chatMessagesState(),
    });

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.affectedFunctions).toEqual([
      "(this function's previous publish)",
    ]);
  });

  it("does not block a NOT NULL column on a brand-new table", () => {
    const withNewTable = chatMessagesState();
    withNewTable.databases.chat.tables.reactions = table({
      id: idCol(),
      emoji: col({ notNull: true }),
    });

    const result = diff({
      newState: withNewTable,
      previousState: chatMessagesState(),
      siblings: [{ slug: "sib", state: chatMessagesState() }],
    });
    expect(result.blocks).toEqual([]);
  });

  it("warns on the design's mode-drift example instead of blocking", () => {
    // report-activity declares created_at as plain integer (no mode); the siblings declare
    // integer mode=timestamp. Same storage type -> warning, publish proceeds.
    const noMode = chatMessagesState();
    noMode.databases.chat.tables.messages.columns.created_at = col({
      type: "integer",
      notNull: true,
    });

    const result = diff({
      newState: noMode,
      siblings: [
        { slug: "post-message", state: chatMessagesState() },
        { slug: "list-messages", state: chatMessagesState() },
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
    const withUnique = chatMessagesState();
    withUnique.databases.chat.tables.messages = table(
      withUnique.databases.chat.tables.messages.columns,
      { messages_body_idx: { unique: true, columns: ["body"] } }
    );

    const result = diff({
      newState: withUnique,
      siblings: [{ slug: "post-message", state: chatMessagesState() }],
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
    const withUnique = chatMessagesState();
    withUnique.databases.chat.tables.messages = table(
      withUnique.databases.chat.tables.messages.columns,
      { messages_body_idx: { unique: true, columns: ["body"] } }
    );

    const result = diff({
      newState: withUnique,
      siblings: [{ slug: "sib", state: withUnique }],
    });
    expect(result.warnings).toEqual([]);
  });

  it("never blocks on indexes or hasDefault changes", () => {
    const changed = chatMessagesState();
    // New non-unique index + hasDefault flip on body.
    changed.databases.chat.tables.messages = table(
      {
        ...changed.databases.chat.tables.messages.columns,
        body: col({ notNull: true, hasDefault: true }),
      },
      { messages_created_idx: { unique: false, columns: ["created_at"] } }
    );

    const result = diff({
      newState: changed,
      siblings: [{ slug: "sib", state: chatMessagesState() }],
    });
    expect(result.blocks).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("merges the affected functions of one breaking change across siblings", () => {
    const renamed = state({
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
      newState: renamed,
      siblings: [
        { slug: "list-messages", state: chatMessagesState() },
        { slug: "post-message", state: chatMessagesState() },
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
    const evolved = chatMessagesState();
    evolved.databases.chat.tables.messages.columns.topic = col({});

    const notes = computeStaleSiblings(evolved, [
      { slug: "list-messages", state: chatMessagesState() },
      { slug: "up-to-date", state: evolved },
      { slug: "no-db", state: null },
      {
        slug: "other-db",
        state: state({ analytics: { events: table({ id: idCol() }) } }),
      },
    ]);

    expect(notes).toEqual([{ slug: "list-messages", databases: ["chat"] }]);
  });

  it("is empty when the publish declares no databases", () => {
    expect(
      computeStaleSiblings(null, [{ slug: "sib", state: chatMessagesState() }])
    ).toEqual([]);
  });
});
