export async function getPKCEConfig() {
  // Generate verifier
  const generateVerifier = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) =>
      ("0" + byte.toString(16)).slice(-2)
    ).join("");
  };

  // Base64URL encode
  const base64URLEncode = (buffer: ArrayBuffer) => {
    return btoa(
      Array.from(new Uint8Array(buffer))
        .map((byte) => String.fromCharCode(byte))
        .join("")
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  };

  // Generate challenge
  const generateChallenge = async (verifier: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return base64URLEncode(hash);
  };

  const verifier = generateVerifier();
  return {
    code_verifier: verifier,
    code_challenge: await generateChallenge(verifier),
  };
}
