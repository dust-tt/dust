import type { DfmDocument, DfmError, DfmMessage } from "@app/lib/markdown/dfm";
import type { Result } from "@app/types/shared/result";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect } from "vitest";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

/** Every canonical example, reproduced byte for byte by the serializer. */
export const FIXTURES: { name: string; source: string }[] = readdirSync(
  FIXTURES_DIR
)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => ({
    name,
    source: readFileSync(path.join(FIXTURES_DIR, name), "utf8"),
  }));

/** The comments example, used for detailed assertions. */
export const FIXTURE = readFileSync(
  path.join(FIXTURES_DIR, "pencil_case_manifesto.md"),
  "utf8"
);

export const AT = "2026-09-25T14:16:32.380Z";
export const DAPH = { kind: "user", id: "usr_daph", name: "Daph" } as const;
export const YUKA = { kind: "user", id: "usr_yuka", name: "Yuka" } as const;
export const DUST = { kind: "agent", id: "dust", name: "@dust" } as const;
export const MESSAGE = `::message{author=user:usr_daph name="Daph" at=${AT}}`;

export function unwrap<T>(result: Result<T, DfmError>): T {
  if (result.isErr()) {
    throw new Error(result.error.message);
  }
  return result.value;
}

export function expectError<T>(
  result: Result<T, DfmError>,
  message: string,
  line?: number
) {
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error.message).toContain(message);
    if (line !== undefined) {
      expect(result.error.line).toBe(line);
    }
  }
}

/** Source line of the first line inside the block built by withBlock. */
export const BLOCK_LINE = 4;

/** A body of one line, then an annotations block made of `lines`. */
export function withBlock(...lines: string[]): string {
  return ["Body", "", ":::annotations", ...lines, ":::"].join("\n");
}

export const SIMPLE_DOCUMENT: DfmDocument = {
  frontMatter: null,
  body: "Hello :comment-start{id=c1}world:comment-end{id=c1}.",
  comments: [
    {
      id: "c1",
      status: "open",
      messages: [{ author: DAPH, createdAt: AT, body: "Hi" }],
    },
  ],
};

/** SIMPLE_DOCUMENT with its one message overridden. */
export function withMessage(message: Partial<DfmMessage>): DfmDocument {
  return {
    ...SIMPLE_DOCUMENT,
    comments: [
      {
        id: "c1",
        status: "open",
        messages: [{ author: DAPH, createdAt: AT, body: "Hi", ...message }],
      },
    ],
  };
}
