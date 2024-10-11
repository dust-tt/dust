import {
  Button,
  ExternalLinkIcon,
  LoginIcon,
  LogoHorizontalColorLogo,
  LogoutIcon,
  Page,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import {
  sendAuthMessage,
  sendGetTokenMessage,
  sendLogoutMessage,
} from "../lib/auth";

export const MainPage = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const response = await sendGetTokenMessage();
        if (response.success && response.token) {
          setIsLoggedIn(true);
        }
      } catch (error) {
        console.error("Error checking login status:", error);
        setError("Failed to check login status");
      } finally {
        setIsLoading(false);
      }
    };
    void checkLoginStatus();
  }, []);

  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await sendAuthMessage();
      if (response.success) {
        setIsLoggedIn(true);
      } else {
        setError(response.error || "Authentication failed");
      }
    } catch (error) {
      console.error("Error sending auth message:", error);
      setError("Failed to authenticate");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await sendLogoutMessage();
      if (response.success) {
        setIsLoggedIn(false);
      } else {
        setError(response.error || "Logout failed");
      }
    } catch (error) {
      console.error("Error sending logout message:", error);
      setError("Failed to logout");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="flex flex-col p-4 gap-2 h-screen">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2 pb-10">
          <LogoHorizontalColorLogo className="h-4 w-16" />
          <a href="https://dust.tt" target="_blank">
            <ExternalLinkIcon color="#64748B" />
          </a>
        </div>

        {isLoggedIn && (
          <Button
            icon={LogoutIcon}
            variant="tertiary"
            label="Sign out"
            onClick={handleLogout}
          />
        )}
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-2 rounded">{error}</div>
      )}

      {isLoading && (
        <div className="flex justify-center items-center w-full h-full">
          <Spinner />
        </div>
      )}

      {!isLoading && !isLoggedIn && (
        <div className="flex justify-center items-center w-full h-full">
          <Button
            icon={LoginIcon}
            variant="primary"
            label="Sign in"
            onClick={handleLogin}
          />
        </div>
      )}

      {isLoggedIn && (
        <div className="w-full h-full">
          <Page.SectionHeader title="Conversation" />
          <TextArea />
          <Button
            variant="primary"
            label="Send"
            className="mt-4"
            onClick={() => alert("Sorry, not implemented yet!")}
          />
        </div>
      )}
    </div>
  );
};
