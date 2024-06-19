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
        Write client side Javascript code to answer to the client query.  
        The code will be injected inside a <script> tag in the body of an iframe.
        Feel free to include the window.onload event listener to run your code when the iframe is loaded, if needed.
        The background color of the iframe is white.
        The iframe dimension will be 600px x 600px.
        You must write valid javascript code only that can be run directly in  a web browser <script> tag.
        Please, include your code in one code block only. Never more than one code block.
        
        Do not include the <script> tag.
        Do not incude anything else than the code block itself.
        If you have something to render, use the html div with the id "mainview".
          The code can be interactive since it runs in the web browser. 
          The code will be running in a sandboxed iframe which won't have access to the internet, 
          but you will have the following set of libraries pre-loaded: d3js v 7.9.0. 
          You can also decide to fetch files from the context using the folling preloaded functions: 
         - getFile(fileId) or getFile(http_url) 
         -  You can also save a file as the result of the execution using saveFile(fileName, content)
         `,
      },
      {
        role: "user",
        content: `
        Can you generate a random CSV with 10 names and ages and save it please?
          
          `,
      },
    ],
    model: "gpt-3.5-turbo",
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
        <meta
          httpEquiv="Content-Security-Policy"
          content="script-src 'self' 'unsafe-inline' https://cdnjs.cloudflaree.com;"
        />
        <script
          src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.js"
          integrity="sha512-iiZOijMkLFQSa43AyuzD6p176GJlnhWXEv7loEZFkCDpFQvZCijZLE6U8IRpAIb53KagIIwhSwHWTgsDlci/jw=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        ></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
        setTimeout(function() {
          window.top.postMessage('Hello from iframe!', '*');
          }, 3000)

          async function getFile(url) {
            return new Promise((resolve) => {
              resolve('Hello from getFile!');
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
