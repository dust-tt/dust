import Document, { Head, Html, Main, NextScript } from "next/document";
import Script from "next/script";

const { NODE_ENV, REACT_SCAN } = process.env;

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          {NODE_ENV === "development" && REACT_SCAN === "true" && (
            // eslint-disable-next-line @next/next/no-sync-scripts
            <script src="https://unpkg.com/react-scan/dist/auto.global.js" />
          )}
          <base href={process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL} />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
          />
          {process.env.NEXT_PUBLIC_ENABLE_BOT_CRAWLING !== "true" && (
            <meta name="robots" content="noindex" />
          )}
        </Head>
        <body>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${process.env.NEXT_PUBLIC_GTM_TRACKING_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            ></iframe>
          </noscript>
          <Main />
          <NextScript />
          {/* Datadog RUM (Real User Monitoring) - Must be in _document.tsx with beforeInteractive
              strategy to ensure it loads before page becomes interactive and captures all user
              interactions from the beginning. This is the recommended setup for Pages Router. */}
          <Script id="datadog-rum" strategy="beforeInteractive">
            {`
             (function(h,o,u,n,d) {
               h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
               d=o.createElement(u);d.async=1;d.src=n
               n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)
             })(window,document,'script','https://www.datadoghq-browser-agent.com/eu1/v6/datadog-rum.js','DD_RUM')
             '${process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN || ""}' && window.DD_RUM.onReady(function() {
               window.DD_RUM.init({
                 clientToken: '${process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN}',
                 applicationId: '5e9735e7-87c8-4093-b09f-49d708816bfd',
                 site: 'datadoghq.eu',
                 service: '${process.env.NEXT_PUBLIC_DATADOG_SERVICE || "front"}-browser',
                 env: '${process.env.NODE_ENV === "production" ? "prod" : "dev"}',
                 version: '${process.env.NEXT_PUBLIC_COMMIT_HASH || ""}',
                 allowedTracingUrls: [
                   "https://dust.tt",
                   "https://eu.dust.tt",
                   "https://front-edge.dust.tt",
                   "https://eu.front-edge.dust.tt",
                 ],
                 traceSampleRate: 5,
                 traceContextInjection: 'sampled',
                 sessionSampleRate: 100,
                 sessionReplaySampleRate: 5,
                 defaultPrivacyLevel: 'mask-user-input',
                 beforeSend: function (event) {
                   if (event.type === "action" && event.action && event.action.target && event.action.type === "click") {
                     if (event._dd && event._dd.action && event._dd.action.name_source === "text_content") {
                       var elSelector = event._dd.action.target && event._dd.action.target.selector;
                       if (elSelector && typeof elSelector === "string") {
                         try {
                           var el = document.querySelector(elSelector);
                           if (el) {
                             var parentWithPrivacyMask = el.closest(".dd-privacy-mask");
                             if (parentWithPrivacyMask) {
                               // Initially redact with a generic string
                               event.action.target.name = "[text element within dd-privacy-mask]";
                               // Now attempt to provide a better, less generic name, still respecting privacy
                               var buttonParent = el.closest("button");
                               if (buttonParent) {
                                 var ariaLabel = buttonParent.getAttribute("aria-label");
                                 if (ariaLabel) {
                                   event.action.target.name = ariaLabel;  // More specific, but still protecting privacy
                                 }
                               }
                             }
                           }
                         } catch (error) {
                           // Invalid selector - silently ignore
                         }
                       }
                     }
                   }
                   return true;
                 }
               });
             })
           `}
          </Script>
        </body>
      </Html>
    );
  }
}

export default MyDocument;
