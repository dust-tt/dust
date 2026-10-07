import { clientFetch } from "@app/lib/egress/client";
import type { APIError } from "@app/types/error";
import { isAPIErrorResponse } from "@app/types/error";
import type { UserMetadataType } from "@app/types/user";

/**
 * @cc [owner:Nils-Fedrigo,label:error-handling;react] user-metadata-error-is-api-error-response
 * `setUserMetadataFromClient` MUST throw a `UserMetadataUpdateError` when the server rejects the
 * update. Its `error` holds the server API error, so the thrown value is an `APIErrorResponse` and
 * can be passed as is to `formatError` / `useSendApiErrorNotification`.
 */
export class UserMetadataUpdateError extends Error {
  readonly error: APIError | undefined;
  constructor(body: unknown) {
    const error = isAPIErrorResponse(body) ? body.error : undefined;
    super(`Error setting user metadata: ${error?.message}`);
    this.error = error;
  }
}

export async function setUserMetadataFromClient(metadata: UserMetadataType) {
  const res = await clientFetch(
    `/api/user/metadata/${encodeURIComponent(metadata.key)}`,
    {
      method: "POST",
      body: JSON.stringify({ value: metadata.value }),
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const err = await res.json();
    console.error("setUserMetadata error", err);
    throw new UserMetadataUpdateError(err);
  }

  return;
}

export const guessFirstAndLastNameFromFullName = (
  fullName: string
): { firstName: string; lastName: string | null } => {
  const [prefixPart] = fullName.split("@"); // Ignore everything after '@'.
  const nameParts = prefixPart.split(/[\s.]+/); // Split on spaces and dots.

  const [firstName = prefixPart, ...lastName] = nameParts;

  return { firstName, lastName: lastName.join(" ") || null };
};
