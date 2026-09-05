import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getWritablePodContext } from "@app/lib/api/actions/servers/pod_manager/helpers";
import {
  formatEgressDomainRequestsNote,
  requestEgressDomainsForScope,
} from "@app/lib/api/sandbox/egress_domain_requests";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import { shortSandboxFunctionBundleSha256 } from "@app/lib/resources/sandbox_function_resource";
import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionStake,
} from "@app/types/api/sandbox_functions";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export async function publishHandler(
  {
    defaultStake,
    description,
    domains,
    executionMode,
    path,
    slug,
  }: {
    defaultStake: SandboxFunctionStake;
    description: string;
    domains?: string[];
    executionMode: SandboxFunctionExecutionMode;
    path: string;
    slug: string;
  },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getWritablePodContext(auth, {
    toolContext: { runContext },
  });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const result = await publishSandboxFunction(auth, {
    space: podResult.value.pod,
    slug,
    description,
    path,
    executionMode,
    defaultStake,
  });
  if (result.isErr()) {
    return new Err(toMCPError(result.error));
  }

  // The slug carries the app prefix publish derived from `path`, so state it rather than letting the
  // model assume the name it passed. The other tools resolve the pod from the run context and take
  // the slug alone; only a Frame needs the qualified reference, so name that consumer.
  //
  // The mode, timestamp and bundle hash are the publisher's receipt: they let the caller confirm
  // this publish landed (list/get echo the same fields) without a second tool call.
  const { sandboxFunction, byteIdentical } = result.value;
  const { slug: publishedSlug } = sandboxFunction;

  // Failures become a note, not a publish failure — the function is already
  // published and its domains can be retried.
  const domainNote =
    domains && domains.length > 0
      ? formatEgressDomainRequestsNote(
          await requestEgressDomainsForScope(auth, {
            scope: { kind: "pod", podId: podResult.value.pod.sId },
            domains,
          })
        )
      : null;

  const lines = [
    `Published pod function "${publishedSlug}" ` +
      `(executionMode: ${sandboxFunction.executionMode}, ` +
      `updatedAt: ${sandboxFunction.updatedAt.toISOString()}, ` +
      `bundle: ${shortSandboxFunctionBundleSha256(sandboxFunction.bundleSha256)}). ` +
      `Frames call it by reference "${podResult.value.pod.sId}/${publishedSlug}".`,
  ];
  if (byteIdentical) {
    lines.push(
      "The built bundle is byte-identical to the previous publish: if this publish was meant to " +
        "change the function's behavior, your edit did not land in the built source. Re-read the " +
        "source file before editing again."
    );
  }
  if (domainNote) {
    lines.push(domainNote);
  }

  return new Ok([{ type: "text", text: lines.join("\n") }]);
}

function toMCPError(error: SandboxFunctionError): MCPError {
  switch (error.code) {
    case "invalid_path":
    case "build_failed":
    case "schema_extraction_failed":
    case "invalid_contract":
    // Another publish holds the pod's lock; the model can simply retry.
    case "publish_conflict":
    // Publish never reconciles, but the shared error union carries the db-tool codes.
    case "reconcile_blocked":
      // The model controls the path and the function source, so surface the detail to let it fix.
      return new MCPError(error.message, { tracked: false });
    // Publish never returns not_found, but the shared sandbox-function error union also serves
    // unpublish.
    case "not_found":
      return new MCPError(error.message, { tracked: false });
    case "sandbox_unavailable":
    case "reconcile_failed":
    case "internal":
      return new MCPError(error.message);
    default:
      return assertNever(error.code);
  }
}
