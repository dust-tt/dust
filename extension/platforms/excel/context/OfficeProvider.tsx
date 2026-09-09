import logger from "@app/logger/logger";
import React from "react";

/**
 * Live snapshot of what the user is looking at in the workbook.
 *
 * The Front plugin gets an equivalent object handed to it by the Front SDK
 * (`WebViewContext`). Office.js has no such object, so we assemble it from the
 * Excel API and refresh it whenever the selection changes.
 */
export interface OfficeWorkbookContext {
  activeWorksheetName: string | null;
  selectedRangeAddress: string | null;
  workbookName: string | null;
}

const OfficeContext = React.createContext<OfficeWorkbookContext | undefined>(
  undefined
);

export function useOfficeContext() {
  return React.useContext(OfficeContext);
}

/** The empty context used when there is no workbook to read. */
const NO_WORKBOOK: OfficeWorkbookContext = {
  activeWorksheetName: null,
  selectedRangeAddress: null,
  workbookName: null,
};

/**
 * True when the page is running inside an Office host with a live document.
 * False when the task pane is opened directly in a browser, which is the usual
 * local development setup.
 *
 * Only meaningful once Office.js has initialized: `Office.context` is undefined
 * before `Office.onReady` resolves.
 */
function isOfficeDocumentAvailable(): boolean {
  return (
    typeof Office !== "undefined" &&
    typeof Excel !== "undefined" &&
    Office.context?.document !== undefined
  );
}

async function readWorkbookContext(): Promise<OfficeWorkbookContext> {
  return Excel.run(async (context) => {
    const worksheet = context.workbook.worksheets.getActiveWorksheet();
    const selection = context.workbook.getSelectedRange();

    context.workbook.load("name");
    worksheet.load("name");
    selection.load("address");

    await context.sync();

    return {
      activeWorksheetName: worksheet.name,
      // `address` is prefixed with the sheet name (e.g. `Sheet1!A1:B4`); keep
      // it as-is so it can be fed straight back into the range tools.
      selectedRangeAddress: selection.address,
      workbookName: context.workbook.name,
    };
  });
}

/**
 * @cc [owner:Nils-Fedrigo,label:react] office-context-never-blocks-render
 * `OfficeContextProvider` always renders its children, including when Office.js
 * or the Excel API is absent and when reading the workbook fails; the provided
 * context is `undefined` until the first read settles.
 */
export const OfficeContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [context, setContext] = React.useState<
    OfficeWorkbookContext | undefined
  >(undefined);

  React.useEffect(() => {
    if (typeof Office === "undefined") {
      setContext(NO_WORKBOOK);
      return;
    }

    let isCancelled = false;

    const refresh = async () => {
      try {
        const next = await readWorkbookContext();
        if (!isCancelled) {
          setContext(next);
        }
      } catch (err) {
        // A failed read must not keep the task pane on the spinner forever:
        // fall back to an empty context so the app still renders.
        logger.error({ err }, "Failed to read Excel workbook context.");
        if (!isCancelled) {
          setContext(NO_WORKBOOK);
        }
      }
    };

    // Office hands back an opaque handler reference; removing the handler
    // requires passing the very same function, so keep it in a local.
    const onSelectionChanged = () => void refresh();
    let unsubscribe: (() => void) | undefined;

    // `Office.context` does not exist until Office.js has initialized, so the
    // host check has to happen after `onReady`. On a slow host (Excel desktop
    // loads office.js from the CDN into a WebView) checking earlier reports
    // "not in Excel" and would leave the context empty for the whole session.
    void Office.onReady().then(() => {
      if (isCancelled || !isOfficeDocumentAvailable()) {
        setContext(NO_WORKBOOK);
        return;
      }

      void refresh();

      Office.context.document.addHandlerAsync(
        Office.EventType.DocumentSelectionChanged,
        onSelectionChanged
      );
      unsubscribe = () =>
        Office.context.document.removeHandlerAsync(
          Office.EventType.DocumentSelectionChanged,
          { handler: onSelectionChanged }
        );
    });

    return () => {
      isCancelled = true;
      unsubscribe?.();
    };
  }, []);

  return (
    <OfficeContext.Provider value={context}>{children}</OfficeContext.Provider>
  );
};
