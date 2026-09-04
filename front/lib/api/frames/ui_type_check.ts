import { randomUUID } from "node:crypto";
import path from "node:path";

import type { ValidationWarning } from "@app/lib/api/files/content_validation";
import { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import { rootCommand } from "@app/lib/api/sandbox/root_command";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { FrameRuntimeTypesArtifact } from "@app/lib/api/viz/frame_runtime_types";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Type-checks a staged Frame UI source tree inside the publishing sandbox, against the Frame
 * runtime types artifact Viz generates from its real runtime modules. `tsc` never evaluates the
 * source, and it runs as the egress-controlled sandbox user, so untrusted Frame code stays on the
 * workload side.
 *
 * Diagnostics that mean the bundle cannot import at render time (unresolved modules, missing
 * exports, an entry point that is not a prop-less component) fail publication; every other
 * diagnostic is returned as a warning for the author.
 */

export const FRAME_RUNTIME_TYPES_ROOT = "/var/lib/dust/frame-runtime";
// Non-mounted scratch root, so a check never writes into the files mount.
const CHECK_SCRATCH_ROOT = "/tmp/dust-frame-ui-checks";
// `typescript` is installed globally in the sandbox image (see image/registry.ts).
const TSC_BIN_PATH = "/opt/npm-global/bin/tsc";
const TYPE_CHECK_EXEC_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_REPORTED_DIAGNOSTICS = 10;
const MAX_ERROR_MESSAGE_CHARS = 8 * 1024;
// tsc exits with 2 when it reports diagnostics for a valid project.
const TSC_DIAGNOSTICS_EXIT_CODE = 2;

// Diagnostics whose presence means the bundle would fail to import in the renderer.
const RESOLUTION_ERROR_CODES = new Set([
  "TS1192", // Module has no default export.
  "TS2305", // Module has no exported member.
  "TS2307", // Cannot find module.
  "TS2613", // Module has no default export; did you mean a named import?
  "TS2614", // Module has no exported member; did you mean the default import?
  "TS2724", // Module has no exported member named X; did you mean Y?
]);

// Groups: file, line, column (all optional together), code, message.
const TSC_DIAGNOSTIC_LINE = /^(?:(.+?)\((\d+),(\d+)\): )?error (TS\d+): (.*)$/;

export interface TscDiagnostic {
  file: string | null;
  line: number | null;
  column: number | null;
  code: string;
  message: string;
}

type RootExecResult = Awaited<ReturnType<SandboxResource["execRoot"]>>;

function rootCommandFailure(
  result: RootExecResult,
  operation: string
): SandboxFunctionError | undefined {
  if (result.isErr()) {
    return new SandboxFunctionError("internal", result.error.message);
  }
  if (result.value.exitCode !== 0) {
    const detail = result.value.stderr.trim() || result.value.stdout.trim();
    return new SandboxFunctionError(
      "internal",
      `${operation} failed with exit code ${result.value.exitCode}${detail ? `: ${detail}` : "."}`
    );
  }
  return undefined;
}

/** Parses `tsc --pretty false` output; continuation lines belong to the preceding diagnostic. */
export function parseTscOutput(stdout: string): TscDiagnostic[] {
  const diagnostics: TscDiagnostic[] = [];
  for (const line of stdout.split("\n")) {
    const match = TSC_DIAGNOSTIC_LINE.exec(line);
    if (match) {
      const [, file, lineNumber, column, code, message] = match;
      diagnostics.push({
        file: file ?? null,
        line: lineNumber ? Number(lineNumber) : null,
        column: column ? Number(column) : null,
        code,
        message,
      });
      continue;
    }

    const previous = diagnostics.at(-1);
    if (previous && /^\s+\S/.test(line)) {
      previous.message = `${previous.message}\n${line.trim()}`;
    }
  }

  return diagnostics;
}

function boundMessage(message: string): string {
  return message.length > MAX_ERROR_MESSAGE_CHARS
    ? `${message.slice(0, MAX_ERROR_MESSAGE_CHARS)}\n...`
    : message;
}

function formatDiagnostic(
  diagnostic: TscDiagnostic,
  stagingDirectory: string
): string {
  const location =
    diagnostic.file === null
      ? ""
      : `${path.posix.relative(stagingDirectory, diagnostic.file)}:${diagnostic.line ?? 0}:${diagnostic.column ?? 0}: `;

  return `${location}error ${diagnostic.code}: ${diagnostic.message}`;
}

/**
 * Installs the runtime types artifact under a root-owned, content-addressed directory once per
 * sandbox. Returns the directory holding the artifact's `tsconfig.json`.
 */
export async function ensureFrameRuntimeTypesInstalled(
  auth: Authenticator,
  {
    sandbox,
    artifact,
  }: {
    sandbox: SandboxResource;
    artifact: FrameRuntimeTypesArtifact;
  }
): Promise<Result<string, SandboxFunctionError>> {
  const runtimeDirectory = path.posix.join(
    FRAME_RUNTIME_TYPES_ROOT,
    artifact.id
  );
  const runtimeTsconfigPath = path.posix.join(
    runtimeDirectory,
    "tsconfig.json"
  );

  const probeResult = await sandbox.execRoot(
    auth,
    rootCommand.exec("/usr/bin/test", ["-f", runtimeTsconfigPath])
  );
  if (probeResult.isErr()) {
    return new Err(
      new SandboxFunctionError("internal", probeResult.error.message)
    );
  }
  if (probeResult.value.exitCode === 0) {
    return new Ok(runtimeDirectory);
  }

  const uploadId = `.${artifact.id}.${randomUUID()}`;
  const tarballPath = path.posix.join(
    FRAME_RUNTIME_TYPES_ROOT,
    `${uploadId}.tgz`
  );
  const extractDirectory = path.posix.join(FRAME_RUNTIME_TYPES_ROOT, uploadId);
  let result: Result<string, SandboxFunctionError>;
  try {
    const createResult = await sandbox.execRoot(
      auth,
      rootCommand.exec("/usr/bin/install", [
        "-d",
        "-m",
        "0755",
        "-o",
        "root",
        "-g",
        "root",
        FRAME_RUNTIME_TYPES_ROOT,
      ])
    );
    const createFailure = rootCommandFailure(
      createResult,
      "Frame runtime types root creation"
    );
    if (createFailure) {
      return new Err(createFailure);
    }

    const uploadResult = await sandbox.writeFile(
      auth,
      tarballPath,
      Uint8Array.from(artifact.tarball).buffer
    );
    if (uploadResult.isErr()) {
      return new Err(
        new SandboxFunctionError("internal", uploadResult.error.message)
      );
    }

    // Verify the upload before root extracts it, extract into a private directory, strip
    // anything that is not a plain file or directory, then publish it atomically. A concurrent
    // install of the same artifact may win the rename; that is fine as long as the result exists.
    const installResult = await sandbox.execRoot(
      auth,
      rootCommand.unsafeShell(
        [
          `/usr/bin/printf '%s  %s\\n' ${shellEscape(artifact.tarballSha256)} ${shellEscape(tarballPath)} | /usr/bin/sha256sum -c --status`,
          `/usr/bin/install -d -m 0755 -o root -g root -- ${shellEscape(extractDirectory)}`,
          `/usr/bin/tar -xzf ${shellEscape(tarballPath)} -C ${shellEscape(extractDirectory)}`,
          `/usr/bin/chown -R root:root -- ${shellEscape(extractDirectory)}`,
          `/usr/bin/find ${shellEscape(extractDirectory)} -type d -exec /usr/bin/chmod 0755 -- {} +`,
          `/usr/bin/find ${shellEscape(extractDirectory)} -type f -exec /usr/bin/chmod 0644 -- {} +`,
          `test -z "$(/usr/bin/find ${shellEscape(extractDirectory)} ! -type d ! -type f -print -quit)"`,
          `test -f ${shellEscape(path.posix.join(extractDirectory, "tsconfig.json"))}`,
          `{ /usr/bin/mv -T -- ${shellEscape(extractDirectory)} ${shellEscape(runtimeDirectory)} 2>/dev/null || test -f ${shellEscape(runtimeTsconfigPath)}; }`,
        ].join(" && "),
        "Verify, extract, harden and atomically publish the Frame runtime types artifact."
      )
    );
    const installFailure = rootCommandFailure(
      installResult,
      "Frame runtime types installation"
    );
    result = installFailure
      ? new Err(installFailure)
      : new Ok(runtimeDirectory);
  } finally {
    await sandbox.execRoot(
      auth,
      rootCommand.exec("/usr/bin/rm", [
        "-rf",
        "--",
        tarballPath,
        extractDirectory,
      ])
    );
  }

  return result;
}

/**
 * Runs `tsc` over the staged Frame UI entry point and everything it imports. Resolution failures
 * and an invalid entry component fail with `ui_build_failed`; other diagnostics become warnings.
 */
export async function typeCheckFrameUiOnSandbox(
  auth: Authenticator,
  {
    sandbox,
    runtimeDirectory,
    stagingDirectory,
    entryRelPath,
  }: {
    sandbox: SandboxResource;
    runtimeDirectory: string;
    stagingDirectory: string;
    entryRelPath: string;
  }
): Promise<
  Result<
    { warnings: ValidationWarning[] },
    FramePublicationError | SandboxFunctionError
  >
> {
  const scratchDirectory = path.posix.join(CHECK_SCRATCH_ROOT, randomUUID());
  const entryCheckPath = path.posix.join(scratchDirectory, "entry-check.tsx");
  const tsconfigPath = path.posix.join(scratchDirectory, "tsconfig.json");
  // TypeScript rejects `.ts`/`.tsx` extensions in import specifiers.
  const entryImportPath = path.posix.join(
    stagingDirectory,
    entryRelPath.replace(/\.(?:tsx|ts|jsx|js)$/, "")
  );
  const entryCheckSource =
    `import FrameComponent from ${JSON.stringify(entryImportPath)};\n` +
    "export const entryCheck = <FrameComponent />;\n";
  const tsconfig = {
    extends: path.posix.join(runtimeDirectory, "tsconfig.json"),
    compilerOptions: { noEmit: true },
    files: [entryCheckPath],
  };

  let result: Result<
    { warnings: ValidationWarning[] },
    FramePublicationError | SandboxFunctionError
  >;
  try {
    const createResult = await sandbox.execRoot(
      auth,
      rootCommand.and([
        rootCommand.exec("/usr/bin/install", [
          "-d",
          "-m",
          "0755",
          "-o",
          "root",
          "-g",
          "root",
          CHECK_SCRATCH_ROOT,
        ]),
        rootCommand.exec("/usr/bin/install", [
          "-d",
          "-m",
          "0755",
          "-o",
          "root",
          "-g",
          "root",
          scratchDirectory,
        ]),
      ])
    );
    const createFailure = rootCommandFailure(
      createResult,
      "Frame UI type check scratch creation"
    );
    if (createFailure) {
      return new Err(createFailure);
    }

    for (const [filePath, content] of [
      [entryCheckPath, entryCheckSource],
      [tsconfigPath, JSON.stringify(tsconfig)],
    ] as const) {
      const writeResult = await sandbox.writeFile(
        auth,
        filePath,
        Uint8Array.from(Buffer.from(content, "utf8")).buffer
      );
      if (writeResult.isErr()) {
        return new Err(
          new SandboxFunctionError("internal", writeResult.error.message)
        );
      }
    }
    const hardenResult = await sandbox.execRoot(
      auth,
      rootCommand.exec("/usr/bin/chmod", [
        "-R",
        "u=rwX,go=rX",
        "--",
        scratchDirectory,
      ])
    );
    const hardenFailure = rootCommandFailure(
      hardenResult,
      "Frame UI type check scratch hardening"
    );
    if (hardenFailure) {
      return new Err(hardenFailure);
    }

    const execResult = await sandbox.exec(
      auth,
      `cd ${shellEscape(scratchDirectory)} && ${TSC_BIN_PATH} -p tsconfig.json --pretty false`,
      { timeoutMs: TYPE_CHECK_EXEC_TIMEOUT_MS, user: "agent-proxied" }
    );
    if (execResult.isErr()) {
      return new Err(
        new SandboxFunctionError("internal", execResult.error.message)
      );
    }
    const { exitCode, stdout, stderr } = execResult.value;
    if (exitCode === 0) {
      return new Ok({ warnings: [] });
    }
    const diagnostics = parseTscOutput(stdout);
    if (exitCode !== TSC_DIAGNOSTICS_EXIT_CODE || diagnostics.length === 0) {
      const detail = stderr.trim() || stdout.trim();
      return new Err(
        new SandboxFunctionError(
          "internal",
          `Frame UI type check failed with exit code ${exitCode}${detail ? `: ${boundMessage(detail)}` : "."}`
        )
      );
    }

    const entryDiagnostics = diagnostics.filter(
      (diagnostic) => diagnostic.file === entryCheckPath
    );
    if (entryDiagnostics.length > 0) {
      return new Err(
        new FramePublicationError(
          "ui_build_failed",
          boundMessage(
            `Frame UI entry point must default-export a component that renders without props:\n${entryDiagnostics
              .slice(0, MAX_REPORTED_DIAGNOSTICS)
              .map(
                (diagnostic) =>
                  `error ${diagnostic.code}: ${diagnostic.message}`
              )
              .join("\n")}`
          )
        )
      );
    }

    const resolutionDiagnostics = diagnostics.filter((diagnostic) =>
      RESOLUTION_ERROR_CODES.has(diagnostic.code)
    );
    if (resolutionDiagnostics.length > 0) {
      return new Err(
        new FramePublicationError(
          "ui_build_failed",
          boundMessage(
            `Frame UI imports do not resolve against the Frame runtime:\n${resolutionDiagnostics
              .slice(0, MAX_REPORTED_DIAGNOSTICS)
              .map((diagnostic) =>
                formatDiagnostic(diagnostic, stagingDirectory)
              )
              .join("\n")}`
          )
        )
      );
    }

    result = new Ok({
      warnings: diagnostics
        .slice(0, MAX_REPORTED_DIAGNOSTICS)
        .map((diagnostic) => ({
          type: "typescript",
          message: boundMessage(formatDiagnostic(diagnostic, stagingDirectory)),
        })),
    });
  } finally {
    await sandbox.execRoot(
      auth,
      rootCommand.exec("/usr/bin/rm", ["-rf", "--", scratchDirectory])
    );
  }

  return result;
}
