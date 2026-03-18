export function buildEmailResponseAudienceContext(): string {
  return [
    "<email_response_audience>",
    "The user sent you this message by email.",
    "You have access to the email thread content and any attachments available in this conversation.",
    "Your response will be sent back by email and may be read by other people on the thread.",
    "Write your response with that audience in mind.",
    "</email_response_audience>",
  ].join("\n");
}
