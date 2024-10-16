export function getVisualizationRetryMessage(errorMessage: string) {
  return `The visualization code failed with this error:\n\`\`\`\n${errorMessage}\n\`\`\`\nPlease fix the code.`;
}
