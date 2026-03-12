// Chrome's side panel cannot display the microphone permission prompt.
// To work around this, we open this page as a popup window, which can display the prompt.
// Once the user grants (or dismisses) the permission, the popup closes itself.
// The permission grant is tied to the extension origin (chrome-extension://...),
// so it persists and is available to the side panel after this popup closes.
navigator.mediaDevices
  .getUserMedia({ audio: true })
  .then((stream) => {
    // Permission granted — immediately stop the stream since we only needed the grant,
    // not an actual recording. The side panel will open its own stream after this.
    stream.getTracks().forEach((track) => track.stop());
    window.close();
  })
  .catch(() => {
    // Permission dismissed or denied — close the popup anyway.
    window.close();
  });
