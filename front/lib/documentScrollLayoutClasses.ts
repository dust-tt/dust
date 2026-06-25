/** Mobile document scroll layout overrides. Paired with body.document-scroll-mode. */
export const MOBILE_DOCUMENT_SCROLL_CLASSES = {
  dropzoneContainer: "h-auto min-h-0",
  contentRoot: "h-auto min-h-dvh w-full",
  contentRow: "min-h-0 flex-[0_1_auto] w-full max-w-full overflow-x-clip",
  contentMain:
    "h-auto min-h-[var(--panel-height)] flex-[0_1_auto] w-full max-w-full overflow-x-clip bg-transparent",
  contentArea:
    "h-auto flex-[0_1_auto] w-full max-w-full overflow-x-clip overflow-y-visible",
} as const;
