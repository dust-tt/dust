export const randomString = (length: number): string => {
  const charset =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/";
  let result = "";
  const bytes = new Uint8Array(length);

  crypto.getRandomValues(bytes);

  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }

  return result;
};
