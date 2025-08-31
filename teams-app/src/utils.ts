/**
 * Creates a simple adaptive card for thinking/loading state
 */
export function createThinkingAdaptiveCard(): any {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: `Thinking...`,
              wrap: true,
              color: "Accent",
            },
          ],
        },
      },
    ],
  };
}
