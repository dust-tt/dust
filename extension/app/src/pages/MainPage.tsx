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
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sendAuthMessage } from "../lib/auth";

export const MainPage = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("authToken");
    if (storedToken) {
      setToken(storedToken);
    }
    setIsLoading(false);
  }, []);

  const handleLogin = () => {
    setIsLoading(true);
    sendAuthMessage()
      .then((response) => {
        console.log(response);
        if (response?.accessToken) {
          localStorage.setItem("authToken", response.accessToken);
          setToken(response.accessToken);
        } else {
          console.error("Authentication failed.");
        }
        localStorage.setItem("full", JSON.stringify(response));
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Error sending message:", error);
        setIsLoading(false);
      });
  };

  const handleLogout = () => {
    chrome.runtime.sendMessage({ type: "LOGOUT" }, (response) => {
      if (response?.success) {
        localStorage.removeItem("authToken");
        setToken(null);
      } else {
        console.error("Logout failed.");
      }
    });
  };

  return (
    <div className="flex flex-col p-4 gap-2 h-screen">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2 pb-10">
          <LogoHorizontalColorLogo className="h-4 w-16" />
          <a href="https://dust.tt" target="_blank">
            <ExternalLinkIcon color="#64748B" />
          </a>
        </div>

        {token && (
          <Button
            icon={LogoutIcon}
            variant="tertiary"
            label="Sign out"
            onClick={handleLogout}
          />
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center items-center w-full h-full">
          <Spinner />
        </div>
      )}

      {!isLoading && !token && (
        <div className="flex justify-center items-center w-full h-full">
          <Button
            icon={LoginIcon}
            variant="primary"
            label="Sign in"
            onClick={handleLogin}
          />
        </div>
      )}

      {token && (
        <div className="w-full h-full">
          <Page.SectionHeader title="Conversation" />
          {/* <Link to="/conversation">Conversations</Link> */}
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
