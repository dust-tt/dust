export type ProviderType = {
  providerId: string;
  config: string;
};

export type CredentialsType = {
  OPENAI_API_KEY?: string;
  COHERE_API_KEY?: string;
  AI21_API_KEY?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_ENDPOINT?: string;
  ANTHROPIC_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  TEXTSYNTH_API_KEY?: string;
  SEARCHAPI_API_KEY?: string;
  SERP_API_KEY?: string;
  SERPER_API_KEY?: string;
  BROWSERLESS_API_KEY?: string;
  GOOGLE_AI_STUDIO_API_KEY?: string;
};
