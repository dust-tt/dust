package com.dust.mobile.core.model

fun buildFrameWrapperHtml(code: String, fileId: String, vizUrl: String): String {
    val escapedCode = code
        .replace("\\", "\\\\")
        .replace("`", "\\`")
        .replace("$", "\\$")
        .replace("</", "<\\/")
    val vizIdentifier = "viz-$fileId"
    val url = "$vizUrl/content?identifier=$vizIdentifier&fullHeight=true"
    return """
        <!DOCTYPE html>
        <html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
        <style>
        * { margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
        iframe { width: 100%; height: 100%; border: none; }
        </style>
        </head><body>
        <iframe id="viz" src="$url" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"></iframe>
        <script>
        const FRAME_CODE = `$escapedCode`;
        const IDENTIFIER = '$vizIdentifier';
        function postAnswer(messageUniqueId, result) {
          const iframe = document.getElementById('viz');
          if (!iframe || !iframe.contentWindow) return;
          iframe.contentWindow.postMessage({
            command: 'answer',
            messageUniqueId,
            identifier: IDENTIFIER,
            result
          }, '*');
        }
        window.__dustAnswerFile = function(messageUniqueId, base64, contentType) {
          if (!base64) {
            postAnswer(messageUniqueId, { fileBlob: null });
            return;
          }
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          postAnswer(messageUniqueId, {
            fileBlob: new Blob([bytes], { type: contentType || 'application/octet-stream' })
          });
        };
        window.addEventListener('message', function(event) {
          const data = event.data;
          if (!data || !data.command || data.identifier !== IDENTIFIER) return;
          if (data.command === 'getCodeToExecute') {
            postAnswer(data.messageUniqueId, { code: FRAME_CODE });
          }
          else if (data.command === 'getFile') {
            if (window.DustFrameBridge && data.params && data.params.fileId) {
              window.DustFrameBridge.getFile(data.messageUniqueId, data.params.fileId);
            } else {
              postAnswer(data.messageUniqueId, { fileBlob: null });
            }
          }
          else if (data.command === 'setErrorMessage') {
            if (window.DustFrameBridge && data.params && data.params.errorMessage) {
              window.DustFrameBridge.setErrorMessage(data.params.errorMessage);
            }
          }
        });
        </script>
        </body></html>
    """.trimIndent()
}
