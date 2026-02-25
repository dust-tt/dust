interface TokenFieldLabel {
  label: string;
  placeholder: string;
  tooltip: string;
}

const SERVER_TOKEN_LABELS: Record<string, TokenFieldLabel> = {
  slab: {
    label: "Slab API Token",
    placeholder: "Paste your Slab API token",
    tooltip:
      "You can generate an API token from your Slab Settings > Developer page.",
  },
  ashby: {
    label: "Ashby API Key",
    placeholder: "Paste your Ashby API key",
    tooltip:
      "You can generate an API key from your Ashby Developer Settings under API Keys.",
  },
  front: {
    label: "Front API Token",
    placeholder: "Paste your Front API token",
    tooltip:
      "You can generate an API token from your Front settings under Developers > API tokens.",
  },
  openai_usage: {
    label: "OpenAI Admin API Key",
    placeholder: "Paste your OpenAI admin key (starts with sk-admin-)",
    tooltip:
      "This requires an Admin API key (starts with sk-admin-), not a regular API key. Generate one from the OpenAI platform under Settings > Organization > Admin Keys.",
  },
  salesloft: {
    label: "Salesloft API Key",
    placeholder: "Paste your Salesloft API key",
    tooltip:
      "You can generate an API key from your Salesloft account under Your Applications > API Keys.",
  },
  statuspage: {
    label: "Statuspage API Key",
    placeholder: "Paste your Statuspage API key",
    tooltip:
      "You can find your API key by clicking your avatar (bottom left) and selecting API info.",
  },
};

const DEFAULT_TOKEN_LABEL: TokenFieldLabel = {
  label: "API Key",
  placeholder: "Paste your API key",
  tooltip:
    "This token will be used to authenticate requests to the service on your behalf.",
};

export function getTokenFieldLabel(serverName?: string): TokenFieldLabel {
  if (serverName && serverName in SERVER_TOKEN_LABELS) {
    return SERVER_TOKEN_LABELS[serverName];
  }
  return DEFAULT_TOKEN_LABEL;
}
