import { clientFetch } from "@app/lib/egress/client";
import type { UserMetadataType } from "@app/types/user";

export async function setUserMetadataFromClient(
  metadata: UserMetadataType,
  // When provided, the metadata is stored scoped to this workspace (the API route reads
  // `workspaceId` from the query string). Omit for user-global metadata.
  options?: { workspaceId?: string }
) {
  let url = `/api/user/metadata/${encodeURIComponent(metadata.key)}`;
  if (options?.workspaceId) {
    url += `?workspaceId=${encodeURIComponent(options.workspaceId)}`;
  }
  // user

  const res = await clientFetch(url, {
    method: "POST",
    body: JSON.stringify({ value: metadata.value }),
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.json();
    console.error("setUserMetadata error", err);
    throw new Error(`Error setting user metadata: ${err.message}`);
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
