import type { UserMetadataType } from "@dust-tt/types";

import type { GetUserMetadataResponseBody } from "@app/pages/api/user/metadata/[key]";

/**
 * Client-side: retrieves a metadata value for the current user. See also `useUserMetadata` for an
 * SWR version of it. This function never errors and is best effort.
 * @param key string the key of the metadata to retrieve.
 */
export async function getUserMetadataFromClient(key: string) {
  try {
    const res = await fetch(`/api/user/metadata/${encodeURIComponent(key)}`);
    if (!res.ok) {
      const err = await res.json();
      console.error("getUserMetadata error", err);
      return null;
    }

    const json = (await res.json()) as GetUserMetadataResponseBody;
    return json.metadata;
  } catch (err) {
    console.error("getUserMetadata error", err);
    return null;
  }
}

export async function setUserMetadataFromClient(metadata: UserMetadataType) {
  const res = await fetch(
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
    throw new Error(`Error setting user metadata: ${err.message}`);
  }

  return;
}

export const guessFirstandLastNameFromFullName = (
  fullName: string
): { firstName: string; lastName: string | null } => {
  const nameParts = fullName.split(" ");

  if (nameParts.length > 1) {
    const firstName = nameParts.shift() || fullName;
    const lastName = nameParts.join(" ");
    return { firstName, lastName };
  } else {
    return { firstName: fullName, lastName: null };
  }
};
