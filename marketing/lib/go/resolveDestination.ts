import config from "@marketing/lib/api/config";
import {
  fetchAuthContext,
  hasWorkosSessionCookie,
} from "@marketing/lib/api/authContext";
import { getConversationDraftBySlug } from "@marketing/lib/contentful/client";
import logger from "@marketing/logger/logger";

export type GoDestinationResult =
  | { kind: "redirect"; destination: string }
  | { kind: "not_found" }
  | { kind: "error" };

function buildLoginRedirect(slug: string): string {
  const returnTo = encodeURIComponent(`/go/${slug}`);
  return `${config.getApiBaseUrl()}/api/workos/login?returnTo=${returnTo}`;
}

export async function resolveGoDestination(
  slug: string,
  cookieHeader: string
): Promise<GoDestinationResult> {
  const templateResult = await getConversationDraftBySlug(slug);
  if (templateResult.isErr()) {
    logger.error(
      { slug, error: templateResult.error },
      "Failed to fetch conversation draft"
    );
    return { kind: "error" };
  }

  const template = templateResult.value;
  if (!template) {
    return { kind: "not_found" };
  }

  const authContext = hasWorkosSessionCookie(cookieHeader)
    ? await fetchAuthContext(cookieHeader, {
        failureLogMessage: "auth-context lookup failed during /go resolve",
      })
    : null;

  if (authContext?.defaultWorkspaceId) {
    return {
      kind: "redirect",
      destination: `${config.getAppUrl()}/w/${authContext.defaultWorkspaceId}/conversation/new?go=${encodeURIComponent(slug)}`,
    };
  }

  return {
    kind: "redirect",
    destination: buildLoginRedirect(slug),
  };
}
