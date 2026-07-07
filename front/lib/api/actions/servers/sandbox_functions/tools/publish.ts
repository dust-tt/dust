import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getWritablePodContext } from "@app/lib/api/actions/servers/pod_manager/helpers";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export async function publishHandler(
  {
    description,
    path,
    slug,
  }: {
    description: string;
    path: string;
    slug: string;
  },
  { auth, toolContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getWritablePodContext(auth, {
    toolContext,
  });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const result = await publishSandboxFunction(auth, {
    space: podResult.value.pod,
    slug,
    description,
    path,
  });
  if (result.isErr()) {
    return new Err(toMCPError(result.error));
  }
  const { sandboxFunction, warnings, staleSiblings, untrackedDatabases } =
    result.value;

  const notes: { type: "text"; text: string }[] = [
    {
      type: "text",
      text: `Published sandbox function "${sandboxFunction.slug}".`,
    },
    ...warnings.map((warning): { type: "text"; text: string } => ({
      type: "text",
      text: `Warning — ${warning.message}`,
    })),
    ...staleSiblings.map((note): { type: "text"; text: string } => ({
      type: "text",
      text:
        `Note — "${note.slug}" was published against an older schema of ` +
        `${note.databases.join(", ")}. It keeps working, but republish it once its code is ` +
        `aligned with the shared schema file${note.databases.length > 1 ? "s" : ""}.`,
    })),
  ];
  if (untrackedDatabases.length > 0) {
    const plural = untrackedDatabases.length > 1;
    notes.push({
      type: "text",
      text:
        `Note — untracked database${plural ? "s" : ""} ` +
        `${untrackedDatabases.join(", ")}: no published function declares ` +
        `${plural ? "them" : "it"} anymore. The data stays untouched (nothing is ever ` +
        `dropped); declare ${plural ? "them" : "it"} again from a function to keep using ` +
        `${plural ? "them" : "it"}.`,
    });
  }

  return new Ok(notes);
}

function toMCPError(error: SandboxFunctionError): MCPError {
  switch (error.code) {
    case "invalid_path":
    case "build_failed":
    case "schema_extraction_failed":
    case "invalid_contract":
    // Compat blocks and reconcile refusals are model-correctable: the message carries the
    // (function, table.column) list and the additive migrate path.
    case "compat_blocked":
    case "reconcile_blocked":
    // Another publish holds the pod's lock; the model can simply retry.
    case "publish_conflict":
      // The model controls the path and the function source, so surface the detail to let it fix.
      return new MCPError(error.message, { tracked: false });
    case "sandbox_unavailable":
    case "reconcile_failed":
    case "internal":
      return new MCPError(error.message);
    default:
      return assertNever(error.code);
  }
}
