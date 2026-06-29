import { z } from "zod";
import { fromError } from "zod-validation-error";
import { authenticate, type Identity, type TokenVerifier } from "./auth";
import type { ControlPlane } from "./control-plane";
import type { ControlPlaneError, ErrorKind, Result } from "./result";

const STATUS_BY_KIND: Record<ErrorKind, number> = {
  not_found: 404,
  not_authorized: 401,
  conflict: 409,
  invalid_request: 400,
  internal: 500,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(error: ControlPlaneError): Response {
  return json(STATUS_BY_KIND[error.kind], { error: { kind: error.kind, message: error.message } });
}

// Render a control-plane Result into an HTTP response.
function respond<T>(result: Result<T>, okStatus = 200): Response {
  if (!result.ok) {
    return errorResponse(result.error);
  }
  return result.value === undefined
    ? new Response(null, { status: 204 })
    : json(okStatus, result.value);
}

const ProvisionBody = z.object({
  name: z.string(),
  scenario: z.string().optional(),
});

async function handleProvision(
  cp: ControlPlane,
  identity: Identity,
  req: Request
): Promise<Response> {
  const parsed = ProvisionBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json(400, {
      error: { kind: "invalid_request", message: fromError(parsed.error).toString() },
    });
  }
  return respond(await cp.provisionBee(identity, parsed.data), 201);
}

// Dispatch an authenticated request. Path is pre-split into segments.
async function dispatch(
  cp: ControlPlane,
  identity: Identity,
  method: string,
  segments: string[],
  req: Request
): Promise<Response> {
  const [root, id, sub] = segments;
  if (root !== "bees") {
    return json(404, { error: { kind: "not_found", message: "Unknown route" } });
  }

  if (!id) {
    if (method === "GET") return respond(await cp.listBees(identity));
    if (method === "POST") return handleProvision(cp, identity, req);
    return json(405, { error: { kind: "invalid_request", message: "Method not allowed" } });
  }

  if (!sub) {
    if (method === "GET") return respond(await cp.getBee(identity, id));
    if (method === "DELETE") return respond(await cp.reclaim(identity, id));
    return json(405, { error: { kind: "invalid_request", message: "Method not allowed" } });
  }

  if (sub === "connect" && method === "POST") return respond(await cp.connect(identity, id));
  if (sub === "ready" && method === "GET") return respond(await cp.ready(identity, id));
  return json(404, { error: { kind: "not_found", message: "Unknown route" } });
}

// Mandatory auth on every request, then ownership-checked dispatch.
export async function handleRequest(
  cp: ControlPlane,
  verifier: TokenVerifier,
  req: Request
): Promise<Response> {
  const auth = await authenticate(req, verifier);
  if (!auth.ok) {
    return errorResponse(auth.error);
  }
  const segments = new URL(req.url).pathname.split("/").filter((s) => s.length > 0);
  return dispatch(cp, auth.value, req.method, segments, req);
}
