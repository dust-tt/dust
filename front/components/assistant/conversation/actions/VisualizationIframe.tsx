import { Button, Collapsible, ContentMessage, Spinner } from "@dust-tt/sparkle";
import * as papaparseAll from "papaparse";
import * as reactAll from "react";
import React from "react";
import { useEffect, useMemo, useState } from "react";
import { importCode, Runner } from "react-runner";
import {} from "react-runner";
import * as rechartsAll from "recharts";

type RPCMethod = "getCodeToExecute" | "retry";
export type CrossWindowRequest = {
  command: RPCMethod;
  messageUniqueId: string;
  actionId: number;
  params: unknown;
};

function useFile(workspaceId: string, fileId: string) {
  const [data, setData] = useState<File | null>(null);
  console.log("useFile", workspaceId, fileId);
  useEffect(() => {
    fetch(`/api/w/${workspaceId}/files/${fileId}?action=view`)
      .then((response) => {
        console.log(response);

        return response.arrayBuffer().then((buffer) => {
          return { buffer, contentType: response.headers.get("Content-Type") };
        });
      })
      .then(({ buffer, contentType }) =>
        setData(
          new File([buffer], fileId, {
            type: contentType || undefined,
          })
        )
      )
      .catch(console.error);
  }, [fileId, workspaceId]);
  if (!fileId) {
    return null;
  }

  console.log("returned data", data);
  return data;
}

function makeIframeMessagePassingFunction<Params, Answer>(
  methodName: RPCMethod,
  actionId: number
) {
  return (params?: Params) => {
    return new Promise<Answer>((resolve, reject) => {
      console.log("sending a message to parent", params);
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
        } satisfies CrossWindowRequest,
        "*"
      );
    });
  };
}

export function VisualizationIframe({
  actionId,
  workspaceId,
}: {
  actionId: string;
  workspaceId: string;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [errored, setErrored] = useState<Error | null>(null);
  const useFileWorkspaceWrapped = (fileId: string) =>
    useFile(workspaceId, fileId);

  useEffect(() => {
    // get the code to execute
    const getCodeToExecute = makeIframeMessagePassingFunction<
      { actionId: string },
      { code: string }
    >("getCodeToExecute", parseInt(actionId, 10));
    getCodeToExecute({ actionId })
      .then((result) => {
        const regex = /<visualization[^>]*>\s*([\s\S]*?)\s*<\/visualization>/;
        let extractedCode: string | null = null;
        const match = result.code.match(regex);
        if (match && match[1]) {
          extractedCode = match[1];
          setCode(extractedCode);
          console.log("got code to execute", result, extractedCode);
        } else {
          setErrored(new Error("No visualization code found"));
        }
      })
      .catch(console.error);
  }, [actionId]);

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

      "./local-file": importCode(code, { import: generatedCodeScope }),
    },
  };

  const wrapperCode = `
() => {
import Comp from './local-file';

return (<Comp />);
}
`;

  return (
    <>
      <Runner
        code={wrapperCode}
        scope={scope}
        onRendered={(error) => {
          if (error) {
            setErrored(error);
          }
        }}
      />
    </>
  );
}

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
  workspaceId: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: unknown;
  activeTab: "code" | "runtime";
};

export default class VisualizationIframeWithErrorHandling extends React.Component<
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

    return (
      <>
        <VisualizationIframe
          actionId={this.props.actionId}
          workspaceId={this.props.workspaceId}
        />
      </>
    );
  }
}
