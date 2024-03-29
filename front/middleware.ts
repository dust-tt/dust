import type { Claims } from "@auth0/nextjs-auth0/edge";
import {
  getSession,
  withMiddlewareAuthRequired,
} from "@auth0/nextjs-auth0/edge";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Middleware currently only supports the Edge runtime. The Node.js runtime can not be used.
 * This file should not have any dependencies.
 */

const DUST_INTERNAL_EMAIL_REGEXP = /^[^@]+@dust.tt$/;
const { AUTH0_CLAIM_NAMESPACE } = process.env;

function hasPokeAccessClaim(user: Claims) {
  const pokeAccessClaim = `${AUTH0_CLAIM_NAMESPACE}authorization.has_poke_access`;

  return user[pokeAccessClaim] || false;
}

/**
 * Accessing Poke requires Authorization Claim and internal email address.
 */
async function handlePokeAuthRequirements(req: NextRequest, res: NextResponse) {
  const session = await getSession(req, res);

  if (session && session.user) {
    const { email } = session.user;

    if (
      DUST_INTERNAL_EMAIL_REGEXP.test(email) &&
      hasPokeAccessClaim(session.user)
    ) {
      return res;
    }
  }

  // Redirect to the landing page.
  return NextResponse.redirect(new URL("/", req.url));
}

export default withMiddlewareAuthRequired(async (req: NextRequest) => {
  const res = NextResponse.next();

  // Gate poke pages and API endpoints.
  if (req.nextUrl.pathname.startsWith("/poke")) {
    return handlePokeAuthRequirements(req, res);
  }

  return res;
});

export const config = {
  // Run the middleware for all Poke pages / endpoints.
  matcher: "/poke/:path*",
};
