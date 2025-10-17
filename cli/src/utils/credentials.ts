// Mock dustManagedCredentials for CLI usage
// This allows the front LLM implementations to work in the CLI context

export interface CredentialsType {
  MISTRAL_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_AI_STUDIO_API_KEY?: string;
  // Add other providers as needed
}

let cliCredentials: CredentialsType = {};

export function setCliCredentials(credentials: CredentialsType): void {
  cliCredentials = { ...cliCredentials, ...credentials };
}

export function dustManagedCredentials(): CredentialsType {
  return cliCredentials;
}

