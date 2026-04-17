export const PROFILES = ["anthropic", "openai", "gemini"] as const;

export type Profile = (typeof PROFILES)[number];

export function isProfile(value: string | undefined): value is Profile {
  return PROFILES.some((profile) => profile === value);
}

export function getProfile(rawProfile?: string): Profile {
  const candidate = rawProfile ?? process.env.DUST_PROFILE;

  if (isProfile(candidate)) {
    return candidate;
  }

  return "anthropic";
}
