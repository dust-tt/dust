import type { SandboxFunctionExecutionMode } from "@app/types/api/sandbox_functions";
import type { JSONSchema7 as JSONSchema } from "json-schema";

// Trim the matched snippet so the warning stays one readable line even when the bundle is
// minified.
const LINT_SNIPPET_MAX_CHARS = 80;

/**
 * Signatures of an in-function Dust tool call. Functions call tools by shelling out to the
 * `dsbx` binary (the skill mandates the pattern), and esbuild keeps string literals intact, so
 * the built bundle is scannable:
 * - a spawn-family call whose command is `dsbx` (or its absolute path), e.g.
 *   `spawnSync("dsbx", ["tools", "call", ...])`;
 * - a shell string invoking `dsbx tools ...`.
 *
 * A string heuristic by design: esbuild output makes AST-precise detection unwinnable, and this
 * only ever produces a warning, never a refusal.
 */
const DSBX_TOOL_CALL_PATTERNS: RegExp[] = [
  /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\(\s*["'`](?:\/opt\/bin\/)?dsbx["'`]/,
  /["'`][^"'`\n]*\bdsbx\s+tools\b/,
];

/**
 * Input property names that look like the caller's identity. Function inputs are
 * caller-controlled, so trusting them for identity lets any caller impersonate any user; the
 * invoking user must come from `currentUser()` instead. Exact (case-insensitive) matches only:
 * prefix/suffix matching would flag legitimate references to other users, like `assigneeUserId`.
 */
const IDENTITY_INPUT_DENY_LIST = new Set([
  "userid",
  "useremail",
  "requestedby",
  "requesterid",
  "requesteremail",
  "callerid",
  "calleremail",
  "onbehalfof",
  "actinguser",
  "currentuser",
  "currentuserid",
]);

/**
 * Advisory lint over a successfully built publish. Returns human-readable warnings for the
 * publish tool to append to its result; never blocks the publish (the heuristics have false
 * positives, which is exactly why these are warnings).
 */
export function lintSandboxFunctionPublish({
  bundleCode,
  executionMode,
  inputSchema,
  confirmFast = false,
}: {
  bundleCode: string;
  executionMode: SandboxFunctionExecutionMode;
  inputSchema: JSONSchema;
  confirmFast?: boolean;
}): string[] {
  return [
    ...lintFastModeToolCalls({ bundleCode, executionMode, confirmFast }),
    ...lintIdentityShapedInputs(inputSchema),
  ];
}

function lintFastModeToolCalls({
  bundleCode,
  executionMode,
  confirmFast,
}: {
  bundleCode: string;
  executionMode: SandboxFunctionExecutionMode;
  confirmFast: boolean;
}): string[] {
  // Only a fast function is denied tools at runtime, and `confirmFast: true` is the publisher
  // stating the match is a false positive (or accepted), so neither case warns.
  if (executionMode !== "fast" || confirmFast) {
    return [];
  }

  for (const pattern of DSBX_TOOL_CALL_PATTERNS) {
    const match = pattern.exec(bundleCode);
    if (match === null) {
      continue;
    }

    const line = bundleCode.slice(0, match.index).split("\n").length;
    const snippet = match[0].slice(0, LINT_SNIPPET_MAX_CHARS);
    return [
      `Warning: this function is published as fast but its bundle looks like it calls Dust ` +
        `tools (\`${snippet}\` at bundle line ${line}). A fast function's tool calls are ` +
        `refused at runtime with a 403 (fast_function_called_tools), and the function is then ` +
        `recorded as durable. If it calls \`dsbx tools\`, republish with executionMode ` +
        `\`durable\`; if this is a false positive, republish with \`confirmFast: true\` to ` +
        `silence this warning.`,
    ];
  }

  return [];
}

function lintIdentityShapedInputs(inputSchema: JSONSchema): string[] {
  const properties = inputSchema.properties;
  if (properties === undefined) {
    return [];
  }

  // Top-level properties only: identity-shaped inputs observed in prod (`requestedBy` on
  // update-goals) are flat, and walking nested schemas would multiply false positives.
  const flagged = Object.keys(properties).filter((name) =>
    IDENTITY_INPUT_DENY_LIST.has(name.toLowerCase())
  );

  return flagged.map(
    (name) =>
      `Warning: input property \`${name}\` looks like the caller's identity. Function inputs ` +
      `are caller-controlled and must not be trusted to identify the user; read the invoking ` +
      `user from \`currentUser()\` (imported from \`@dust/pod\`) instead. Ignore this if the ` +
      `property genuinely refers to another user rather than the caller.`
  );
}
