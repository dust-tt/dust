import { cacheWithRedis } from "@dust-tt/types";
import OpenAI from "openai";
import React, { useEffect } from "react";
import ReactDOMServer from "react-dom/server";

async function generateCode() {
  const openai = new OpenAI({
    apiKey: process.env["DUST_MANAGED_OPENAI_API_KEY"], // This is the default and can be omitted
  });
  console.log("Will talk to Openai");
  const chatCompletion = await openai.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `
          Above are the instructions provided by the user.

  Based on the code instructions provided below, write Javascript code to be interpreted in the user's web browser in a secure iframe of dimension 600px x 600px (white background) as part of a conversation with an assistant.

  Files can be made available as part of the conversation and can be read using the following library:

  \`\`\`
  async FileTransferAPI.getFile(fileId: string): {fileId: string, content: any}
  \`\`\`

  The function you have to implement is the following:

  \`\`\`
  // Perform a computation to return a result or generate files or inject content in the iFrame mainView div and returns the result of the computation if applicable, the files generated if applicable and whether to show the iFrame to the user.
  function async fn(mainView: HtmlDiv) : { result: any, files: { content: any, name: string, description: string }[], showIframe: boolean }
  \`\`\`

  It will be executed in the following environment:

  \`\`\`
  <html>
    ...
    // show imports and security measures. Your code snippet basically
    <script>
      let mainView = $('#mainView');
      const { result, files, showIframe } = await fn(mainView)
      submitToConversation(result, files);
    <body>
      <div id="mainView"/>
    </body>
  </html>
  \`\`\`

  Based on the instructions provided you can do one or multiple of the following:

  - Using \`results\`: generate a result object that will be returned to the conversation (eg, the result of a computation). These objects must be small. If there is more than a few hundred bytes of information to return, use a file. Return \`null\` otherwise.
  - Using \`files\`: attach files to the conversation that will be available for the user to download and other assistants to use for their own computations. Return \`[]\` otherwise.
  - Decide whether to show the iframe to the user or not. Return \`true\` or \`false\`.
           `,
      },
      {
        role: "user",
        content: `
        I have the following CSV file, can you add a column to it that divie de price per the number of rooms?
        Show me the result on screen and provide me the file to download

<file name="houses.csv">
House Id;	# of rooms;	Year built;	Price
1;	5;	2020;	$600,000
2;	4;	1920;	$300,000
</file>
            `,
      },
    ],
    model: "gpt-4-turbo",
    temperature: 0.2,
  });

  console.log("Got response from Openai");
  console.log(JSON.stringify(chatCompletion, null, 2));

  const markdownText = chatCompletion.choices[0].message.content || "";
  const code = markdownText.split("```")[1] || markdownText;
  const lines = code.split("\n");
  if (lines.length > 0) {
    if (lines[0].trim().toLowerCase().startsWith("javascript")) {
      // lines[0] = lines[0].replace("javascript", "//javascript");
      lines.shift();
    }
    if (lines[0].trim().toLowerCase() === "js") {
      lines.shift();
    }
    if (lines[0].trim().toLowerCase() === "jsx") {
      lines.shift();
    }
  }

  const finalCode = lines.length > 0 ? lines.join("\n") : code;

  return finalCode;
}

const cachedGenerateCode = cacheWithRedis(
  generateCode,
  () => {
    return `5`;
  },
  10 * 60 * 1000
);

export async function getServerSideProps() {
  const finalCode = await cachedGenerateCode();
  console.log("code is ~~", finalCode);
  return {
    props: {
      code: finalCode,
    },
  };
}

function Iframe({ code }: { code: string }) {
  // This is the file transfer API that will be used only in the iframe.
  // Having it here allows us to write it in a way that is checked at compile time,
  // and transfer it easily to the iframe at runtime using the class.toString() method.
  class FileTransferAPI {
    // Returns the content of `fileId`.
    // @param fileId string
    // @returns any
    static async getFile(
      fileId: string
    ): Promise<{ id: string; content: any }> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("message", onMessage);
          reject(new Error("Timeout"));
        }, 5000);

        const onMessage = (event) => {
          console.log(
            "Message received in iframe!",
            event.data,
            `fileId: ${fileId}`
          );
          if (event.data.fileId === fileId) {
            window.removeEventListener("message", onMessage);
            clearTimeout(timeout);
            resolve({ id: event.data.fileId, content: event.data.content });
          }
        };

        window.top?.postMessage({ command: "getFile", fileId: fileId }, "*");
        window.addEventListener("message", onMessage);
      });
    }

    static async saveFile(fileId: string, content: string): Promise<void> {
      window.top?.postMessage({ command: "saveFile", fileId, content }, "*");
    }
  }

  return (
    <html>
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content="script-src 'self' 'unsafe-inline' https://dustcdn.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net"
        />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.js"></script>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.jsdelivr.net/npm/pixi.js@7.x/dist/pixi.min.js"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
            ${FileTransferAPI.toString()}
        `,
          }}
        ></script>
      </head>
      <body>
        <div id="mainview"></div>
        <h1>My first iframe</h1>
        <script
          dangerouslySetInnerHTML={{
            __html: `          
            
          ${code}

          
          fn(document.getElementById('mainview')).then((result) => {
            console.log('Result', result);  
          })
          
          `,
          }}
        ></script>
      </body>
    </html>
  );
}

export default function Home({ code }: { code: string }) {
  const [iframeCode, setIframeCode] = React.useState("");
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    window.onmessage = (event) => {
      console.log("Message received in host!", event);
      if (event.data.command === "getFile") {
        // iframe request to get a file from the host
        // We are returning an harcoded file.
        iframeRef.current?.contentWindow.postMessage(
          {
            fileId: event.data.fileId,
            content: `
House Id;	# of rooms;	Year built;	Price
1;	5;	2020;	$600,000
2;	4;	1920;	$300,000
`.trim(),
          },
          "*"
        );
      } else if (event.data.command === "saveFile") {
        // iframe request to save a file to the host
        console.log("Saving file to host", event.data);
      }
    };
  }, []);

  useEffect(() => {
    setIframeCode(code);
  }, [code]);
  return (
    <>
      <div id="rootarico">
        {iframeCode && (
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts"
            width={700}
            height={700}
            style={{
              overflow: "hidden",
            }}
            srcDoc={ReactDOMServer.renderToString(<Iframe code={code} />)}
          />
        )}
      </div>
    </>
  );
}
