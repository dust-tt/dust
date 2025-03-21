import front from "@frontapp/plugin-sdk";
import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import React from "react";

export const FrontContext = React.createContext<WebViewContext | undefined>(
  undefined
);

export function useFrontContext() {
  return React.useContext(FrontContext);
}

export const FrontContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [context, setContext] = React.useState<WebViewContext | undefined>(
    undefined
  );

  React.useEffect(() => {
    const subscription = front.contextUpdates.subscribe((frontContext) => {
      setContext(frontContext);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <FrontContext.Provider value={context}>{children}</FrontContext.Provider>
  );
};
