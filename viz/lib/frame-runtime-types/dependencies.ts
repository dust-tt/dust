import fs from "node:fs";
import path from "node:path";
import type ts from "typescript";

export function collectDependencyDeclarations(
  vizRoot: string,
  sourceFiles: readonly ts.SourceFile[]
) {
  const repositoryRoot = path.dirname(vizRoot);
  const files = new Map<string, string>();
  const modulePaths = new Map<string, string>();
  // Worktrees can symlink node_modules, so accept both the symlink and its real path.
  const sourceRoots = [
    [path.join(vizRoot, "node_modules"), "viz/node_modules"],
    [path.join(repositoryRoot, "node_modules"), "node_modules"],
  ].flatMap<[string, string]>(([source, target]) =>
    fs.existsSync(source)
      ? [
          [source, target],
          [fs.realpathSync(source), target],
        ]
      : [[source, target]]
  );

  for (const source of sourceFiles) {
    // Consumers supply their compiler's standard libraries and use browser globals.
    if (
      source.isDeclarationFile &&
      !source.fileName.includes("/node_modules/@types/node/") &&
      !source.fileName.includes("/node_modules/typescript/lib/")
    ) {
      const fileName = artifactPath({
        fileName: source.fileName,
        sourceRoots,
        vizRoot,
      });
      files.set(fileName, source.text);
      modulePaths.set(source.fileName, `./${fileName}`);
      for (
        let directory = path.dirname(source.fileName);
        directory.includes("/node_modules/");
        directory = path.dirname(directory)
      ) {
        const packagePath = path.join(directory, "package.json");
        if (fs.existsSync(packagePath)) {
          files.set(
            artifactPath({ fileName: packagePath, sourceRoots, vizRoot }),
            fs.readFileSync(packagePath, "utf8")
          );
        }
      }
    }
  }

  return { files, modulePaths };
}

function artifactPath({
  fileName,
  sourceRoots,
  vizRoot,
}: {
  fileName: string;
  sourceRoots: [string, string][];
  vizRoot: string;
}): string {
  const normalized = path.resolve(fileName);
  for (const [source, target] of sourceRoots) {
    if (normalized.startsWith(`${source}/`)) {
      return `${target}${normalized.slice(source.length)}`;
    }
  }
  if (normalized.startsWith(`${vizRoot}/`)) {
    return `viz/${path.relative(vizRoot, normalized)}`;
  }
  throw new Error(`Frame declaration is outside Viz: ${fileName}`);
}
