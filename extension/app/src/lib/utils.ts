export const randomString = (length: number): string => {
  const charset =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~";
  let result = "";
  const bytes = new Uint8Array(length);

  crypto.getRandomValues(bytes);

  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }

  return result;
};

export const generatePKCE = async () => {
  const codeVerifier = randomString(128);
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const base64Digest = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { codeVerifier, codeChallenge: base64Digest };
};

export const saveAccessToken = (accessToken: string) => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ accessToken }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(true);
      }
    });
  });
};

export const getAccessToken = () => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["accessToken"], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result.accessToken);
      }
    });
  });
};

export const clearAccessToken = () => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove("accessToken", () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(true);
      }
    });
  });
};
