import { Button, Spinner } from "@dust-tt/sparkle";
import CodeEditor from "@uiw/react-textarea-code-editor";
import React, { useEffect } from "react";
import ReactDOMServer from "react-dom/server";

import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";

const DEFAULT_INSTRUCTIONS = ` Above are the instructions provided by the user.

Based on the code instructions provided below, write Javascript code to be interpreted in the user's web browser in a secure iframe of dimension 600px x 600px (white background) as part of a conversation with an assistant.

Files can be made available as part of the conversation and can be read using the following library:

\`\`\`
async FileTransferAPI.getFile(name: string): Promise<File>
\`\`\`

The \`File\` object is a browser File object. Here is how to use it:
\`\`\`
const file = await FileTransferAPI.getFile(fileName);

// for text file:
const text = await file.text();
// for binary file:
const arrayBuffer = await file.arrayBuffer();
\`\`\`

The function you have to implement is the following:

\`\`\`
// Perform a computation to generates files or inject content in the iFrame mainView div and return the files generated if applicable.
function async fn(mainView: Element) : { files: File[] }
\`\`\`

Only implement this function and do not attempt to call it. 
You have access to the following Javascript libraries:
- papaparse v5.4.1: to parse CSV files
- d3 v7.9.0: for data visualization


It will be executed in the following environment:

\`\`\`
<html>
  <head>
    <meta
    httpEquiv="Content-Security-Policy"
    content="script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dustcdn.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net"/>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/pixi.js@7.x/dist/pixi.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.js"></script>
  </head>
  <script>
    let mainView = $('#mainView');
    const { files } = await fn(mainView)
    submitToConversation(files);
  <body>
    <div id="mainView"/>
  </body>
</html>
\`\`\`

Based on the instructions provided you can do the following:

- Using \`files\`: attach files to the conversation that will be available for the user to download and other assistants to use for their own computations. Return \`[]\` otherwise.
`;

type SerializedFile = {
  name: string;
  content: ArrayBuffer;
  mimeType: string;
};

async function serializeFile(file: File): Promise<SerializedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (readerEvent) {
      resolve({
        name: file.name,
        content: readerEvent.target?.result as ArrayBuffer,
        mimeType: file.type,
      });
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsArrayBuffer(file);
  });
}

async function deserializeFile(serializedFile: SerializedFile): Promise<File> {
  return new File([serializedFile.content], serializedFile.name, {
    type: serializedFile.mimeType,
  });
}

function Iframe({ code }: { code: string }) {
  // This is the file transfer API that will be used only in the iframe.
  // Having it here allows us to write it in a way that is checked at compile time,
  // and transfer it easily to the iframe at runtime using the class.toString() method.
  class FileTransferAPI {
    // Returns the content of `name`.
    // @param name string
    // @returns { name: string, content: ArrayBuffer, mimeType: string }
    static async getFile(name: string): Promise<File> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("message", onMessage);
          reject(new Error(`Timeout while waiting for file ${name}`));
        }, 5000);

        const onMessage = async (event: MessageEvent) => {
          if (event.data.name === name) {
            window.removeEventListener("message", onMessage);
            clearTimeout(timeout);
            const serializedFile = event.data as SerializedFile;
            const file = await deserializeFile(serializedFile);
            console.log(
              "File received in iframe",
              file,
              serializedFile,
              await file.text()
            );
            resolve(file);
          }
        };

        window.top?.postMessage({ command: "getFile", name: name }, "*");
        window.addEventListener("message", onMessage);
      });
    }

    static async saveFile(name: string, content: string): Promise<void> {
      window.top?.postMessage(
        { command: "saveFile", name: name, content },
        "*"
      );
    }
  }

  function registerErrorHandler() {
    function onError(message: string) {
      const errorDiv = document.getElementById("error");
      if (errorDiv) {
        errorDiv.innerHTML = message;
      } else {
        console.error("Error div not found");
      }
    }
    console.log("Registering error handler");
    window.onerror = function (message: Event | string) {
      // @ts-expect-error event is a string hopefully
      onError(message);
    };
    window.onunhandledrejection = function (event) {
      onError(event.reason);
    };
  }

  function registerScrollPrevent() {
    document.addEventListener("keydown", function (e) {
      if (
        ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].indexOf(e.key) > -1
      ) {
        e.preventDefault();
      }
    });
  }
  // This function will execute the code provided by the model and handle its output to communicate with the host page.
  async function executeFn(
    fn: (mainView: HTMLElement) => {
      files: File[];
    }
  ) {
    const view = document.getElementById("mainview");
    if (!view) {
      throw new Error("Main view not found");
    }
    const result = await fn(view);
    for (const browserFile of result.files) {
      // Create a URL for the file
      const url = URL.createObjectURL(browserFile);

      // Create an anchor element and set the download attribute
      const a = document.createElement("a");
      a.href = url;
      a.download = browserFile.name;
      a.innerHTML = "Click here to download" + browserFile.name;

      // Programmatically click the anchor element to trigger the download
      // document.getElementById('result').appendChild(a);
    }
  }

  if (code.trim().length === 0) {
    return (
      <html>
        <body>
          <h1>No code provided</h1>
        </body>
      </html>
    );
  }

  return (
    <html>
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content="script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dustcdn.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net"
        />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.js"></script>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.jsdelivr.net/npm/pixi.js@7.x/dist/pixi.min.js"></script>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.js"></script>

        <script
          dangerouslySetInnerHTML={{
            __html: `
            ${FileTransferAPI.toString()}

            ${serializeFile.toString()}

            ${deserializeFile.toString()}

            ${registerErrorHandler.toString()}
            registerErrorHandler();

            ${registerScrollPrevent.toString()}
            registerScrollPrevent();
        `,
          }}
        ></script>
      </head>
      <body>
        <h3>Code execution block</h3>
        <div id="mainview"></div>
        <div id="error"></div>
        <script
          dangerouslySetInnerHTML={{
            __html: `          
            
          ${code}

          ${executeFn.toString()} 
          
          executeFn(fn);
          `,
          }}
        ></script>
      </body>
    </html>
  );
}

export default function Home() {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [instructions, setInstructions] = React.useState(DEFAULT_INSTRUCTIONS);
  const [prompt, setPrompt] = React.useState(
    `I want to see a stacked bar plot of the number of agent usage per day?
    I want to get an overlay of the count, the date  and the agent id on mouse over. Thanks.`
  );
  const [code, setCode] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [model, setModel] = React.useState(
    "anthropic/claude-3-5-sonnet-20240620"
  );
  const filesContent = React.useRef<File[]>([]);

  useEffect(() => {
    window.onmessage = async (event) => {
      console.log("Message received in host!", event);
      if (event.data.command === "getFile") {
        // iframe request to get a file from the host
        // We are returning an harcoded file.
        const file = filesContent.current.find(
          (file) => file.name === event.data.name
        );
        if (!file) {
          console.error(
            "File not found",
            event.data.name,
            filesContent.current.map((f) => f.name)
          );
          return;
        }
        console.log("Sending file to iframe", file);
        const serializedFile = await serializeFile(file);
        // @ts-expect-error contentWindow is not null
        iframeRef.current?.contentWindow.postMessage(serializedFile, "*");
      } else if (event.data.command === "saveFile") {
        // iframe request to save a file to the host
        console.log("Saving file to host", event.data);
      }
    };
  }, []);

  const getFileDescription = async (file: File) => {
    try {
      const res = await handleFileUploadToText(file);
      if (res.isErr()) {
        console.error(res.error);
        return "";
      } else {
        return (
          res.value.content.split("\n").slice(0, 5).join("\n") +
          "(truncated...)\n"
        );
      }
    } catch (e) {
      console.error(e);
      return "";
    }
  };

  const submit = async () => {
    setCode("");
    setIsLoading(true);
    try {
      const descriptions = await Promise.all(
        filesContent.current.map(getFileDescription)
      );
      const instructionsWithFiles =
        instructions +
        `\n\n
        You have access to the following files:\n
        ` +
        filesContent.current
          .map((file, i) => ({
            file: file,
            description: descriptions[i],
          }))
          .map(
            ({ file, description }) =>
              `<file name="${file.name}" mimeType="${file.type}">\n${description}</file>`
          )
          .join("\n");

      const res = await fetch("/api/iframe", {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({
          instructions: instructionsWithFiles,
          prompt,
          model,
        }),
      });
      const data: { code: string } = await res.json();
      setCode(data.code);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <h1>Instructions</h1>
      <div id="rootarico">
        <div>
          <textarea
            style={{ width: "70%", height: "200px" }}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <h1>Prompt</h1>
          <textarea
            style={{ width: "70%", height: "200px" }}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <h1>Attach files to your prompt</h1>
          <input
            type="file"
            multiple={true}
            onChange={(e) => {
              filesContent.current = Array.from(e.target.files || []);
            }}
          />
          <h1>Choose gpt-3.5 or gpt-4</h1>
          <select
            onChange={(e) => {
              setModel(e.target.value);
            }}
          >
            <option value="anthropic/claude-3-5-sonnet-20240620">
              anthropic/claude-3-5-sonnet-20240620
            </option>
            <option value="openai/gpt-4-turbo">openai/gpt-4-turbo</option>
            <option value="openai/gpt-4o">openai/gpt-4o</option>
          </select>
          <div style={{ height: "50px" }}></div>
          <Button
            label="Submit"
            onClick={async () => {
              submit().catch(console.error);
            }}
          />
          {isLoading && <Spinner size="md" />}
        </div>

        <hr />

        {code && (
          <>
            <div className="flex flex-row">
              <div>
                <h1>Output</h1>
                <div style={{ border: "1px solid red" }}>
                  <iframe
                    ref={iframeRef}
                    sandbox="allow-scripts"
                    width={700}
                    height={700}
                    style={{
                      overflow: "hidden",
                    }}
                    srcDoc={ReactDOMServer.renderToString(
                      <Iframe code={code} />
                    )}
                  />
                </div>
              </div>

              <div>
                <h1>Code</h1>
                <div>
                  This is the code returned by the model being displayed here to
                  help you understand what is happening
                </div>
                <CodeEditor
                  value={code}
                  language="js"
                  placeholder="Please enter JS code."
                  onChange={(evn) => setCode(evn.target.value)}
                  padding={15}
                  style={{
                    backgroundColor: "#f5f5f5",
                    fontFamily:
                      "ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
