export type PostFrameEditTextRequestBody = {
  conversationId: string;
  newText: string;
  oldText: string;
  source: string;
};

export type PostFrameEditTextResponseBody = {
  publicationId: string;
  success: true;
};
