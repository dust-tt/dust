// We use this to detect if an interactive file uses conversation files.
// In which case, we don't want to display it publicly. Our proxy here is to look for usage of the
// `useFile` hook.
export function isFileUsingConversationFiles(content: string): boolean {
  // Simple regex to detect useFile hook usage.
  const useFileRegex = /useFile\s*\(/;
  return useFileRegex.test(content);
}
