import { useEffect } from "react";

export default function Complete() {
  useEffect(() => {
    // When the component mounts, send a message to the window that opened this one.
    const queryString = window.location.search
      .slice(1)
      .split("&")
      .map((p) => p.split("="))
      .reduce(
        (acc, [k, v]) => ({ ...acc, [k]: v }),
        {} as Record<string, string>
      );
    window.opener &&
      window.opener.postMessage(
        {
          type: "installed",
          installationId: queryString["installation_id"],
        },
        window.location.origin
      );
  }, []);

  return null; // Render nothing.
}
