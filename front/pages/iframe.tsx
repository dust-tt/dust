import OpenAI from "openai";
import React, { useEffect } from "react";
import ReactDOMServer from "react-dom/server";

export async function getServerSideProps() {
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
// Returns the content of \`filedId\`.
// @param fileId string 
// @returns any
function async getFile(fileId: string) : Promise<{name: string; content:any}>
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
Can you draw a spinning rainbow circle using canvas please?
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

  console.log("code is ~~", finalCode);
  return {
    props: {
      code: finalCode,
    },
  };
}

function Arico({ code }: { code: string }) {
  return (
    <html>
      <head>
        <script
          src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.js"
          integrity="sha512-iiZOijMkLFQSa43AyuzD6p176GJlnhWXEv7loEZFkCDpFQvZCijZLE6U8IRpAIb53KagIIwhSwHWTgsDlci/jw=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        ></script>
        <script src="https://cdn.jsdelivr.net/npm/pixi.js@7.x/dist/pixi.min.js"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
        setTimeout(function() {
          window.top.postMessage('Hello from iframe!', '*');
          }, 3000)

          async function getFile(url) {
            return new Promise((resolve) => {
              const payload = {name:url, content: \`
              House Id;	# of rooms;	Year built;	Price
              1;	5;	2020;	$600,000
              2;	4;	1920;	$300,000
              \`.trim()};

                console.log('Getting file', url, payload);
                debugger;
              resolve(payload);
            })
          }

          async function saveFile(name, content) {
            return new Promise((resolve) => {
              console.log('Saving file', name, content);
              resolve();
            })
          }
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
  useEffect(() => {
    window.onmessage = (event) => {
      console.log("Message received!", event);
    };
  }, []);
  return (
    <>
      <div id="rootarico">
        <iframe
          width={700}
          height={700}
          style={{
            overflow: "hidden",
          }}
          srcDoc={ReactDOMServer.renderToString(<Arico code={code} />)}
        />
      </div>
    </>
  );
}
