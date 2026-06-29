import { Err, notAuthorized, Ok, type Result } from "./result";

// The authenticated caller. Bee ownership is keyed on `id`.
export interface Identity {
  id: string;
  email?: string;
}

// Mandatory client auth is the foundation everything else rests on (design
// §Security baseline): the control plane mints session/GitHub/agent tokens and
// must never act for an unauthenticated caller. The verifier is injected so
// the real WorkOS/OIDC implementation can replace the dev one without touching
// the request path.
export interface TokenVerifier {
  verify(token: string): Promise<Identity | null>;
}

// Dev/test verifier: a fixed token→identity map. NOT for production — a real
// deployment must inject a WorkOS/OIDC verifier instead.
export class StaticTokenVerifier implements TokenVerifier {
  constructor(private readonly tokens: ReadonlyMap<string, Identity>) {}

  verify(token: string): Promise<Identity | null> {
    return Promise.resolve(this.tokens.get(token) ?? null);
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function authenticate(
  req: Request,
  verifier: TokenVerifier
): Promise<Result<Identity>> {
  const token = bearerToken(req);
  if (!token) {
    return Err(notAuthorized("Missing or malformed Authorization bearer token"));
  }
  const identity = await verifier.verify(token);
  if (!identity) {
    return Err(notAuthorized("Invalid client credentials"));
  }
  return Ok(identity);
}
