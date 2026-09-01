import { isDustLikeAgent } from "@app/lib/api/assistant/global_agents/prompt_context";
import { readWorkspacePolicy } from "@app/lib/api/sandbox/egress_policy";
import {
  createToolManifest,
  filterDsbxToolEntries,
  getSandboxImage,
  getToolsForProvider,
  toolManifestToCompactText,
} from "@app/lib/api/sandbox/image";
import type { ManifestToolEntry } from "@app/lib/api/sandbox/image/types";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import logger from "@app/logger/logger";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { isPodConversation } from "@app/types/assistant/conversation";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/types/mount_path";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import { Ok } from "@app/types/shared/result";

function buildSandboxInstructionProse({
  hasDsbxTools,
  hasFramesV2,
}: {
  hasDsbxTools: boolean;
  hasFramesV2: boolean;
}): string {
  const instructions = [
    'The sandbox provides an isolated Linux environment for running code, scripts, and shell commands. Always call this environment "the Computer" in any text you send to the user.',
    "Use `bash` to run commands and scripts.",
    "The sandbox persists for the conversation duration.",
  ];

  if (hasDsbxTools) {
    instructions.push(
      "You can use the `dsbx` command line tool to list and run tools programmatically in the sandbox.",
      "Use it with `dsbx tools [SERVER_NAME] [TOOL_NAME] [ARGS]...`. Run `dsbx tools --help` for more information.",
      "`dsbx` tool calls only work while the `bash` command that started them is running: once it returns or hits its timeout, its credentials are revoked and any leftover call fails. Do not background them, and do not start more calls than fit in the timeout — split large batches across several `bash` calls, or raise `timeoutMs`.",
      "For very large argument values, write the value to a file in the sandbox and pass the path with a `__file__:` prefix (e.g. `--query __file__:/tmp/q.txt`) instead of inlining the value on the command line. Any value starting with `__file__:` is read from the file (UTF-8, max 100 MB) and used as the value for that key. File contents that are a JSON object or array are parsed into structured data (e.g. `--files __file__:/tmp/files.json` for a tool expecting an array), exactly as if the same JSON had been passed inline; any other content is used as a string. The file must already exist in the sandbox filesystem.",
      "Pass `--json` (before the server and tool names, e.g. `dsbx tools --json [SERVER_NAME] [TOOL_NAME] [ARGS]...`) to get the tool result as structured JSON (`{ content, isError }`) instead of plain text, which is easier to parse programmatically. Placed after the positional arguments it is treated as a tool argument instead."
    );

    if (!hasFramesV2) {
      instructions.push(
        "For any Frame task, enable the `Create Frames` skill and use its interactive-content tools; publish or republish with `publish_interactive_content_file`. Never use `dsbx frame`."
      );
    }
  }

  return instructions.join(" ");
}

function buildFilesSection({ hasPod }: { hasPod: boolean }): string {
  const podMountLine = hasPod
    ? `
- \`/files/pod\` — the Pod's file system, shared across every conversation
  in the same Pod. Anything you write or delete here is visible to the
  other conversations of that Pod.`
    : "";

  const podUsageSection = hasPod
    ? `

This conversation belongs to a Pod. \`/files/pod\` holds what belongs to the
Pod as a whole (specs, knowledge bases, shared scripts, recurring data
sets) and outlives this conversation; \`/files/conversation\` holds this
conversation's own artifacts. Pod files are also exposed by the \`files\`
MCP server under scoped paths like \`pod-{podId}/<rel>\`.`
    : "";

  return `#### Sandbox File System

${hasPod ? "Two paths are" : "One path is"} mounted read-write and ${hasPod ? "hold" : "holds"} persistent files:

- \`/files/conversation\` — files uploaded by the user and files you write
  for the user. This is the canonical surface for navigating, inspecting,
  and producing conversation files — strongly prefer it over the \`files\`
  MCP server when the sandbox is available.${podMountLine}

${
  hasPod
    ? "Both paths are symlinks to the actual mount points\n(`/files/conversation-<conversationId>` and `/files/pod-<podId>`)"
    : "That path is a symlink to the actual mount point\n(`/files/conversation-<conversationId>`)"
}, so tools that do not follow symlinks by default need to be told to:
\`find -L /files/conversation ...\`, \`rg --follow\`, \`ls -L\`.

These mounts are backed by GCS: their contents persist and are visible
to the user, but reads and writes are much slower than the local file
system. For heavy or repeated I/O, copy what you need to a local path such
as \`/tmp\`, work there, and write the result back.

Everything outside ${hasPod ? "these two mounts" : "this mount"} is temporary, including other
paths under \`/files/\`: it is deleted when the sandbox is recycled and is
never shown to the user.${podUsageSection}

Conversation layout:

- \`/files/conversation/\` — put deliverables (scripts, exports, reports,
  charts) directly in this directory; anything you write here is delivered
  to the user as a conversation file. Do not write your own files into
  \`${TOOL_OUTPUTS_FOLDER_NAME}/\`, that path is managed automatically.
- \`/files/conversation/${TOOL_OUTPUTS_FOLDER_NAME}/\` — **tool outputs are automatically
  persisted here as a side effect of every tool call you make.** Two cases
  qualify:
  1. Output blocks that represent fetched content (the contents of a
     data-source node such as a connected Notion or Drive document, or the
     result of the web-browse tool) are saved as \`.md\`.
  2. Plain text outputs larger than 20 KiB (20480 bytes) are saved as
     \`.txt\`, or \`.json\` when the body parses as JSON.
  Filenames have the form \`<epochMs>_<slug>.<ext>\`, e.g.
  \`1714896000000_my-notion-page.md\`, so a plain \`ls\` lists them in
  chronological order. Smaller plain-text outputs are not persisted — they
  live only in the conversation transcript.

The exact same files are also exposed by the \`files\` MCP server (tools
\`list\`, \`cat\`, \`grep\`, \`create\`) under scoped paths like
\`conversation/${TOOL_OUTPUTS_FOLDER_NAME}/<file>\`. The MCP server and the mount are two views
on the same underlying conversation storage: a write through one is
immediately visible through the other.

Default to the sandbox, not the \`files\` MCP server. Whenever the sandbox
is available, navigate and process conversation files and tool outputs
with bash on \`/files/conversation\` using the standard POSIX toolchain
plus \`jq\` / \`rg\` (call \`describe_toolset\` for the full list). This is
cheaper than MCP round-trips, keeps intermediate output out of the
conversation context, and lets you compose pipelines. Reach for the
\`files\` MCP server only for a trivial one-shot read where spinning up a
shell command would be heavier than needed. Never re-call a tool just to
re-read its output: the previous result is already on disk under
\`/files/conversation/${TOOL_OUTPUTS_FOLDER_NAME}/\`.

Typical workflow when a prior tool returned a large output: locate the most
recent matching file under \`/files/conversation/${TOOL_OUTPUTS_FOLDER_NAME}/\`, then use
\`jq\` / \`rg\` / \`grep\` to extract just the fields or lines you need,
instead of paging the whole blob back through \`files__cat\` or re-running
the tool.

For tabular files (CSV, TSV, Excel) under \`/files/conversation\`, code is
the preferred way to interact with them: analyze them with pandas, DuckDB,
or the standard csv module. For very large files prefer chunked reads
(\`pandas.read_csv(..., chunksize=...)\`) or DuckDB to keep memory bounded.`;
}

function formatWorkspaceAllowlist(domains: string[]): string {
  if (domains.length === 0) {
    return "_(none — this workspace has no preapproved domains)_";
  }
  return domains.map((d) => `- \`${d}\``).join("\n");
}

async function buildNetworkAccessSection(auth: Authenticator): Promise<string> {
  const flags = await getFeatureFlags(auth);
  const hasWorkspaceAdmin = isComputerFeatureEnabled(flags);
  const allowAgentRequests =
    hasWorkspaceAdmin &&
    auth.getNonNullableWorkspace().metadata?.sandboxAllowAgentEgressRequests ===
      true;
  const policyResult = await readWorkspacePolicy(auth);
  let workspaceDomains: string[] = [];
  if (policyResult.isErr()) {
    logger.warn(
      { err: policyResult.error },
      "Failed to read workspace egress policy for sandbox skill instructions"
    );
  } else {
    workspaceDomains = policyResult.value.allowedDomains;
  }

  if (!allowAgentRequests) {
    return `#### Sandbox Network Access

All outbound network traffic from the sandbox is routed through an egress
proxy that **denies every request by default**. Only domains on the
workspace allowlist below should be relied on. There is **no** way to add
additional domains during the conversation. If a required domain is not
listed, use only preapproved domains or local data, or explain the blocker and
ask the user to contact their workspace admin.

Workspace allowlist:

${formatWorkspaceAllowlist(workspaceDomains)}

If a domain is blocked by the allowlist, the bash tool output will include a
\`<network_proxy_logs>\` block naming the denied domain(s). Surface that
information to the user so they can decide whether to ask their admin to
allowlist it; do not retry without changes.

The block lists **only** domains rejected by the allowlist. A request that
reaches an allowed domain and comes back with an HTTP \`401\`/\`403\` (or any
other \`4xx\`) in \`<stdout>\` is an upstream authentication/authorization
error, not a proxy block — do not treat it as a domain that needs
allowlisting. If the block names a host you did not call directly, the request
most likely followed a redirect to that host (for example an auth/login
domain).`;
  }

  return `#### Sandbox Network Access

All outbound network traffic from the sandbox is routed through an egress
proxy that **denies every request by default**. Only domains on the
sandbox's allowlist can be reached.

The allowlist is the union of two sources:

1. **Workspace allowlist** — domains preapproved by the workspace admin
   for every sandbox in this workspace:

${formatWorkspaceAllowlist(workspaceDomains)}

2. **Sandbox allowlist** — domains added during this conversation via the
   \`add_egress_domain\` tool. These live for the lifetime of the current
   sandbox only and are discarded when the sandbox is reaped.

If the target domain — or a wildcard parent of it (for example,
\`*.github.com\` matches \`api.github.com\` and \`a.b.github.com\`, but not
\`github.com\` itself) — is already in the workspace allowlist shown above,
do NOT call \`add_egress_domain\`; just use the domain. Only call
\`add_egress_domain\` for domains that are not yet covered, and do so
**before** running the command, with the **exact** domain (wildcards are not
accepted) and a one-sentence reason the user will see in the approval prompt.
This is preferable to running the command first and reacting to a denial.

If a request is blocked by the allowlist — for example because you missed a
domain or a redirect chain hits an unexpected host — the bash tool output
will include a \`<network_proxy_logs>\` block naming the denied domain(s).
Use that block to identify the missing domain and call
\`add_egress_domain\` to unblock the next attempt.

The block lists **only** domains rejected by the allowlist. A request that
reaches an allowed domain and returns an HTTP \`401\`/\`403\` (or any other
\`4xx\`) in \`<stdout>\` is an upstream authentication/authorization error, not
a proxy block — do **not** call \`add_egress_domain\` for it. If the block
names a host you did not call directly, the request most likely followed a
redirect to that host (such as an auth/login domain); allowlist that host only
if you intend to follow the redirect. If a request mysteriously hangs or fails
with TLS/DNS errors, check the \`<network_proxy_logs>\` block first; a denied
egress is a possible cause.`;
}

function buildEnvironmentVariablesSection(): string {
  return `#### Sandbox Environment Variables

The sandbox may have workspace-configured environment variables available
in the bash shell and to any code you run. All of them are sensitive.

There are two prefixes:

- \`DST_*\`: configuration values injected as normal environment variables.
  Use them for local configuration and API clients, but never print them.
- \`DSEC_*\`: HTTPS secret placeholders. The value in the environment is
  intentionally not the real secret. Send it as an HTTPS request header to
  the domain approved for that secret; the egress proxy substitutes the real
  value on the wire.

To see which \`DST_*\` and \`DSEC_*\` variables are configured for this
workspace, run \`dsbx env\`. It lists each variable by name and, for every
\`DSEC_*\` placeholder, the HTTPS domain(s) it is approved for. It never
prints values, so it is safe to run before deciding which variable to use.
Prefer \`dsbx env\` over guessing names or dumping the environment with
\`env\` / \`printenv\` (those would just produce redacted output).

Hard rules for environment variables:

- Never print, echo, \`cat\`, log, summarize, or otherwise disclose a
  configured value. If a user asks for a secret value, refuse and say it is
  not viewable.
- Do not try to extract, decode, recover, or inspect the real value behind a
  \`DSEC_*\` placeholder. The placeholder is all your process is supposed to
  see.
- Do not transform a \`DSEC_*\` placeholder before sending it. Do not URL
  encode it, split it across fields, put it in a request body, write it to a
  file and re-read it, sign with it, or use it in HMAC/SigV4 flows. The
  exception is standard HTTP Basic auth: it is OK to let a normal HTTP
  client base64-encode \`user:$DSEC_SECRET\` or \`$DSEC_SECRET:\` into the
  \`Authorization: Basic ...\` header (the egress proxy handles that case);
  do not base64-encode the value yourself.
- Do not put a \`DSEC_*\` placeholder in a URL or query string (e.g.
  \`https://api.example.com/x?token=$DSEC_FOO\`). The egress proxy only
  substitutes in HTTP headers; placeholders on the request line are
  rejected and the connection is dropped.
- Use a \`DSEC_*\` secret only with its approved HTTPS destination. Cross-
  domain use will not substitute and the request will fail.
- Do not pass custom TLS trust settings such as Python \`verify=\`, Node
  \`ca\`, Go \`RootCAs\`/\`tls.Config\`, Rust custom root stores, Java custom
  trust managers, or \`-Djavax.net.ssl.trustStore\`. They can bypass the
  sandbox trust bundle and break TLS to substituted domains.

If a tool, CLI, or SDK expects a specific unprefixed name, re-export the
prefixed variable under the expected name in the same process before using
the tool. For example:

\`\`\`python
import os
os.environ["OPENAI_API_KEY"] = os.environ["DSEC_OPENAI_API_KEY"]
\`\`\`

Then use the SDK normally. This only aliases the placeholder; the real value
is still substituted by the egress proxy when the SDK sends HTTPS headers.

For Rust HTTP clients, prefer \`reqwest\` default features or
\`rustls-tls-native-roots\`. Do not use \`rustls-tls\` with webpki-roots for
\`DSEC_*\` traffic because it ignores the system trust store. For Java/JVM,
use the JDK that came with the sandbox image; do not install another JDK or
override the trust store mid-session. If you ignore this, the usual symptom
is a TLS error such as \`PKIX path building failed\`.

Bash tool output that contains a configured environment variable value is
post-processed and replaced with a marker like \`«redacted: $FOO»\`. If you
see such a marker in tool output, treat it as evidence that you printed a
value you should not have — apologize, do not retry the command, and do not
attempt to reconstruct, decode, or otherwise recover the value.`;
}

function buildToolDetailsSection(
  label: string,
  entries: readonly ManifestToolEntry[]
): string {
  const tools = new Map(entries.map((tool) => [tool.name, tool]));

  if (tools.size === 0) {
    return "";
  }

  const descriptions = [...tools.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => {
      const summary = tool.description.match(/^.*?\.(?=\s|$)/)?.[0];
      return `- \`${tool.name}\`: ${summary ?? tool.description}`;
    })
    .join("\n");
  return `${label} tool details:\n\n${descriptions}\n\n`;
}

async function buildSandboxInstructions(
  auth: Authenticator,
  providerId: ModelProviderIdType | undefined,
  {
    hasDsbxTools,
    hasFramesV2,
    isProject,
  }: {
    hasDsbxTools: boolean;
    hasFramesV2: boolean;
    isProject: boolean;
  }
): Promise<string> {
  const networkAccessSection = await buildNetworkAccessSection(auth);
  const environmentVariablesSection = buildEnvironmentVariablesSection();
  const filesSection = buildFilesSection({ hasPod: isProject });
  const sandboxInstructions = buildSandboxInstructionProse({
    hasDsbxTools,
    hasFramesV2,
  });

  let toolsResult;

  if (providerId) {
    toolsResult = getToolsForProvider(auth, providerId, {
      includeDsbxTools: hasDsbxTools,
    });
  } else {
    const imageResult = getSandboxImage(auth);
    if (imageResult.isErr()) {
      return `${sandboxInstructions}\n\n${filesSection}\n\n${networkAccessSection}\n\n${environmentVariablesSection}`;
    }
    toolsResult = new Ok(
      filterDsbxToolEntries(imageResult.value.tools, {
        includeDsbxTools: hasDsbxTools,
      })
    );
  }

  if (toolsResult.isErr()) {
    return `${sandboxInstructions}\n\n${filesSection}\n\n${networkAccessSection}\n\n${environmentVariablesSection}`;
  }

  const manifest = createToolManifest(toolsResult.value);
  const compactManifest = toolManifestToCompactText(manifest);
  const dustToolDetailsSection = buildToolDetailsSection(
    "Dust",
    toolsResult.value.filter((tool) => tool.isDustTool)
  );

  return `${sandboxInstructions}

${filesSection}

${networkAccessSection}

${environmentVariablesSection}

#### Sandbox Available Tools and Libraries

${compactManifest}

Versions are shown when pinned. Installing packages in the sandbox is NOT
possible. Call \`describe_toolset\` for full descriptions and usage metadata.
System tools include standard preinstalled command-line utilities and
non-standard helpers provided by Dust.

${dustToolDetailsSection}Run \`<command> --help\` for detailed modes and flags. Use ONLY the tools listed
above, NOTHING ELSE.

`;
}

export const sandboxSkill = {
  sId: "sandbox",
  kind: "global",
  name: "Computer",
  userFacingDescription:
    "Run code, scripts, and shell commands in the conversation's Computer (a sandboxed Linux environment).",
  agentFacingDescription:
    "Execute code and commands in an isolated Linux sandbox. Useful to parse lengthy tool outputs, run code, " +
    "process data, manipulate files, or perform any task requiring shell access. " +
    "You must enable this skill proactively as soon as the user uploads files or you need to work with files, " +
    "including PDFs, spreadsheets, archives, generated artifacts, or data pulled from tools. Use it to extract text " +
    "from files, parse lengthy tool outputs, run code and shell commands, process data, manipulate files, or perform " +
    "any computer-related task. " +
    "Always call this environment 'the Computer' in any text you send to the user.",
  fetchInstructions: async (
    auth: Authenticator,
    {
      agentLoopData,
    }: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData }
  ) => {
    const providerId = agentLoopData?.modelInfo.endpoint.modelConfig.providerId;
    const flags = await getFeatureFlags(auth);
    const hasDsbxTools = isComputerFeatureEnabled(flags);
    const hasFramesV2 = flags.includes("frames_v2");
    const isProject = agentLoopData?.conversation
      ? isPodConversation(agentLoopData.conversation)
      : false;

    return buildSandboxInstructions(auth, providerId, {
      hasDsbxTools,
      hasFramesV2,
      isProject,
    });
  },
  mcpServers: [{ name: "sandbox" }],
  version: 2,
  icon: "TerminalSquareIcon",
  // Auto-enabled for dust-like agents, which are heavy users of it.
  // This allows adding the bash tool eagerly, as it's used for a wide variety of use cases and deferring it would
  // increase significantly the number of tool searches ran overall.
  // Auto-equipped for every other agent unless the workspace has disabled the
  // Computer, but not enabled until the agent decides to use it.
  getAutoEnabledOrEquippedForAgentLoop: ({ agentConfiguration }) =>
    isDustLikeAgent(agentConfiguration.sId) ? "enabled" : "equipped",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !isComputerFeatureEnabled(flags);
  },
} as const satisfies GlobalSkillDefinition;
