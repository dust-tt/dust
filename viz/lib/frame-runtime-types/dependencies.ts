import fs from "node:fs";
import path from "node:path";
import type ts from "typescript";

export function collectDependencyDeclarations(
  vizRoot: string,
  sourceFiles: readonly ts.SourceFile[]
) {
  const files = new Map<string, string>();
  const modulePaths = new Map<string, string>();
  const sourceRoots = dependencySourceRoots(vizRoot);

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

// Worktrees can symlink node_modules or individual packages, and resolve hoisted packages from
// any ancestor directory, so map real paths back to Viz's layout.
function dependencySourceRoots(vizRoot: string): [string, string][] {
  const vizModules = path.join(vizRoot, "node_modules");
  const roots: [string, string][] = [[vizModules, "viz/node_modules"]];
  if (fs.existsSync(vizModules)) {
    for (const entry of fs.readdirSync(vizModules, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        roots.push([
          fs.realpathSync(path.join(vizModules, entry.name)),
          `viz/node_modules/${entry.name}`,
        ]);
      }
    }
  }
  for (
    let directory = path.dirname(vizRoot);
    directory !== path.dirname(directory);
    directory = path.dirname(directory)
  ) {
    roots.push([path.join(directory, "node_modules"), "node_modules"]);
  }
  return roots.flatMap<[string, string]>(([source, target]) =>
    fs.existsSync(source)
      ? [
          [source, target],
          [fs.realpathSync(source), target],
        ]
      : []
  );
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
