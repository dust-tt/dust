import {
  formatFramePackageRelativePath,
  isFramePackageRelativePath,
  parseExtractableFramePackageRelativePath,
  parseFramePackageRelativePath,
  resolvePackageRelativeToScopedPath,
  tryRewriteScopedPathToPackageRelative,
} from "@app/lib/api/frames/package_file_ref_paths";
import { rewriteInPackageUseFilePaths } from "@app/lib/api/frames/rewrite_package_file_refs";
import { describe, expect, it } from "vitest";

describe("isFramePackageRelativePath", () => {
  it("accepts ./ and bare package-relative paths", () => {
    expect(isFramePackageRelativePath("./data.csv")).toBe(true);
    expect(isFramePackageRelativePath("data.csv")).toBe(true);
    expect(isFramePackageRelativePath("assets/logo.png")).toBe(true);
  });

  it("rejects file ids and scoped paths", () => {
    expect(isFramePackageRelativePath("fil_ABCDEFGHIJ")).toBe(false);
    expect(
      isFramePackageRelativePath("conversation-conv_123/MyFrame/data.csv")
    ).toBe(false);
    expect(isFramePackageRelativePath("pod-pod_1/notes.md")).toBe(false);
    expect(isFramePackageRelativePath("conversation/report.csv")).toBe(false);
  });

  it("rejects unsafe paths", () => {
    expect(isFramePackageRelativePath("../secret.csv")).toBe(false);
    expect(isFramePackageRelativePath("/abs.csv")).toBe(false);
    expect(isFramePackageRelativePath("")).toBe(false);
    expect(isFramePackageRelativePath("fil_TOO_SHORT")).toBe(false);
  });
});

describe("parseExtractableFramePackageRelativePath", () => {
  it("requires ./ plus a known asset extension", () => {
    expect(parseExtractableFramePackageRelativePath("hello world")).toBeNull();
    expect(
      parseExtractableFramePackageRelativePath("fil_TOO_SHORT")
    ).toBeNull();
    expect(parseExtractableFramePackageRelativePath("./Chart")).toBeNull();
    expect(parseExtractableFramePackageRelativePath("./Chart.tsx")).toBeNull();
    expect(parseExtractableFramePackageRelativePath("data.csv")).toBeNull();
    expect(
      parseExtractableFramePackageRelativePath("assets/logo.png")
    ).toBeNull();
    expect(parseExtractableFramePackageRelativePath("./data.csv")).toBe(
      "data.csv"
    );
    expect(parseExtractableFramePackageRelativePath("./assets/logo.png")).toBe(
      "assets/logo.png"
    );
  });

  it("rejects UI copy and source-location strings", () => {
    expect(
      parseExtractableFramePackageRelativePath("Could not load the games CSV.")
    ).toBeNull();
    expect(
      parseExtractableFramePackageRelativePath("Please try again.")
    ).toBeNull();
    expect(
      parseExtractableFramePackageRelativePath("index.tsx:116:6")
    ).toBeNull();
    expect(
      parseExtractableFramePackageRelativePath(
        "./Could not load the games CSV."
      )
    ).toBeNull();
    expect(
      parseExtractableFramePackageRelativePath("./index.tsx:116:6")
    ).toBeNull();
  });
});

describe("parseFramePackageRelativePath / formatFramePackageRelativePath", () => {
  it("normalizes to ./form", () => {
    expect(formatFramePackageRelativePath("data.csv")).toBe("./data.csv");
    expect(formatFramePackageRelativePath("./assets/x.png")).toBe(
      "./assets/x.png"
    );
    expect(parseFramePackageRelativePath("./data.csv")).toBe("data.csv");
    expect(parseFramePackageRelativePath("assets/x.png")).toBe("assets/x.png");
  });
});

describe("tryRewriteScopedPathToPackageRelative", () => {
  const frameRoot = "conversation-conv_123/MyFrame";
  const packageFiles = new Set(["data.csv", "assets/logo.png", "index.tsx"]);

  it("rewrites in-package scoped paths", () => {
    expect(
      tryRewriteScopedPathToPackageRelative({
        scopedPath: "conversation-conv_123/MyFrame/data.csv",
        frameRoot,
        packageFiles,
      })
    ).toBe("./data.csv");
    expect(
      tryRewriteScopedPathToPackageRelative({
        scopedPath: "conversation-conv_123/MyFrame/assets/logo.png",
        frameRoot,
        packageFiles,
      })
    ).toBe("./assets/logo.png");
  });

  it("leaves external scoped paths alone", () => {
    expect(
      tryRewriteScopedPathToPackageRelative({
        scopedPath: "conversation-conv_123/other.csv",
        frameRoot,
        packageFiles,
      })
    ).toBeNull();
  });

  it("leaves paths that are not in the package file set alone", () => {
    expect(
      tryRewriteScopedPathToPackageRelative({
        scopedPath: "conversation-conv_123/MyFrame/missing.csv",
        frameRoot,
        packageFiles,
      })
    ).toBeNull();
  });
});

describe("resolvePackageRelativeToScopedPath", () => {
  it("joins under the frame root", () => {
    expect(
      resolvePackageRelativeToScopedPath({
        relativePath: "./data.csv",
        frameRoot: "conversation-conv_123/MyFrame",
      })
    ).toBe("conversation-conv_123/MyFrame/data.csv");
  });

  it("rejects escape", () => {
    expect(
      resolvePackageRelativeToScopedPath({
        relativePath: "../secret.csv",
        frameRoot: "conversation-conv_123/MyFrame",
      })
    ).toBeNull();
  });
});

describe("rewriteInPackageUseFilePaths", () => {
  const frameRoot = "conversation-conv_123/MyFrame";
  const packageFiles = new Set(["data.csv", "index.tsx"]);

  it("rewrites useFile and fileId literals for in-package files", () => {
    const code = `
import { useFile } from "@dust/react-hooks";
import Chart from "./Chart";
export default function App() {
  const data = useFile("conversation-conv_123/MyFrame/data.csv");
  return <Image fileId="conversation-conv_123/MyFrame/data.csv" />;
}
`;
    const { code: next, changed } = rewriteInPackageUseFilePaths(code, {
      frameRoot,
      packageFiles,
    });
    expect(changed).toBe(true);
    expect(next).toContain('useFile("./data.csv")');
    expect(next).toContain('fileId="./data.csv"');
    expect(next).toContain('import Chart from "./Chart"');
  });

  it("rewrites in-package paths assigned to consts and passed to useFile", () => {
    const code = `
const GAMES_CSV_PATH = "conversation-conv_123/MyFrame/data.csv";
export default function Frame() {
  const csvResult = useFile(GAMES_CSV_PATH);
  return null;
}
`;
    const { code: next, changed } = rewriteInPackageUseFilePaths(code, {
      frameRoot,
      packageFiles,
    });
    expect(changed).toBe(true);
    expect(next).toContain('const GAMES_CSV_PATH = "./data.csv"');
    expect(next).toContain("useFile(GAMES_CSV_PATH)");
    expect(next).not.toContain("conversation-conv_123/MyFrame/data.csv");
  });
});
