// @vitest-environment node

import {
  importDocumentMarkdown,
  parseNativeDocument,
} from "@app/lib/api/documents/content";
import { FRAME_SKILL_FILES } from "@app/lib/resources/skill/code_defined/global/frames/files";
import { DOCUMENT_MAX_BYTES } from "@app/types/documents";
import { spawnSync } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, expect, it } from "vitest";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories) {
    await rm(directory, { recursive: true, force: true });
  }
  directories.length = 0;
});

const fixture = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "document-checker-"));
  directories.push(directory);
  for (const file of FRAME_SKILL_FILES.filter((file) =>
    file.fileName.startsWith("document/")
  )) {
    await writeFile(
      path.join(directory, path.basename(file.fileName)),
      file.content
    );
  }
  return {
    directory,
    run: (...args: string[]) =>
      spawnSync(
        process.execPath,
        [path.join(directory, "check.mjs"), ...args],
        { cwd: directory, encoding: "utf8", env: { NODE_ENV: "test" } }
      ),
  };
};

it("checks the shipped example and Frame documents from standalone skill files", async () => {
  const { directory, run } = await fixture();
  expect(run("example.dustdoc").status).toBe(0);
  const filePath = path.join(directory, "frame.dustdoc");
  const content = JSON.stringify({
    ...importDocumentMarkdown("# Revenue"),
    content: {
      type: "doc",
      content: [
        {
          type: "dustVisual",
          attrs: { name: "revenue" },
        },
      ],
    },
  });
  await writeFile(filePath, content);
  const checked = run(filePath);
  expect(checked.stderr).toBe("");
  expect(checked.status).toBe(0);
  expect(await readFile(filePath, "utf8")).toBe(content);
  expect(run("--to-markdown", filePath, "frame.md").status).toBe(1);
  await expect(readFile(path.join(directory, "frame.md"))).rejects.toThrow();

  await writeFile(filePath, content.replace("revenue", "../script"));
  expect(run(filePath).status).toBe(1);
});

it("imports and exports Markdown without changing inputs or overwriting files", async () => {
  const { directory, run } = await fixture();
  const markdown = "# Brief\n\nA **clear** next step.";
  await writeFile(path.join(directory, "brief.md"), markdown);
  expect(run("--from-markdown", "brief.md", "brief.dustdoc").status).toBe(0);
  const source = await readFile(path.join(directory, "brief.dustdoc"), "utf8");
  expect(parseNativeDocument(source)).not.toBeNull();
  expect(run("--to-markdown", "brief.dustdoc", "roundtrip.md").status).toBe(0);
  expect(
    importDocumentMarkdown(
      await readFile(path.join(directory, "roundtrip.md"), "utf8")
    )
  ).toEqual(parseNativeDocument(source));

  expect(run("--from-markdown", "brief.md", "brief.dustdoc").status).toBe(1);
  expect(await readFile(path.join(directory, "brief.dustdoc"), "utf8")).toBe(
    source
  );
  expect(await readFile(path.join(directory, "brief.md"), "utf8")).toBe(
    markdown
  );
});

it("refuses invalid content and lossy conversions before creating output", async () => {
  const { directory, run } = await fixture();
  await writeFile(
    path.join(directory, "invalid.md"),
    "<script>alert(1)</script>"
  );
  expect(run("--from-markdown", "invalid.md", "invalid.dustdoc").status).toBe(
    1
  );
  await expect(
    readFile(path.join(directory, "invalid.dustdoc"))
  ).rejects.toThrow();
  await writeFile(path.join(directory, "invalid.dustdoc"), Buffer.from([0xff]));
  expect(run("invalid.dustdoc").status).toBe(1);
  await writeFile(
    path.join(directory, "oversized.dustdoc"),
    " ".repeat(DOCUMENT_MAX_BYTES + 1)
  );
  expect(run("oversized.dustdoc").stderr).toContain("512 KiB");
  expect(run().status).toBe(1);
});
