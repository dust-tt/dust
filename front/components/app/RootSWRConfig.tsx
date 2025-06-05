import { useRouter } from "next/router";
import { SWRConfig } from "swr";

import { isAPIErrorResponse } from "@app/types";

export type RootSWRConfigProps = {
  children: React.ReactNode;
};

function localStorageProvider() {
  // When initializing, we restore the data from `localStorage` into a map.
  const map = new Map<string, any>(
    JSON.parse(localStorage.getItem("app-cache") || "[]")
  );

  // Before unloading the app, we write back all the data into `localStorage`.
  window.addEventListener("beforeunload", () => {
    const appCache = JSON.stringify(Array.from(map.entries()));
    localStorage.setItem("app-cache", appCache);
  });

  // We still use the map for write & read for performance.
  return map;
}

export function RootSWRConfig({ children }: RootSWRConfigProps) {
  const router = useRouter();

  return (
    <SWRConfig
      value={{
        // provider: () => new LocalStorageProvider(),
        provider: localStorageProvider,
        onError: async (error) => {
          if (
            isAPIErrorResponse(error) &&
            error.error.type === "not_authenticated"
          ) {
            // Redirect to login page.
            await router.push("/api/auth/login");
          }
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
