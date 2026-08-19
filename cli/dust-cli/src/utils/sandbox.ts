import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import fs from "fs";
import os from "os";
import path from "path";

interface SandboxConfig {
  root: string;
  allowedPaths: string[];
  enabled: boolean;
}

let config: SandboxConfig = {
  root: resolveSymlinks(process.cwd()),
  allowedPaths: [],
  enabled: true,
};

// Resolves symlinks on the longest existing prefix of `target`, so a link planted inside the
// workspace cannot be used to step outside of it.
function resolveSymlinks(target: string): string {
  const absolute = path.resolve(target);
  const trailing: string[] = [];
  let current = absolute;

  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...[...trailing].reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return absolute;
      }
      trailing.push(path.basename(current));
      current = parent;
    }
  }
}

function expandHome(target: string): string {
  if (target === "~") {
    return os.homedir();
  }
  if (target.startsWith("~/")) {
    return path.join(os.homedir(), target.slice(2));
  }
  return target;
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function configureSandbox({
  allowPaths = [],
  disabled = false,
}: {
  allowPaths?: string[];
  disabled?: boolean;
}): void {
  config = {
    root: resolveSymlinks(process.cwd()),
    allowedPaths: allowPaths.map((p) => resolveSymlinks(expandHome(p))),
    enabled: !disabled,
  };
}

export function getSandboxConfig(): SandboxConfig {
  return { ...config, allowedPaths: [...config.allowedPaths] };
}

export function describeSandbox(): string {
  if (!config.enabled) {
    return "Filesystem sandbox disabled - the agent can read and write anywhere.";
  }

  const scope = [config.root, ...config.allowedPaths]
    .map((p) => p.replace(os.homedir(), "~"))
    .join(", ");

  return `Filesystem access limited to ${scope}`;
}

/**
 * Resolves `target` and checks it against the sandbox boundary. Relative paths resolve against
 * `base`, which defaults to the workspace root.
 */
export function resolveInSandbox(
  target: string,
  base: string = config.root
): Result<string, Error> {
  const resolved = resolveSymlinks(path.resolve(base, expandHome(target)));

  if (!config.enabled) {
    return new Ok(resolved);
  }

  const allowedRoots = [config.root, ...config.allowedPaths];
  if (allowedRoots.some((root) => isInside(resolved, root))) {
    return new Ok(resolved);
  }

  return new Err(
    new Error(
      `"${target}" is outside the workspace (${config.root}). Restart the CLI with ` +
        `--allow-path ${path.dirname(resolved)} to grant access, or ` +
        `--dangerously-disable-sandbox to lift the boundary entirely.`
    )
  );
}

// An argument is treated as a path when it points somewhere: a separator, a leading `~`, or a bare
// `.`/`..`. Bare words are left alone, they are far more often subcommands than filenames.
function pathLikeOperands(args: string[]): string[] {
  return args.flatMap((arg) => {
    const value = arg.startsWith("-") ? arg.split("=").slice(1).join("=") : arg;
    if (!value) {
      return [];
    }
    const points =
      value.includes(path.sep) ||
      value.startsWith("~") ||
      value === "." ||
      value === "..";
    return points ? [value] : [];
  });
}

/**
 * Path-looking command arguments that fall outside the sandbox. This is a guardrail on the obvious
 * cases (`ls ..`, `cat ../.env`), not a containment boundary: a command is free to reach outside
 * the workspace on its own once it runs.
 */
export function escapingCommandOperands(args: string[], cwd: string): string[] {
  if (!config.enabled) {
    return [];
  }

  return pathLikeOperands(args).filter((operand) =>
    resolveInSandbox(operand, cwd).isErr()
  );
}
