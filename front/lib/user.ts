import type { UserMetadataType } from "@app/types";

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

export const guessFirstAndLastNameFromFullName = (
  fullName: string
): { firstName: string; lastName: string | null } => {
  const [prefixPart] = fullName.split("@"); // Ignore everything after '@'.
  const nameParts = prefixPart.split(/[\s.]+/); // Split on spaces and dots.

  const [firstName = prefixPart, ...lastName] = nameParts;

  return { firstName, lastName: lastName.join(" ") || null };
};
