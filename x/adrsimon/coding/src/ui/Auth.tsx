import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { jwtDecode } from "jwt-decode";
import fetch from "node-fetch";
import open from "open";
import React, { useCallback, useEffect, useState } from "react";

import { resetDustClient } from "../utils/dustClient.js";
import { normalizeError } from "../utils/errors.js";
import TokenStorage from "../utils/tokenStorage.js";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

interface TokenErrorResponse {
  error: string;
  error_description?: string;
}

interface DecodedAccessToken {
  exp: number;
  [key: string]: unknown;
}

interface AuthProps {
  onComplete: () => void;
  apiKey?: string;
  wId?: string;
}

export function Auth({ onComplete, apiKey, wId }: AuthProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const effectiveApiKey = apiKey || process.env.DUST_API_KEY;
  const effectiveWId = wId || process.env.DUST_WORKSPACE_ID;

  const workOSDomain = process.env.WORKOS_DOMAIN || "";
  const clientId = process.env.WORKOS_CLIENT_ID || "";

  const startPolling = useCallback(
    (deviceCodeData: DeviceCodeResponse) => {
      setIsPolling(true);

      const pollIntervalSeconds = deviceCodeData.interval;
      const expiresInSeconds = deviceCodeData.expires_in;
      const maxAttempts = Math.floor(expiresInSeconds / pollIntervalSeconds);

      let attempts = 0;

      const pollForToken = async () => {
        if (attempts >= maxAttempts) {
          setIsPolling(false);
          setError("Authentication timed out. Please try again.");
          return;
        }

        try {
          const response = await fetch(
            `https://${workOSDomain}/user_management/authenticate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code: deviceCodeData.device_code,
                client_id: clientId,
              }),
            }
          );

          const data = (await response.json()) as TokenResponse | TokenErrorResponse;

          if ("error" in data) {
            if (data.error === "authorization_pending") {
              attempts++;
              setTimeout(pollForToken, pollIntervalSeconds * 1000);
            } else if (data.error === "slow_down") {
              attempts++;
              setTimeout(pollForToken, (pollIntervalSeconds + 5) * 1000);
            } else {
              setIsPolling(false);
              setError(`Authentication error: ${data.error_description || data.error}`);
            }
          } else {
            await TokenStorage.saveTokens(data.access_token, data.refresh_token);

            try {
              const decodedToken = jwtDecode<DecodedAccessToken>(data.access_token);
              const claimNamespace = process.env.WORKOS_CLAIM_NAMESPACE || "";
              const regionClaimName = `${claimNamespace}region`;
              const region = decodedToken[regionClaimName] as string | undefined;
              await TokenStorage.saveRegion(region ?? "us-central1");
            } catch {
              await TokenStorage.saveRegion("us-central1");
            }

            resetDustClient();
            setIsPolling(false);
            onComplete();
          }
        } catch (err) {
          setIsPolling(false);
          setError(normalizeError(err).message);
        }
      };

      setTimeout(pollForToken, pollIntervalSeconds * 1000);
    },
    [clientId, workOSDomain, onComplete]
  );

  const startDeviceFlow = useCallback(async () => {
    const hasValidToken = await TokenStorage.hasValidAccessToken();
    if (hasValidToken.isOk() && hasValidToken.value) {
      setIsLoading(false);
      onComplete();
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `https://${workOSDomain}/user_management/authorize/device`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: clientId, scope: "openid profile email" }),
        }
      );

      if (!response.ok) {
        setError("Failed to start device authorization flow.");
        return;
      }

      const data = (await response.json()) as DeviceCodeResponse;
      setDeviceCode(data);
      setIsLoading(false);

      await open(data.verification_uri_complete);
      startPolling(data);
    } catch (err) {
      setError(normalizeError(err).message);
    }
  }, [clientId, workOSDomain, startPolling, onComplete]);

  const handleHeadlessAuth = useCallback(async () => {
    if (!effectiveApiKey || !effectiveWId) {
      return;
    }

    setIsLoading(true);
    try {
      await TokenStorage.saveTokens(effectiveApiKey, effectiveApiKey);
      await TokenStorage.saveWorkspaceId(effectiveWId);
      await TokenStorage.saveRegion("us-central1");
      resetDustClient();
      setIsLoading(false);
      onComplete();
    } catch (err) {
      setError(normalizeError(err).message);
      setIsLoading(false);
    }
  }, [effectiveApiKey, effectiveWId, onComplete]);

  useEffect(() => {
    if (effectiveApiKey && effectiveWId) {
      void handleHeadlessAuth();
    } else {
      void startDeviceFlow();
    }
  }, [effectiveApiKey, effectiveWId, handleHeadlessAuth, startDeviceFlow]);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box>
        <Text color="green"><Spinner type="dots" /></Text>
        <Text> Initializing authentication...</Text>
      </Box>
    );
  }

  if (isPolling && deviceCode) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="green"><Spinner type="dots" /></Text>
          <Text> Waiting for you to authorize...</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Please enter code: </Text>
          <Text color="yellow" bold>{deviceCode.user_code}</Text>
        </Box>
        <Box>
          <Text>at </Text>
          <Text color="cyan" underline>{deviceCode.verification_uri}</Text>
        </Box>
        <Text>The page should have opened automatically in your browser.</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text>Initializing...</Text>
    </Box>
  );
}
