import config from "@app/lib/api/config";

const PERSONA_API_BASE_URL = "https://api.withpersona.com/api/v1";

interface PersonaClient {
  baseUrl: string;
  apiKey: string;
}

let personaClientInstance: PersonaClient | null = null;

export function getPersonaClient(): PersonaClient {
  if (personaClientInstance) {
    return personaClientInstance;
  }

  personaClientInstance = {
    baseUrl: PERSONA_API_BASE_URL,
    apiKey: config.getPersonaApiKey(),
  };

  return personaClientInstance;
}
