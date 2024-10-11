import { useCallback, useEffect, useState } from "react";

import { sendAuthMessage, sentLogoutMessage } from "../lib/auth";
import {
  clearAccessToken,
  getAccessToken,
  saveAccessToken,
} from "../lib/utils";

export const useAuth = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await getAccessToken();
        if (storedToken && typeof storedToken === "string") {
          setToken(storedToken);
        }
      } catch (error) {
        console.error("Error retrieving token:", error);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchToken();
  }, []);

  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sendAuthMessage();
      if (response?.accessToken) {
        await saveAccessToken(response.accessToken);
        setToken(response.accessToken);
      } else {
        console.error("Authentication failed.");
      }
    } catch (error) {
      console.error("Error sending auth message:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sentLogoutMessage();
      if (response?.success) {
        await clearAccessToken();
        setToken(null);
      } else {
        console.error("Logout failed.");
      }
    } catch (error) {
      console.error("Error sending logout message:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { token, isLoading, handleLogin, handleLogout };
};
