export async function githubAuth(): Promise<string> {
  const { GITHUB_APP_URL = "" } = process.env;

  if (!GITHUB_APP_URL.length) {
    throw new Error("Missing GITHUB_APP_URL environment variable.");
  }

  return new Promise((resolve, reject) => {
    const ghPopup = window.open(GITHUB_APP_URL);
    let authComplete = false;

    const popupMessageEventListener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === "installed") {
        authComplete = true;
        resolve(event.data.installationId);
        window.removeEventListener("message", popupMessageEventListener);
        ghPopup?.close();
      }
    };

    window.addEventListener("message", popupMessageEventListener);

    const checkPopupStatus = setInterval(() => {
      if (ghPopup && ghPopup.closed) {
        window.removeEventListener("message", popupMessageEventListener);
        clearInterval(checkPopupStatus);
        setTimeout(() => {
          if (!authComplete) {
            reject(
              new Error("User closed the window before installation completed")
            );
          }
        }, 100);
      }
    }, 100);
  });
}
