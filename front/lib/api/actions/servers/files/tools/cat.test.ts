import { FILE_OFFLOAD_TEXT_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { catHandler } from "@app/lib/api/actions/servers/files/tools/cat";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/file_storage/config", () => ({
  default: { getGcsPrivateUploadsBucket: vi.fn(() => "test-bucket") },
}));
vi.mock("@app/lib/api/config", () => ({
  default: { getApiBaseUrl: vi.fn(() => "https://dust.tt") },
}));

function mockStoredFile(content: string, contentType: string) {
  fileStorageMock.setFileMetadata(() => ({
    contentType,
    size: String(Buffer.byteLength(content, "utf8")),
  }));
  fileStorageMock.setFileContent(() => content);
}

function textOf(result: Awaited<ReturnType<typeof catHandler>>): string {
  assert(result.isOk(), "expected an Ok result");
  const block = result.value[0];
  assert(block.type === "text", "expected a text block");
  return block.text;
}

// Splits the response into the display content and the bracketed footer.
function splitBody(text: string): { body: string; footer: string | null } {
  const idx = text.lastIndexOf("\n\n[");
  if (idx === -1) {
    return { body: text, footer: null };
  }
  return { body: text.slice(0, idx), footer: text.slice(idx + 2) };
}

function extractByteOffset(text: string): number {
  const match = text.match(/byte_offset=(\d+)/);
  assert(match, "expected a byte_offset continuation in the footer");
  return Number(match[1]);
}

// Reconstructs the original file lines from a sequence of response bodies, by stripping the
// `N: ` / `N (cont.): ` display prefixes and joining continuation segments.
function reconstruct(bodies: string[]): string {
  const lines: string[] = [];
  for (const body of bodies) {
    for (const displayLine of body.split("\n")) {
      const contMatch = displayLine.match(/^\d+ \(cont\.\): (.*)$/);
      if (contMatch) {
        assert(lines.length > 0, "continuation without a preceding line");
        lines[lines.length - 1] += contMatch[1];
        continue;
      }
      const match = displayLine.match(/^\d+: (.*)$/);
      assert(match, `unparseable display line: ${displayLine.slice(0, 80)}`);
      lines.push(match[1]);
    }
  }
  return lines.join("\n");
}

// Reads a whole file through catHandler, following byte_offset continuations and offsets
// until exhaustion, and returns the reconstructed content.
async function readAll(
  path: string,
  extra: ToolHandlerExtra,
  { maxCalls = 20 }: { maxCalls?: number } = {}
): Promise<string> {
  const bodies: string[] = [];
  let args: { path: string; offset?: number; byte_offset?: number } = { path };

  for (let call = 0; call < maxCalls; call++) {
    const text = textOf(await catHandler(args, extra));
    const { body, footer } = splitBody(text);
    bodies.push(body);
    expect(body).not.toContain("�");
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(
      FILE_OFFLOAD_TEXT_SIZE_BYTES
    );

    if (footer?.includes("byte_offset=")) {
      args = { path, byte_offset: extractByteOffset(footer) };
      continue;
    }
    const offsetMatch = footer?.match(/offset=(\d+) to read more/);
    if (offsetMatch) {
      args = { path, offset: Number(offsetMatch[1]) };
      continue;
    }
    return reconstruct(bodies);
  }

  throw new Error(`file not exhausted after ${maxCalls} calls`);
}

describe("catHandler", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  it("reads a small file with line numbers", async () => {
    const { auth, conversation } = await setupProjectConversation();
    mockStoredFile("alpha\nbeta\n", "text/plain");

    const text = textOf(
      await catHandler(
        { path: `conversation-${conversation.sId}/notes.txt` },
        makeExtra(auth, conversation)
      )
    );

    expect(text).toBe("1: alpha\n2: beta");
  });

  it("paginates by lines with offset and suggests the next offset", async () => {
    const { auth, conversation } = await setupProjectConversation();
    const content =
      Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
    mockStoredFile(content, "text/plain");
    const path = `conversation-${conversation.sId}/notes.txt`;
    const extra = makeExtra(auth, conversation);

    const first = textOf(await catHandler({ path, limit: 4 }, extra));
    expect(first).toContain("1: line 1");
    expect(first).toContain("4: line 4");
    expect(first).not.toContain("5: line 5");
    expect(first).toContain("Use offset=5 to read more");

    const second = textOf(
      await catHandler({ path, offset: 5, limit: 4 }, extra)
    );
    expect(second).toContain("5: line 5");
    expect(second).toContain("Use offset=9 to read more");

    const third = textOf(await catHandler({ path, offset: 9 }, extra));
    expect(third).toBe("9: line 9\n10: line 10");
  });

  it("returns 'no lines' for an offset past the end of the file", async () => {
    const { auth, conversation } = await setupProjectConversation();
    mockStoredFile("only line\n", "text/plain");

    const text = textOf(
      await catHandler(
        { path: `conversation-${conversation.sId}/notes.txt`, offset: 5 },
        makeExtra(auth, conversation)
      )
    );

    expect(text).toContain("No lines found at offset 5");
  });

  it("resumes an oversized ASCII line with byte_offset", async () => {
    const { auth, conversation } = await setupProjectConversation();
    const line = "A".repeat(30_000);
    mockStoredFile(line + "\n", "text/plain");
    const path = `conversation-${conversation.sId}/big.txt`;
    const extra = makeExtra(auth, conversation);

    const first = textOf(await catHandler({ path }, extra));
    expect(Buffer.byteLength(first, "utf8")).toBeLessThanOrEqual(
      FILE_OFFLOAD_TEXT_SIZE_BYTES
    );
    expect(first).toContain("Truncated inside line 1");
    expect(first).toContain(`File is ${30_001} bytes`);
    expect(first).toContain("Do not use offset=2");
    const byteOffset = extractByteOffset(first);

    const second = textOf(
      await catHandler({ path, byte_offset: byteOffset }, extra)
    );
    expect(second).toContain("1 (cont.): ");
    expect(second).toContain("[Reached end of file.]");

    expect(reconstruct([splitBody(first).body, splitBody(second).body])).toBe(
      line
    );
  });

  it("does not split a multibyte UTF-8 character at the truncation boundary", async () => {
    const { auth, conversation } = await setupProjectConversation();
    // 20,000 ASCII bytes then 4-byte emojis: the ~18KB cut lands inside the ASCII run on the
    // first page and inside the emoji run on a later page.
    const line = "x".repeat(20_000) + "🌍".repeat(3_000);
    mockStoredFile(line + "\n", "text/plain");
    const path = `conversation-${conversation.sId}/emoji.txt`;
    const extra = makeExtra(auth, conversation);

    const reconstructed = await readAll(path, extra);
    expect(reconstructed).toBe(line);
  });

  it("continues into ordinary lines after finishing an oversized line", async () => {
    const { auth, conversation } = await setupProjectConversation();
    const bigLine = "B".repeat(25_000);
    const content = `${bigLine}\nsecond line\nthird line\n`;
    mockStoredFile(content, "text/plain");
    const path = `conversation-${conversation.sId}/mixed.txt`;
    const extra = makeExtra(auth, conversation);

    const first = textOf(await catHandler({ path }, extra));
    const byteOffset = extractByteOffset(first);

    const second = textOf(
      await catHandler({ path, byte_offset: byteOffset }, extra)
    );
    expect(second).toContain("1 (cont.): ");
    expect(second).toContain("2: second line");
    expect(second).toContain("3: third line");

    expect(reconstruct([splitBody(first).body, splitBody(second).body])).toBe(
      `${bigLine}\nsecond line\nthird line`
    );
  });

  it("reconstructs a line requiring several continuation reads", async () => {
    const { auth, conversation } = await setupProjectConversation();
    // Non-repeating content so any misplaced resume position corrupts the reconstruction.
    let line = "";
    while (line.length < 60_000) {
      line += `<segment idx="${line.length}"/>`;
    }
    mockStoredFile(line + "\n", "text/plain");
    const path = `conversation-${conversation.sId}/huge.txt`;
    const extra = makeExtra(auth, conversation);

    const reconstructed = await readAll(path, extra);
    expect(reconstructed).toBe(line);
  });

  it("retrieves a marker beyond byte 20480 of an oversized HTML block (#9676)", async () => {
    const { auth, conversation } = await setupProjectConversation();
    const marker = "UNIQUE_MARKER_BEYOND_20K_f3a9c2";
    // One HTML instruction block serialized as a single line larger than 20KB, with the
    // marker after the 20,480th byte.
    const line = `<section class="instructions">${"lorem ipsum ".repeat(2_000)}${marker}</section>`;
    assert(
      line.indexOf(marker) > FILE_OFFLOAD_TEXT_SIZE_BYTES,
      "marker must sit beyond the first 20KB"
    );
    mockStoredFile(line + "\n", "text/html");
    const path = `conversation-${conversation.sId}/agent_config.html`;
    const extra = makeExtra(auth, conversation);

    const first = textOf(await catHandler({ path }, extra));
    expect(first).not.toContain(marker);
    const byteOffset = extractByteOffset(first);

    const second = textOf(
      await catHandler({ path, byte_offset: byteOffset }, extra)
    );
    expect(second).toContain(marker);

    expect(reconstruct([splitBody(first).body, splitBody(second).body])).toBe(
      line
    );
  });

  it("keeps the truncated response under the offload threshold for a maximal path", async () => {
    const { auth, conversation } = await setupProjectConversation();
    mockStoredFile("A".repeat(30_000) + "\n", "text/plain");
    // GCS caps object names at 1024 bytes; a near-maximal path maximizes the footer size.
    const path = `conversation-${conversation.sId}/${"x".repeat(980)}.txt`;
    const extra = makeExtra(auth, conversation);

    const first = textOf(await catHandler({ path }, extra));
    expect(Buffer.byteLength(first, "utf8")).toBeLessThanOrEqual(
      FILE_OFFLOAD_TEXT_SIZE_BYTES
    );
    expect(extractByteOffset(first)).toBeGreaterThan(0);
  });

  it("rejects a byte_offset at or beyond the current file size", async () => {
    const { auth, conversation } = await setupProjectConversation();
    mockStoredFile("A".repeat(30_000) + "\n", "text/plain");
    const path = `conversation-${conversation.sId}/big.txt`;
    const extra = makeExtra(auth, conversation);

    const byteOffset = extractByteOffset(
      textOf(await catHandler({ path }, extra))
    );

    // The file shrank since the footer was issued.
    mockStoredFile("short\n", "text/plain");
    const result = await catHandler({ path, byte_offset: byteOffset }, extra);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("beyond the end");
      expect(result.error.message).toContain("may have changed");
    }
  });

  it("errors when the stream runs short of the byte_offset despite a matching stat size", async () => {
    const { auth, conversation } = await setupProjectConversation();
    // stat reports the original size but the content shrank between stat and read.
    fileStorageMock.setFileMetadata(() => ({
      contentType: "text/plain",
      size: String(30_001),
    }));
    fileStorageMock.setFileContent(() => "short\n");
    const path = `conversation-${conversation.sId}/big.txt`;
    const extra = makeExtra(auth, conversation);

    const result = await catHandler({ path, byte_offset: 18_000 }, extra);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("changed");
    }
  });

  it("rejects a call combining offset and byte_offset", async () => {
    const { auth, conversation } = await setupProjectConversation();
    const result = await catHandler(
      {
        path: `conversation-${conversation.sId}/big.txt`,
        offset: 2,
        byte_offset: 100,
      },
      makeExtra(auth, conversation)
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("not both");
    }
  });
});
