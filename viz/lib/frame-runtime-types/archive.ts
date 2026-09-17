import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface FrameRuntimeTypesManifest {
  version: 1;
  id: string;
  typescriptVersion: string;
  modules: string[];
  path: string;
  tarballSha256: string;
  sizeBytes: number;
}

/**
 * @cc [owner:flvndvd,label:product] frame-types-cache-identity
 * Identical artifact paths and contents MUST produce the same id. The manifest MUST identify
 * the archive by its byte checksum and only become visible after the archive is written.
 */
export function publishRuntimeTypes({
  files,
  metadata,
  stageRoot,
  outDir,
}: {
  files: ReadonlyMap<string, string>;
  metadata: Pick<FrameRuntimeTypesManifest, "typescriptVersion" | "modules">;
  stageRoot: string;
  outDir: string;
}): FrameRuntimeTypesManifest {
  // Hash file contents separately because tar timestamps can change the archive bytes.
  const treeHash = createHash("sha256");
  const entries = Array.from(files.entries()).sort(([left], [right]) => {
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  });
  for (const [fileName, content] of entries) {
    treeHash.update(fileName).update("\0").update(content).update("\0");
    const target = path.join(stageRoot, "types", fileName);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const id = treeHash.digest("hex");
  const archivePath = path.join(stageRoot, "types.tgz");
  execFileSync("tar", [
    "-czf",
    archivePath,
    "-C",
    path.join(stageRoot, "types"),
    ".",
  ]);
  const archive = fs.readFileSync(archivePath);
  const tarballSha256 = createHash("sha256").update(archive).digest("hex");
  const manifest: FrameRuntimeTypesManifest = {
    version: 1,
    id,
    ...metadata,
    path: `/frame-runtime/${tarballSha256}.tgz`,
    tarballSha256,
    sizeBytes: archive.byteLength,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${tarballSha256}.tgz`), archive);
  const manifestPath = path.join(outDir, `.manifest-${randomUUID()}.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(manifestPath, path.join(outDir, "manifest.json"));
  return manifest;
}
