import React, { FC, useEffect, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import fetch from "node-fetch";
import open from "open";
import { jwtDecode } from "jwt-decode";
import TokenStorage from "../../utils/tokenStorage.js";
import { getDustClient, resetDustClient } from "../../utils/dustClient.js";
import WorkspaceSelector from "../components/WorkspaceSelector.js";
import { ExtendedUserType } from "../../types.js";

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

interface AuthProps {
  force?: boolean;
}

const Auth: FC<AuthProps> = ({ force = false }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);
  const [authComplete, setAuthComplete] = useState(false);
  const [userInfo, setUserInfo] = useState<ExtendedUserType | null>(null);

  const auth0Domain = process.env.AUTH0_CLIENT_DOMAIN || "";
  const clientId = process.env.AUTH0_CLIENT_ID || "";
  const audience = process.env.DUST_API_AUDIENCE || "";
  const scope = "openid profile email offline_access read:user_profile";

  const startDeviceFlow = async () => {
    try {
      // First check if we already have valid tokens, skip this if force flag is true
      if (!force) {
        const hasValidToken = await TokenStorage.hasValidAccessToken();
        if (hasValidToken) {
          const accessToken = await TokenStorage.getAccessToken();
          const refreshToken = await TokenStorage.getRefreshToken();

          if (accessToken && refreshToken) {
            setIsLoading(false);
            setShowWorkspaceSelector(true);
            return;
          }
        }
      }

      // If force is true, clear any existing tokens first
      if (force) {
        await TokenStorage.clearTokens();
        resetDustClient();
      }

      setIsLoading(true);

      const response = await fetch(`https://${auth0Domain}/oauth/device/code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          audience,
          scope,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to start device flow: ${errorData}`);
      }

      const data = (await response.json()) as DeviceCodeResponse;
      setDeviceCode(data);
      setIsLoading(false);

      // Open the verification URI in the user's browser
      await open(data.verification_uri_complete);

      // Start polling for the token
      startPolling(data);
    } catch (err) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const startPolling = (deviceCodeData: DeviceCodeResponse) => {
    setIsPolling(true);

    const pollInterval = deviceCodeData.interval;
    const expiresIn = deviceCodeData.expires_in;
    const maxAttempts = Math.floor(expiresIn / pollInterval);

    let attempts = 0;

    const pollForToken = async () => {
      if (attempts >= maxAttempts) {
        setIsPolling(false);
        setError("Authentication timed out. Please try again.");
        return;
      }

      try {
        const response = await fetch(`https://${auth0Domain}/oauth/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: deviceCodeData.device_code,
            client_id: clientId,
          }),
        });

        const data = (await response.json()) as
          | TokenResponse
          | TokenErrorResponse;

        if ("error" in data) {
          if (data.error === "authorization_pending") {
            attempts++;
            setTimeout(pollForToken, pollInterval * 1000);
          } else if (data.error === "slow_down") {
            attempts++;
            setTimeout(pollForToken, (pollInterval + 5) * 1000);
          } else {
            // An actual error occurred
            setIsPolling(false);
            setError(
              `Authentication error: ${data.error_description || data.error}`
            );
          }
        } else {
          // Store tokens in secure storage
          await TokenStorage.saveTokens(data.access_token, data.refresh_token);

          resetDustClient();

          setIsPolling(false);

          setShowWorkspaceSelector(true);
        }
      } catch (err) {
        setIsPolling(false);
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    setTimeout(pollForToken, pollInterval * 1000);
  };

  const handleWorkspaceSelectionComplete = async () => {
    try {
      setShowWorkspaceSelector(false);
      // Get user info
      const dustClient = await getDustClient();
      if (!dustClient) {
        throw new Error("Failed to get Dust client");
      }
      const userInfoRes = await dustClient.me();
      if (!userInfoRes.isOk()) {
        throw new Error("Failed to get user info");
      }
      setUserInfo(userInfoRes.value);
      setAuthComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    startDeviceFlow();
  }, []);

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
        <Text color="green">
          <Spinner type="dots" />
        </Text>
        <Text> Initializing authentication...</Text>
      </Box>
    );
  }

  if (isPolling && deviceCode) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          <Text> Waiting for you to authorize...</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Please enter code: </Text>
          <Text color="yellow" bold>
            {deviceCode.user_code}
          </Text>
        </Box>
        <Box>
          <Text>at </Text>
          <Text color="cyan" underline>
            {deviceCode.verification_uri}
          </Text>
        </Box>
        <Text>The page should have opened automatically in your browser.</Text>
      </Box>
    );
  }

  if (showWorkspaceSelector) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color="green">✓ Successfully authenticated!</Text>
        </Box>
        <WorkspaceSelector onComplete={handleWorkspaceSelectionComplete} />
      </Box>
    );
  }

  if (authComplete) {
    return (
      <Box flexDirection="column">
        <Text color="green">
          ✓ Authentication and workspace selection complete!
        </Text>
        <Box marginTop={1}>
          <Text>Logged in as: </Text>
          <Text bold>{userInfo?.email}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Text>Initializing authentication...</Text>
    </Box>
  );
};

export default Auth;
