import { validateFramePackageFileRefs } from "@app/lib/api/frames/validate_package_file_refs";
import { describe, expect, it } from "vitest";

const frameRoot = "conversation-conv_123/MyFrame";

describe("validateFramePackageFileRefs", () => {
  it("accepts package-relative useFile paths", () => {
    const result = validateFramePackageFileRefs({
      frameRoot,
      sourceFiles: [
        {
          relativePath: "index.tsx",
          content: Buffer.from(`
import { useFile } from "@dust/react-hooks";
const PATH = "./data.csv";
export default function App() {
  const data = useFile(PATH);
  return null;
}
`),
        },
        {
          relativePath: "data.csv",
          content: Buffer.from("a,b\n1,2\n"),
        },
      ],
    });
    expect(result.isOk()).toBe(true);
  });

  it("rejects absolute scoped paths that point inside the package", () => {
    const result = validateFramePackageFileRefs({
      frameRoot,
      sourceFiles: [
        {
          relativePath: "index.tsx",
          content: Buffer.from(`
import { useFile } from "@dust/react-hooks";
const PATH = "conversation-conv_123/MyFrame/data.csv";
export default function App() {
  const data = useFile(PATH);
  return <Image fileId="conversation-conv_123/MyFrame/data.csv" />;
}
`),
        },
        {
          relativePath: "data.csv",
          content: Buffer.from("a,b\n1,2\n"),
        },
      ],
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_package_file_ref");
      expect(result.error.message).toContain(
        'replace "conversation-conv_123/MyFrame/data.csv" with "./data.csv"'
      );
      expect(result.error.message).toContain("index.tsx:");
    }
  });

  it("allows absolute scoped paths outside the package", () => {
    const result = validateFramePackageFileRefs({
      frameRoot,
      sourceFiles: [
        {
          relativePath: "index.tsx",
          content: Buffer.from(`
import { useFile } from "@dust/react-hooks";
export default function App() {
  const data = useFile("conversation-conv_123/other.csv");
  return null;
}
`),
        },
      ],
    });
    expect(result.isOk()).toBe(true);
  });
});
