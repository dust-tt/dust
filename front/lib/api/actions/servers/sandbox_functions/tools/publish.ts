import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getWritablePodContext } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { requestOwnerPolicyDomain } from "@app/lib/api/sandbox/egress_policy";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import type { Authenticator } from "@app/lib/auth";
import { shortSandboxFunctionBundleSha256 } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionStake,
} from "@app/types/api/sandbox_functions";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export async function publishHandler(
  {
    confirmFast,
    defaultStake,
    description,
    domains,
    executionMode,
    path,
    slug,
  }: {
    confirmFast?: boolean;
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
    confirmFast,
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
  const { sandboxFunction, byteIdentical, warnings } = result.value;
  const { slug: publishedSlug } = sandboxFunction;

  // Failures become a note, not a publish failure — the function is already
  // published and its domains can be retried.
  const domainNote = await routePublishedFunctionDomains(auth, {
    pod: podResult.value.pod,
    domains: domains ?? [],
  });

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
  // Advisory only: the function is published either way (the lint heuristics have false
  // positives, and a publish must never be lost to one).
  lines.push(...warnings);
  if (domainNote) {
    lines.push(domainNote);
  }

  return new Ok([{ type: "text", text: lines.join("\n") }]);
}

// Files each declared domain as a Pod request. Bounded to one function's
// domains, so the sequential per-domain writes are fine.
async function routePublishedFunctionDomains(
  auth: Authenticator,
  { pod, domains }: { pod: SpaceResource; domains: string[] }
): Promise<string | null> {
  if (domains.length === 0) {
    return null;
  }

  const requested: string[] = [];
  const alreadyAllowed: string[] = [];
  const failed: string[] = [];

  for (const domain of domains) {
    const result = await requestOwnerPolicyDomain(auth, {
      ownerId: pod.sId,
      domain,
    });
    if (result.isErr()) {
      failed.push(domain);
    } else if (result.value.outcome === "already_allowed") {
      alreadyAllowed.push(domain);
    } else {
      // "requested" or "already_requested": pending an admin's review.
      requested.push(domain);
    }
  }

  const parts: string[] = [];
  if (requested.length > 0) {
    parts.push(
      `Requested for the Pod (pending admin approval): ${requested.join(", ")}.`
    );
  }
  if (alreadyAllowed.length > 0) {
    parts.push(`Already allowed: ${alreadyAllowed.join(", ")}.`);
  }
  if (failed.length > 0) {
    parts.push(
      `Could not process (retry with request_egress_domain): ${failed.join(", ")}.`
    );
  }
  return parts.join(" ");
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
