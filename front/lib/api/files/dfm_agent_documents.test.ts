import { Readable } from "node:stream";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import {
  editAgentDocument,
  readAgentDocument,
  setAgentDocumentTheme,
} from "@app/lib/api/files/dfm_agent_documents";
import {
  readCanonicalFileContent,
  WriteCanonicalFileContentError,
  writeCanonicalFileContent,
} from "@app/lib/api/files/file_system_ops";
import type { Authenticator } from "@app/lib/auth";
import { parseDfm } from "@app/lib/markdown/dfm";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/api/files/file_system_ops"),
  async (importOriginal) => {
    const mod = await importOriginal();
    return {
      ...mod,
      readCanonicalFileContent: vi.fn(),
      writeCanonicalFileContent: vi.fn(),
    };
  }
);

const PATH = "pod-p1/spec.md";

const SOURCE =
  "---\ntitle: Spec\n---\n\n# Spec\n\nShip it :comment-start{id=c1}on Friday:comment-end{id=c1}.\n\n" +
  ":::annotations\n::comment{id=c1 status=open}\n\n" +
  '::message{author=user:usr_tom name="Tom" at=2026-10-05T12:00:00.000Z}\n\nWhy Friday?\n:::\n';

function stored(content: string, revision?: string) {
  return new Ok({
    stream: Readable.from([Buffer.from(content, "utf8")]),
    contentType: "text/markdown",
    revision,
  });
}

function written(call: number) {
  const [, , , content, , revision] = vi.mocked(writeCanonicalFileContent).mock
    .calls[call];
  return { content: Buffer.from(content).toString("utf8"), revision };
}

const conflict = () =>
  new Err(
    new WriteCanonicalFileContentError("revision_conflict", "File changed.")
  );

describe("readAgentDocument", () => {
  let dustFs: DustFileSystem;

  beforeEach(async () => {
    vi.resetAllMocks();
    const { authenticator } = await createResourceTest({});
    const fileSystem = await DustFileSystem.forConversations(authenticator, []);
    if (fileSystem.isErr()) {
      throw fileSystem.error;
    }
    dustFs = fileSystem.value;
  });

  it("returns the full source, anchors and threads included", async () => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(stored(SOURCE, "7"));

    const result = await readAgentDocument(dustFs, PATH);
    expect(result.isOk() && result.value.source).toBe(SOURCE);
  });

  it("refuses a file that is not Markdown or that the codec cannot read", async () => {
    const notMarkdown = await readAgentDocument(dustFs, "pod-p1/notes.txt");
    expect(notMarkdown.isErr() && notMarkdown.error.code).toBe("not_markdown");

    vi.mocked(readCanonicalFileContent).mockResolvedValue(
      stored("Hi :comment-start{id=c1}there.\n", "7")
    );
    const unreadable = await readAgentDocument(dustFs, PATH);
    expect(unreadable.isErr() && unreadable.error.code).toBe(
      "invalid_document"
    );
  });
});

describe("editAgentDocument", () => {
  let auth: Authenticator;
  let dustFs: DustFileSystem;

  beforeEach(async () => {
    vi.resetAllMocks();
    auth = (await createResourceTest({})).authenticator;
    const fileSystem = await DustFileSystem.forConversations(auth, []);
    if (fileSystem.isErr()) {
      throw fileSystem.error;
    }
    dustFs = fileSystem.value;
  });

  const edit = (oldString: string, newString: string, expected = 1) =>
    editAgentDocument(auth, dustFs, {
      scopedPath: PATH,
      oldString,
      newString,
      expectedReplacements: expected,
    });

  it("replaces text in the body and keeps the front matter and threads", async () => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(stored(SOURCE, "7"));
    vi.mocked(writeCanonicalFileContent).mockResolvedValue(
      new Ok({ created: false, revision: "8" })
    );

    const result = await edit("Ship it", "Ship $& it");
    expect(result.isOk() && result.value.replacements).toBe(1);

    const { content, revision } = written(0);
    expect(revision).toBe("7");
    const before = parseDfm(SOURCE);
    const after = parseDfm(content);
    if (before.isErr() || after.isErr()) {
      throw new Error("Unparsable document.");
    }
    expect(after.value.body).toBe(
      "# Spec\n\nShip $& it :comment-start{id=c1}on Friday:comment-end{id=c1}."
    );
    expect(after.value.frontMatter).toBe(before.value.frontMatter);
    expect(after.value.comments).toEqual(before.value.comments);
  });

  it("edits text inside a comment anchor and keeps the anchor", async () => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(stored(SOURCE, "7"));
    vi.mocked(writeCanonicalFileContent).mockResolvedValue(
      new Ok({ created: false, revision: "8" })
    );

    expect((await edit("on Friday", "on Monday")).isOk()).toBe(true);
    expect(written(0).content).toContain(
      ":comment-start{id=c1}on Monday:comment-end{id=c1}"
    );
  });

  it("matches a passage quoted from a source stored with CRLF line endings", async () => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(
      stored("# Spec\r\n\r\nalpha\r\nbeta\r\n", "7")
    );
    vi.mocked(writeCanonicalFileContent).mockResolvedValue(
      new Ok({ created: false, revision: "8" })
    );

    const result = await edit("alpha\r\nbeta", "gamma");
    expect(result.isOk() && result.value.replacements).toBe(1);
    expect(written(0).content).toBe("# Spec\n\ngamma\n");
  });

  it.each([
    ["removes an anchor", ":comment-end{id=c1}", ""],
    [
      "adds an anchor",
      "Ship it",
      ":comment-start{id=c2}Ship it:comment-end{id=c2}",
    ],
  ])("refuses an edit that %s", async (_, oldString, newString) => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(stored(SOURCE, "7"));

    const result = await edit(oldString, newString);
    expect(result.isErr() && result.error.code).toBe("anchors_changed");
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });

  it.each([
    ["outside the body", "Why Friday?", "outside_body"],
    ["missing", "Ship it on Monday", "string_not_found"],
  ])("refuses text %s without writing", async (_, oldString, code) => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(stored(SOURCE, "7"));

    const result = await edit(oldString, "x");
    expect(result.isErr() && result.error.code).toBe(code);
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty file", "", "# Plan\n\nFirst draft.\n"],
    [
      "a file with only front matter",
      "---\ntitle: Plan\n---\n",
      "---\ntitle: Plan\n---\n\n# Plan\n\nFirst draft.\n",
    ],
  ])(
    "writes the body of %s with an empty old_string",
    async (_, source, expected) => {
      vi.mocked(readCanonicalFileContent).mockResolvedValue(
        stored(source, "7")
      );
      vi.mocked(writeCanonicalFileContent).mockResolvedValue(
        new Ok({ created: false, revision: "8" })
      );

      const result = await edit("", "# Plan\r\n\r\nFirst draft.\n\n");
      expect(result.isOk() && result.value.replacements).toBe(1);
      expect(written(0).content).toBe(expected);
    }
  );

  it("refuses an empty old_string when the body has content", async () => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(stored(SOURCE, "7"));

    const result = await edit("", "Replaced.");
    expect(result.isErr() && result.error.code).toBe("string_not_found");
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });

  it("refuses an empty old_string expecting more than one replacement", async () => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(stored("", "7"));

    const result = await edit("", "# Plan\n", 2);
    expect(result.isErr() && result.error.code).toBe("unexpected_count");
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });

  it("refuses when the number of occurrences differs from the expected one", async () => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(stored(SOURCE, "7"));

    const result = await edit("i", "I");
    expect(result.isErr() && result.error.code).toBe("unexpected_count");
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });

  it("refuses a file whose storage returns no revision", async () => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(stored(SOURCE));

    const result = await edit("Ship it", "Ship");
    expect(result.isErr() && result.error.code).toBe("refused");
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });

  it("starts over from a fresh read when the file changed, never overwriting it", async () => {
    const edited = SOURCE.replace("# Spec", "# Spec v2");
    vi.mocked(readCanonicalFileContent)
      .mockResolvedValueOnce(stored(SOURCE, "7"))
      .mockResolvedValueOnce(stored(edited, "9"));
    vi.mocked(writeCanonicalFileContent)
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(new Ok({ created: false, revision: "10" }));

    expect((await edit("Ship it", "Ship")).isOk()).toBe(true);

    const { content, revision } = written(1);
    expect(revision).toBe("9");
    expect(content).toContain("# Spec v2\n\nShip :comment-start");
  });

  it("gives up after repeated conflicts", async () => {
    vi.mocked(readCanonicalFileContent).mockImplementation(async () =>
      stored(SOURCE, "7")
    );
    vi.mocked(writeCanonicalFileContent).mockResolvedValue(conflict());

    const result = await edit("Ship it", "Ship");
    expect(result.isErr() && result.error.code).toBe("conflict");
    expect(writeCanonicalFileContent).toHaveBeenCalledTimes(3);
  });
});

describe("setAgentDocumentTheme", () => {
  let auth: Authenticator;
  let dustFs: DustFileSystem;

  beforeEach(async () => {
    vi.resetAllMocks();
    auth = (await createResourceTest({})).authenticator;
    const fileSystem = await DustFileSystem.forConversations(auth, []);
    if (fileSystem.isErr()) {
      throw fileSystem.error;
    }
    dustFs = fileSystem.value;
  });

  it("writes the theme in the front matter and keeps the body and threads", async () => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(stored(SOURCE, "7"));
    vi.mocked(writeCanonicalFileContent).mockResolvedValue(
      new Ok({ created: false, revision: "8" })
    );

    const result = await setAgentDocumentTheme(auth, dustFs, {
      scopedPath: PATH,
      theme: "memo",
    });
    expect(result.isOk()).toBe(true);

    const { content, revision } = written(0);
    expect(revision).toBe("7");
    const before = parseDfm(SOURCE);
    const after = parseDfm(content);
    if (before.isErr() || after.isErr()) {
      throw new Error("Unparsable document.");
    }
    expect(after.value.frontMatter).toBe("title: Spec\ntheme: memo");
    expect(after.value.body).toBe(before.value.body);
    expect(after.value.comments).toEqual(before.value.comments);
  });

  it("refuses front matter whose theme key it cannot rewrite, without writing", async () => {
    vi.mocked(readCanonicalFileContent).mockResolvedValue(
      stored("---\ntheme: memo\ntheme: report\n---\n\n# Spec\n", "7")
    );

    const result = await setAgentDocumentTheme(auth, dustFs, {
      scopedPath: PATH,
      theme: "memo",
    });
    expect(result.isErr() && result.error.code).toBe("theme_not_rewritable");
    expect(writeCanonicalFileContent).not.toHaveBeenCalled();
  });
});
