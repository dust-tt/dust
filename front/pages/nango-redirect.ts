import { useEffect } from "react";

export default function NangoRedirect() {
  useEffect(() => {
  const nangoURL = `https://api.nango.dev/oauth/callback${window.location.search}`
  window.location.replace(nangoURL);
  }, []);

  return null; // Render nothing.
}
