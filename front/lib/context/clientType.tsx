import { createContext, useContext } from "react";

export type ClientType = "web" | "extension";

const ClientTypeContext = createContext<ClientType>("web");

export function useClientType(): ClientType {
  return useContext(ClientTypeContext);
}

export const ClientTypeProvider = ClientTypeContext.Provider;
