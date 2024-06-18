import type { ReactElement } from "react";
import React, { useEffect, useRef } from "react";

import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";

export default function Home() {
  const content = `
    <html>
      <head>
      
      <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' https://dustcdn.com;">
      
      <!-- ERROR: Refused to load the script 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.js' because it violates the following Content Security Policy directive: "script-src 'self' 'unsafe-inline' https://dustcdn.com". Note that 'script-src-elem' was not explicitly set, so 'script-src' is used as a fallback. -->
      <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.js" integrity="sha512-iiZOijMkLFQSa43AyuzD6p176GJlnhWXEv7loEZFkCDpFQvZCijZLE6U8IRpAIb53KagIIwhSwHWTgsDlci/jw==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
        
    
    <script>
        setTimeout(() => {
          // Works, we are communicating with the parent window, without forcing it to execute any code.
          window.top.postMessage("Message from iframe to parent", "*")
          
        }, 1000)

        setTimeout(() => {
          // ERROR: about:srcdoc:11 Uncaught DOMException: Failed to read the 'cookie' property from 'Document': The document is sandboxed and lacks the 'allow-same-origin' flag at about:srcdoc:11:38 
          console.log('cookie', document.cookie)
        }, 5000)
      
        window.addEventListener("message", function() {
          console.log("got message from parent", event.data)
        
        }, false);

      </script>
      </head>
      <body>
        <h1>My first iframe</h1>
        

      </body>
    </html>
  `;

  const iframeRef = useRef(null);

  // receive message from iframe
  useEffect(() => {
    window.onmessage = function (e) {
      console.log("got message from iframe", e.data);
    };
  }, []);

  // send message to iframe
  useEffect(() => {
    setTimeout(() => {
      iframeRef.current.contentWindow.postMessage(
        "Message from parent to iframe",
        "*"
      );
    }, 2000);
  }, []);
  return (
    <>
      <div style={{ background: "white" }}>
        <iframe ref={iframeRef} sandbox="allow-scripts" srcDoc={content} />
      </div>
    </>
  );
}
