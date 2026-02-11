import type { DustAPI } from "@dust-tt/client";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import React, { useState, useCallback, useEffect } from "react";

import { getDustClient, resetDustClient } from "../utils/dustClient.js";
import AuthService from "../utils/authService.js";
import TokenStorage from "../utils/tokenStorage.js";
import { Auth } from "./Auth.js";
import { Chat } from "./Chat.js";
import { WorkspaceSelector } from "./WorkspaceSelector.js";

type AppState = "checking" | "auth" | "select_workspace" | "ready" | "error";

interface AppProps {
  cwd: string;
  initialPrompt?: string;
  apiKey?: string;
  wId?: string;
}

export function App({ cwd, initialPrompt, apiKey, wId }: AppProps) {
  const [state, setState] = useState<AppState>("checking");
  const [dustClient, setDustClient] = useState<DustAPI | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initializeClient = useCallback(async () => {
    // Check if we have a real workspace selected (not "me").
    const workspaceId = await TokenStorage.getWorkspaceId();
    if (!workspaceId || workspaceId === "me") {
      setState("select_workspace");
      return;
    }

    // Reset to pick up the workspace ID.
    resetDustClient();

    const clientRes = await getDustClient();
    if (clientRes.isErr()) {
      setError(clientRes.error.message);
      setState("error");
      return;
    }

    const client = clientRes.value;
    if (!client) {
      setState("auth");
      return;
    }

    setDustClient(client);
    setState("ready");
  }, []);

  useEffect(() => {
    (async () => {
      const isAuth = await AuthService.isAuthenticated();
      if (isAuth) {
        await initializeClient();
      } else {
        setState("auth");
      }
    })();
  }, [initializeClient]);

  const handleAuthComplete = useCallback(async () => {
    await initializeClient();
  }, [initializeClient]);

  const handleWorkspaceSelected = useCallback(async () => {
    resetDustClient();
    const clientRes = await getDustClient();
    if (clientRes.isErr()) {
      setError(clientRes.error.message);
      setState("error");
      return;
    }

    const client = clientRes.value;
    if (!client) {
      setError("Failed to initialize client after workspace selection.");
      setState("error");
      return;
    }

    setDustClient(client);
    setState("ready");
  }, []);

  if (state === "checking") {
    return (
      <Box>
        <Text color="green"><Spinner type="dots" /></Text>
        <Text> Starting Dust Coding CLI...</Text>
      </Box>
    );
  }

  if (state === "auth") {
    return <Auth onComplete={handleAuthComplete} apiKey={apiKey} wId={wId} />;
  }

  if (state === "select_workspace") {
    return <WorkspaceSelector onComplete={handleWorkspaceSelected} />;
  }

  if (state === "error" || !dustClient) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error ?? "Failed to initialize."}</Text>
        <Text>Try running again or check your authentication.</Text>
      </Box>
    );
  }

  return <Chat dustClient={dustClient} cwd={cwd} initialPrompt={initialPrompt} />;
}
