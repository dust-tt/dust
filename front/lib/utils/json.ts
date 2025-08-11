export const isValidJSON = (text: string) => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};
