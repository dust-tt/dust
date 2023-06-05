export async function githubAuth(): Promise<string> {
  return new Promise((resolve, reject) => {
    const ghPopup = window.open("https://github.com/apps/dust-test-app");
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
