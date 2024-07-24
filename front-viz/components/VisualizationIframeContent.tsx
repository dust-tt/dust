"use client";

import { Button, Collapsible, ContentMessage, Spinner } from "@dust-tt/sparkle";
import {
  VisualizationRPCCommand,
  VisualizationRPCRequest,
} from "@dust-tt/types";
import * as papaparseAll from "papaparse";
import * as reactAll from "react";
import React, { useCallback } from "react";
import { useEffect, useMemo, useState } from "react";
import { importCode, Runner } from "react-runner";
import {} from "react-runner";
import * as rechartsAll from "recharts";

function isFileResult(res: unknown): res is { file: File } {
  return (
    typeof res === "object" &&
    res !== null &&
    "file" in res &&
    res.file instanceof File
  );
}

// This is a hook provided to the code generator model to fetch a file from the conversation.
function useFile(actionId: string, fileId: string) {
  const [file, setFile] = useState<File | null>(null);
  const actionIdParsed = useMemo(() => parseInt(actionId, 10), [actionId]);

  useEffect(() => {
    if (!fileId) {
      return;
    }

    const getFileContent = async () => {
      const getFile = makeIframeMessagePassingFunction<
        { fileId: string },
        { code: string }
      >("getFile", actionIdParsed);

      const res = await getFile({ fileId });
      if (!isFileResult(res)) {
        return;
      }

      const { file } = res;

      setFile(file);
    };

    getFileContent();
  }, [actionIdParsed, fileId]);

  return file;
}

// This function creates a function that sends a command to the host window with templated Input and Output types.
function makeIframeMessagePassingFunction<Params, Answer>(
  methodName: VisualizationRPCCommand,
  actionId: number
) {
  return (params?: Params) => {
    return new Promise<Answer>((resolve, reject) => {
      const messageUniqueId = Math.random().toString();
      const listener = (event: MessageEvent) => {
        if (event.data.messageUniqueId === messageUniqueId) {
          if (event.data.error) {
            reject(event.data.error);
          } else {
            resolve(event.data.result);
          }
          window.removeEventListener("message", listener);
        }
      };
      window.addEventListener("message", listener);
      window.top?.postMessage(
        {
          command: methodName,
          messageUniqueId,
          actionId,
          params,
        } satisfies VisualizationRPCRequest,
        "*"
      );
    });
  };
}

// This component renders the generated code.
// It gets the generated code via message passing to the host window.
export function VisualizationIframe({ actionId }: { actionId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [errored, setErrored] = useState<Error | null>(null);
  const useFileWorkspaceWrapped = (fileId: string) => useFile(actionId, fileId);

  useEffect(() => {
    // Get the code to execute.
    const getCodeToExecute = makeIframeMessagePassingFunction<
      { actionId: string },
      { code: string }
    >("getCodeToExecute", parseInt(actionId, 10));

    const fetchCode = async () => {
      try {
        const result = await getCodeToExecute({ actionId });
        const regex = /<visualization[^>]*>\s*([\s\S]*?)\s*<\/visualization>/;
        let extractedCode: string | null = null;
        const match = result.code.match(regex);
        if (match && match[1]) {
          extractedCode = match[1];
          setCode(extractedCode);
        } else {
          setErrored(new Error("No visualization code found"));
        }
      } catch (error) {
        console.error(error);
      }
    };

    fetchCode();
  }, [actionId]);

  // This retry function sends the "retry" instruction to the host window, to retry an agent message
  // in case the generated code does not work or is not satisfying.
  const retry = useMemo(() => {
    return makeIframeMessagePassingFunction("retry", parseInt(actionId, 10));
  }, [actionId]);

  if (errored) {
    return <VisualizationError error={errored} retry={() => retry()} />;
  }

  if (!code) {
    return <Spinner variant="color" size="xxl" />;
  }

  const generatedCodeScope = {
    recharts: rechartsAll,
    react: reactAll,
    papaparse: papaparseAll,
    "@dust/react-hooks": { useFile: useFileWorkspaceWrapped },
  };

  const scope = {
    import: {
      recharts: rechartsAll,
      react: reactAll,
      // Here we expose the code generated as a module to be imported by the wrapper code below.
      "@dust/generated-code": importCode(code, { import: generatedCodeScope }),
    },
  };

  // This code imports and renders the generated code.
  const wrapperCode = `
    () => {
    import Comp from '@dust/generated-code';

    return (<Comp />);
    }
  `;

  return (
    <Runner
      code={wrapperCode}
      scope={scope}
      onRendered={(error) => {
        if (error) {
          setErrored(error);
        }
      }}
    />
  );
}

// This is the component to render when an error occurs.
function VisualizationError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <>
      <div className="flex w-full flex-col items-center justify-center gap-4">
        <div>
          <ContentMessage title="Error" variant="pink">
            We encountered an error while running the code generated above. You
            can try again by clicking the button below.
            <Collapsible>
              <Collapsible.Button label="Show details" />
              <Collapsible.Panel>
                <div className="s-flex s-h-16 s-w-full s-items-center s-justify-center s-bg-slate-200">
                  Error messsage:
                  {error.message}
                </div>
              </Collapsible.Panel>
            </Collapsible>
          </ContentMessage>
        </div>
        <div>
          <Button label="Retry" onClick={retry} />
        </div>
      </div>
    </>
  );
}

type ErrorBoundaryProps = {
  actionId: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: unknown;
  activeTab: "code" | "runtime";
};

// This is the error boundary component that wraps the VisualizationIframe component.
// It needs to be a class component for error handling to work.
export class VisualizationIframeContentWithErrorHandling extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, activeTab: "code" };
  }

  static getDerivedStateFromError() {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    this.setState({ hasError: true, error });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      let error: Error;
      if (this.state.error instanceof Error) {
        error = this.state.error;
      } else {
        error = new Error("Unknown error");
      }
      const retry = makeIframeMessagePassingFunction(
        "retry",
        parseInt(this.props.actionId, 10)
      );
      return <VisualizationError error={error} retry={() => retry} />;
    }

    return <VisualizationIframe actionId={this.props.actionId} />;
  }
}
