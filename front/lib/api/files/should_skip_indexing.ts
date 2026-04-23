import { isPastedFile } from "@app/components/assistant/conversation/input_bar/pasted_utils";

const SLACK_THREAD_CONTENT_TYPE = "text/vnd.dust.attachment.slack.thread";
const AUDIO_WEBM_CONTENT_TYPE = "audio/webm";
// Chrome extension page captures : the extension uploads as text/markdown with no
// distinguishing header or metadata, so the filename prefix is our only signal.
// See extension/ui/hooks/useFileUploaderService.ts.
const CHROME_TEXT_PREFIX = "[text] ";

/**
 * True for files that live in a conversation's data source but should never be
 * indexed in Qdrant, because they're same-turn inline context (pasted
 * text, Chrome page captures, Slack thread attachments, etc).
 */
export function shouldSkipDataSourceIndexing({
  contentType,
  fileName,
}: {
  contentType: string;
  fileName: string;
}): boolean {
  if (isPastedFile(contentType)) {
    return true;
  }
  if (contentType === SLACK_THREAD_CONTENT_TYPE) {
    return true;
  }
  if (fileName.startsWith(CHROME_TEXT_PREFIX)) {
    return true;
  }
  if (contentType === AUDIO_WEBM_CONTENT_TYPE) {
    return true;
  }
  return false;
}
