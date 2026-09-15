import path from "node:path";
import { Worker } from "node:worker_threads";
import type { SourceReader } from "@app/lib/api/bundler/bundle_module";
import config from "@app/lib/api/config";
import { validateTypeScriptSyntax } from "@app/lib/api/files/content_validation";
import type { FrameValidationSnapshot } from "@app/lib/api/viz/frame_type_checker_types";
import { FrameValidationSnapshotSchema } from "@app/lib/api/viz/frame_type_checker_types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import ts from "typescript";
import { z } from "zod";

const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const CHECK_TIMEOUT_MS = 30_000;
const MAX_ACTIVE_CHECKS = 2;
const MAX_DISPLAYED_ERRORS = 10;

const ArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  snapshot: FrameValidationSnapshotSchema,
});
const DiagnosticsSchema = z.array(
  z.object({
    file: z.string(),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
    code: z.number().int(),
    message: z.string(),
  })
);
type FrameDiagnostic = z.infer<typeof DiagnosticsSchema>[number];

let cachedTypes: Promise<Result<FrameValidationSnapshot, Error>> | null = null;
let lastArtifact: {
  etag: string | null;
  snapshot: FrameValidationSnapshot;
} | null = null;
let cacheExpiresAtMs = 0;
let activeChecks = 0;

async function fetchRuntimeTypes(): Promise<
  Result<FrameValidationSnapshot, Error>
> {
  try {
    const response = await fetch(
      `${config.getVizPublicUrl()}/frame-runtime-types.json`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "error",
        headers: lastArtifact?.etag
          ? { "If-None-Match": lastArtifact.etag }
          : {},
      }
    );
    if (response.status === 304 && lastArtifact) {
      return new Ok(lastArtifact.snapshot);
    }
    if (!response.ok || !response.body) {
      return new Err(
        new Error(
          `Viz returned HTTP ${response.status} for Frame runtime types.`
        )
      );
    }
    const chunks: Uint8Array[] = [];
    let sizeBytes = 0;
    for await (const chunk of response.body) {
      sizeBytes += chunk.byteLength;
      if (sizeBytes > MAX_ARTIFACT_BYTES) {
        return new Err(
          new Error("Frame runtime types exceed their size limit.")
        );
      }
      chunks.push(chunk);
    }
    const parsed = ArtifactSchema.safeParse(
      JSON.parse(Buffer.concat(chunks).toString("utf8"))
    );
    if (!parsed.success) {
      return new Err(new Error("Viz returned an invalid Frame type artifact."));
    }
    if (parsed.data.snapshot.typescriptVersion !== ts.version) {
      return new Err(
        new Error(
          "Front and Viz use different TypeScript versions for Frame validation."
        )
      );
    }
    lastArtifact = {
      etag: response.headers.get("etag"),
      snapshot: parsed.data.snapshot,
    };
    return new Ok(parsed.data.snapshot);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

function getRuntimeTypes(): Promise<Result<FrameValidationSnapshot, Error>> {
  if (!cachedTypes || Date.now() >= cacheExpiresAtMs) {
    cacheExpiresAtMs = Date.now() + CACHE_TTL_MS;
    cachedTypes = fetchRuntimeTypes();
  }
  return cachedTypes;
}

async function collectSources(
  entryRelPath: string,
  reader: SourceReader
): Promise<Result<Record<string, string>, Error>> {
  const index = new Set(await reader.list());
  const files = new Map<string, string>();
  const pending = [entryRelPath];
  let sizeBytes = 0;
  while (pending.length > 0) {
    const relativePath = pending.pop();
    if (!relativePath || files.has(relativePath)) {
      continue;
    }
    if (!index.has(relativePath)) {
      return new Err(new Error(`Frame source not found: ${relativePath}`));
    }
    const content = await reader.read(relativePath);
    if (content === null) {
      return new Err(new Error(`Could not read Frame source: ${relativePath}`));
    }
    sizeBytes += Buffer.byteLength(content);
    if (sizeBytes > MAX_SOURCE_BYTES) {
      return new Err(
        new Error("Frame source exceeds the type check size limit of 8 MB.")
      );
    }
    files.set(relativePath, content);
    if (relativePath.endsWith(".json")) {
      continue;
    }
    // Include type imports erased by esbuild, without reading unrelated Frame files.
    for (const dependency of ts.preProcessFile(content, true, true)
      .importedFiles) {
      const specifier = dependency.fileName;
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        continue;
      }
      const base = path.posix.join(path.posix.dirname(relativePath), specifier);
      if (base.startsWith("..") || path.posix.isAbsolute(base)) {
        continue;
      }
      // Keep the same precedence as bundleModule, including directory index files.
      const extensions = ["", ".tsx", ".ts", ".jsx", ".js", ".json"];
      const resolved = [
        ...extensions.map((extension) => `${base}${extension}`),
        ...extensions.slice(1).map((extension) => `${base}/index${extension}`),
      ].find((candidate) => index.has(candidate));
      if (resolved) {
        pending.push(resolved);
      }
    }
  }
  return new Ok(Object.fromEntries(files));
}

function checkInWorker(
  snapshot: FrameValidationSnapshot,
  entryPoint: string,
  files: Record<string, string>
): Promise<Result<FrameDiagnostic[], Error>> {
  let worker: Worker;
  try {
    // This source is shipped in the application image. Only declarations arrive from viz.
    worker = new Worker(
      require.resolve(
        "@dust-tt/front/lib/api/viz/frame_type_checker_worker.ts"
      ),
      {
        workerData: { snapshot, entryPoint, files },
        resourceLimits: { maxOldGenerationSizeMb: 384 },
        execArgv: [],
      }
    );
  } catch (error) {
    return Promise.resolve(new Err(normalizeError(error)));
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: Result<FrameDiagnostic[], Error>) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      void worker.terminate().then(
        () => resolve(result),
        (error: unknown) => resolve(new Err(normalizeError(error)))
      );
    };
    const timeout = setTimeout(() => {
      finish(
        new Err(
          new Error("Frame type checking exceeded its 30 second time limit.")
        )
      );
    }, CHECK_TIMEOUT_MS);
    worker.once("message", (message: unknown) => {
      const parsed = DiagnosticsSchema.safeParse(message);
      finish(
        parsed.success
          ? new Ok(parsed.data)
          : new Err(new Error("Invalid Frame validator response."))
      );
    });
    worker.once("error", (error) => finish(new Err(normalizeError(error))));
    worker.once("exit", () =>
      finish(new Err(new Error("The Frame validator exited without a result.")))
    );
  });
}

/**
 * @cc [owner:flvndvd,label:product] shared-frame-type-validation
 * Legacy create/edit and both Frame publication paths MUST use this checker without requiring
 * Computer or a sandbox. It MUST report source paths and one-based line/column diagnostics.
 * An unavailable checker MUST return an explicit failure, never a successful validation.
 */
/**
 * @cc [owner:flvndvd,label:security] bounded-frame-type-validation
 * Frame source MUST only be parsed, never executed. Semantic type checking MUST run outside
 * the request thread with bounded concurrency, source size, execution time and worker heap size.
 */
export async function validateFrameTypes({
  entryRelPath,
  reader,
}: {
  entryRelPath: string;
  reader: SourceReader;
}): Promise<Result<undefined, { tracked: boolean; message: string }>> {
  if (activeChecks >= MAX_ACTIVE_CHECKS) {
    return new Err({
      tracked: true,
      message: "Frame validation is busy. Please try again shortly.",
    });
  }
  activeChecks++;
  try {
    const sources = await collectSources(entryRelPath, reader);
    if (sources.isErr()) {
      return new Err({ tracked: false, message: sources.error.message });
    }
    const types = await getRuntimeTypes();
    const checked = types.isOk()
      ? await checkInWorker(types.value, entryRelPath, sources.value)
      : types;
    if (checked.isErr()) {
      logger.warn(
        { err: checked.error },
        "Frame type validation could not run"
      );
      return new Err({
        tracked: true,
        message:
          "Frame type validation is temporarily unavailable. Please try again shortly.",
      });
    }
    if (checked.value.length === 0) {
      return new Ok(undefined);
    }
    const diagnostics = checked.value
      .slice(0, MAX_DISPLAYED_ERRORS)
      .map(
        (diagnostic) =>
          `${diagnostic.file}: Line ${diagnostic.line}, Column ${diagnostic.column}: error TS${diagnostic.code}: ${diagnostic.message}`
      );
    if (checked.value.length > MAX_DISPLAYED_ERRORS) {
      diagnostics.push(
        `And ${checked.value.length - MAX_DISPLAYED_ERRORS} more errors.`
      );
    }
    return new Err({
      tracked: false,
      message: `TypeScript errors detected:\n\n${diagnostics.join("\n")}\n\nPlease fix these errors and try again.`,
    });
  } finally {
    activeChecks--;
  }
}

export async function validateFrameContent(
  content: string,
  fileName: string,
  reader?: SourceReader
) {
  const syntax = validateTypeScriptSyntax(content, fileName);
  if (syntax.isErr()) {
    return new Err({
      tracked: false,
      message: `${fileName}:\n${syntax.error.message}`,
    });
  }
  return validateFrameTypes({
    entryRelPath: fileName,
    reader: {
      list: async () => [
        ...new Set([...((await reader?.list()) ?? []), fileName]),
      ],
      read: async (relativePath) =>
        relativePath === fileName
          ? content
          : (reader?.read(relativePath) ?? null),
    },
  });
}
