import { useSWRConfig } from "swr";

import { GetUserMetadataResponseBody } from "@app/pages/api/user/metadata/[key]";
import { UserMetadataType } from "@app/types/user";

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

/**
 * Client-side: sets the metadata for the current user. This function is best effort, and never
 * errors.
 * @param metadata MetadataType the metadata to set for the current user.
 */
export function setUserMetadataFromClient(metadata: UserMetadataType) {
  const { mutate } = useSWRConfig();

  void (async () => {
    try {
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
      }

      // Finally mutate to kick SWR to revalidate.
      await mutate(`/api/user/metadata/${encodeURIComponent(metadata.key)}`);
    } catch (err) {
      console.error("setUserMetadata error", err);
    }
  })();
}

export const guessFirstandLastNameFromFullName = (
  fullName: string
): { firstName: string | null; lastName: string | null } => {
  if (!fullName) return { firstName: null, lastName: null };

  const nameParts = fullName.split(" ");

  if (nameParts.length === 1) return { firstName: fullName, lastName: null };

  const firstName = nameParts.shift() || null;
  const lastName = nameParts.join(" ");

  return { firstName, lastName };
};
