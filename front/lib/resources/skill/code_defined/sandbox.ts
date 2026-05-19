import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/lib/api/files/mount_path";
import { readWorkspacePolicy } from "@app/lib/api/sandbox/egress_policy";
import {
  createToolManifest,
  filterDsbxToolEntries,
  getSandboxImage,
  getToolsForProvider,
  toolManifestToYAML,
} from "@app/lib/api/sandbox/image";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { SystemSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import logger from "@app/logger/logger";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { isProjectConversation } from "@app/types/assistant/conversation";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { Ok } from "@app/types/shared/result";

function buildSandboxInstructionProse({
  hasDsbxTools,
}: {
  hasDsbxTools: boolean;
}): string {
  const instructions = [
    "The sandbox provides an isolated Linux environment for running code, scripts, and shell commands.",
    "Use `bash` to run commands and scripts.",
    "The sandbox persists for the conversation duration.",
  ];

  if (hasDsbxTools) {
    instructions.push(
      "You can use the `dsbx` command line tool to list and run tools programmatically in the sandbox.",
      "Use it with `dsbx tools [SERVER_NAME] [TOOL_NAME] [ARGS]...`. Run `dsbx tools --help` for more information."
    );
  }

  return instructions.join(" ");
}

function buildConversationFilesSection(): string {
  return `#### Sandbox Conversation File System

The conversation file system is mounted read-write inside the sandbox at
\`/files/conversation\`. This is the canonical surface for navigating,
inspecting, and producing conversation files — strongly prefer it over the
\`files\` MCP server when the sandbox is available.

Layout:

- \`/files/conversation/\` — files uploaded by the user and files you write
  for the user (scripts, exports, reports, charts). Anything you write here
  is delivered to the user as a conversation file. Put deliverables
  directly in this directory; do not write your own files into
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
plus \`jq\` / \`rg\` (see the available tools manifest below). This is
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

function buildProjectFilesSection(): string {
  return `#### Sandbox Project File System

This conversation belongs to a Pod, so the Pod's file system is also
mounted read-write inside the sandbox at \`/files/project\`. These files are
shared across every conversation in the same Pod and **persist beyond
this conversation** — anything you write or delete here is visible to other
conversations in the same Pod.

Use this surface for files that belong to the Pod as a whole (specs,
knowledge bases, shared scripts, recurring data sets), and use
\`/files/conversation\` for ephemeral or per-conversation artifacts. When
both are relevant, prefer reading from \`/files/project\` and writing
deliverables to \`/files/conversation\` unless the user has asked you to
update the Pod's files specifically.

The same files are also exposed by the \`files\` MCP server under scoped
paths like \`project/<rel>\`. Sandbox writes and MCP writes are two views on
the same underlying storage.`;
}

function formatWorkspaceAllowlist(domains: string[]): string {
  if (domains.length === 0) {
    return "_(none — this workspace has no preapproved domains)_";
  }
  return domains.map((d) => `- \`${d}\``).join("\n");
}

async function buildNetworkAccessSection(auth: Authenticator): Promise<string> {
  const flags = await getFeatureFlags(auth);
  const hasWorkspaceAdmin = flags.includes("sandbox_workspace_admin");
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

If a request is blocked, the bash tool output will include a
\`<network_proxy_logs>\` block listing the denied domain(s). Surface that
information to the user so they can decide whether to ask their admin to
allowlist it; do not retry without changes.`;
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

If a request does get blocked — for example because you missed a domain or
a redirect chain hits an unexpected host — the bash tool output will
include a \`<network_proxy_logs>\` block listing the denied domain(s).
Use that block to identify the missing domain and call
\`add_egress_domain\` to unblock the next attempt. If a request mysteriously
hangs or fails with TLS/DNS errors, check the \`<network_proxy_logs>\`
block first; a denied egress is a possible cause.`;
}

function buildEnvironmentVariablesSection(): string {
  return `#### Sandbox Environment Variables

The sandbox may have workspace-configured environment variables available
in the bash shell and to any code you run. All workspace-configured names
are prefixed with \`DST_\` (e.g. \`DST_API_TOKEN\`, \`DST_SERVICE_KEY\`).
If a tool, CLI, or SDK expects a specific unprefixed name, you must read
the \`DST_\`-prefixed variable and re-export it under the expected name
yourself before invoking the tool — for example
\`SOMETOOL_TOKEN=\$DST_SOMETOOL_TOKEN some-cli ...\`. You may use these
variables to authenticate with APIs or pass them into code paths that
consume them, but you must never print, echo, \`cat\`, or otherwise
disclose an environment variable value. Do not include a value in output,
logs, error messages, or final answers. Do not re-encode, transform, or
split a value to bypass this rule. Do not list available environment
variable names just to enumerate what is configured.

If a user asks for a secret value, refuse and say it is not viewable. If you
need to confirm a variable is set, check whether it is non-empty without
printing its content (e.g. \`[ -n "\$DST_FOO" ]\` in bash) — do not read or
print the value.

Bash tool output that contains a configured environment variable value is
post-processed and replaced with a marker like \`«redacted: $FOO»\`. If you
see such a marker in tool output, treat it as evidence that you printed a
value you should not have — apologize, do not retry the command, and do not
attempt to reconstruct, decode, or otherwise recover the value.`;
}

async function buildSandboxInstructions(
  auth: Authenticator,
  providerId: ModelProviderIdType | undefined,
  { hasDsbxTools, isProject }: { hasDsbxTools: boolean; isProject: boolean }
): Promise<string> {
  const networkAccessSection = await buildNetworkAccessSection(auth);
  const environmentVariablesSection = buildEnvironmentVariablesSection();
  const conversationFilesSection = buildConversationFilesSection();
  const projectFilesSection = isProject ? buildProjectFilesSection() : null;
  const sandboxInstructions = buildSandboxInstructionProse({ hasDsbxTools });

  let toolsResult;

  const filesSections = [conversationFilesSection, projectFilesSection]
    .filter((s): s is string => s !== null)
    .join("\n\n");

  if (providerId) {
    toolsResult = getToolsForProvider(auth, providerId, {
      includeDsbxTools: hasDsbxTools,
    });
  } else {
    const imageResult = getSandboxImage(auth);
    if (imageResult.isErr()) {
      return `${sandboxInstructions}\n\n${filesSections}\n\n${networkAccessSection}\n\n${environmentVariablesSection}`;
    }
    toolsResult = new Ok(
      filterDsbxToolEntries(imageResult.value.tools, {
        includeDsbxTools: hasDsbxTools,
      })
    );
  }

  if (toolsResult.isErr()) {
    return `${sandboxInstructions}\n\n${filesSections}\n\n${networkAccessSection}\n\n${environmentVariablesSection}`;
  }

  const manifest = createToolManifest(toolsResult.value);
  const manifestYaml = toolManifestToYAML(manifest);

  return `${sandboxInstructions}

${filesSections}

${networkAccessSection}

${environmentVariablesSection}

#### Sandbox Available Tools and Libraries

The following tools and libraries are pre-installed in the sandbox environment.
Installing packages in the sandbox is NOT possible.
CRITICAL: Use ONLY the sandbox tools listed below, NOTHING ELSE.

\`\`\`yaml
${manifestYaml}
\`\`\`

`;
}

export const sandboxSkill = {
  sId: "sandbox",
  name: "Sandbox",
  userFacingDescription:
    "Run code, scripts, and shell commands in an isolated Linux environment.",
  agentFacingDescription:
    "Execute code and commands in an isolated Linux sandbox. Useful to parse lengthy tool outputs, run code, " +
    "process data, install packages, manipulate files, or perform any task requiring shell access.",
  fetchInstructions: async (
    auth: Authenticator,
    {
      agentLoopData,
    }: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData }
  ) => {
    const providerId = agentLoopData?.agentConfiguration?.model.providerId;
    const flags = await getFeatureFlags(auth);
    const hasDsbxTools = flags.includes("sandbox_dsbx_tools");
    const isProject = agentLoopData?.conversation
      ? isProjectConversation(agentLoopData.conversation)
      : false;

    return buildSandboxInstructions(auth, providerId, {
      hasDsbxTools,
      isProject,
    });
  },
  mcpServers: [{ name: "sandbox" }],
  version: 1,
  icon: "CommandLineIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);

    return !flags.includes("sandbox_tools");
  },
} as const satisfies SystemSkillDefinition;
