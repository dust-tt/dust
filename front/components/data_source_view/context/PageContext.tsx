import { createContext, useContext, useMemo, useReducer } from "react";

import type { ConfigurationPagePageId } from "@app/components/agent_builder/types";
import { assertNever } from "@app/types";

type PageState = {
  currentPageId: ConfigurationPagePageId;
};

type KnowledgePageContextType = PageState & {
  /**
   * Set the current page ID for the sheet
   */
  setSheetPageId: (pageId: ConfigurationPagePageId) => void;
};

type PageActionType = {
  type: "SET_SHEET_CURRENT_PAGE";
  payload: { pageId: ConfigurationPagePageId };
};

const KnowledgePageContext = createContext<
  KnowledgePageContextType | undefined
>(undefined);

function pageReducer(
  state: PageState,
  { type, payload }: PageActionType
): PageState {
  switch (type) {
    case "SET_SHEET_CURRENT_PAGE": {
      return {
        ...state,
        currentPageId: payload.pageId,
      };
    }
    default:
      assertNever(type);
  }
}

export function KnowledgePageProvider({
  initialPageId,
  children,
}: {
  initialPageId: ConfigurationPagePageId;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(pageReducer, {
    currentPageId: initialPageId,
  });

  const setSheetPageId: KnowledgePageContextType["setSheetPageId"] = (
    pageId
  ) => {
    dispatch({ type: "SET_SHEET_CURRENT_PAGE", payload: { pageId } });
  };

  const value = useMemo(
    () => ({
      ...state,
      setSheetPageId,
    }),
    [state]
  );

  return (
    <KnowledgePageContext.Provider value={value}>
      {children}
    </KnowledgePageContext.Provider>
  );
}

export function useKnowledgePageContext() {
  const context = useContext(KnowledgePageContext);
  if (!context) {
    throw new Error(`usePageContext must be used within PageProvider`);
  }
  return context;
}
