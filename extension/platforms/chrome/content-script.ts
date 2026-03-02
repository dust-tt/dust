// Content script that injects a sidebar with iframe containing the Dust extension

const DEFAULT_SIDEBAR_WIDTH = 450;
const MIN_SIDEBAR_WIDTH = 300;
const MAX_SIDEBAR_WIDTH = 1200;
const SIDEBAR_ID = "dust-extension-sidebar";
const IFRAME_ID = "dust-extension-iframe";
const RESIZE_HANDLE_ID = "dust-extension-resize-handle";
const HEADER_ID = "dust-extension-header";
const CLOSE_BUTTON_ID = "dust-extension-close-button";
const HEADER_HEIGHT = 40;
const SIDEBAR_MARGIN = 8;
const STORAGE_KEY_VISIBLE = "dustSidebarVisible";
const STORAGE_KEY_WIDTH = "dustSidebarWidth";

// Slide animation: sidebar translates off-screen to the right when hidden.
const TRANSITION_DURATION = 300; // ms
const SIDEBAR_TRANSITION = `transform ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`;
// Must exceed SIDEBAR_MARGIN so the rounded edge is fully out of view.
const SIDEBAR_SLIDE_OUT = `translateX(calc(100% + ${SIDEBAR_MARGIN * 2}px))`;

// Track sidebar state
let sidebarVisible = false;
let sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
let sidebarElement: HTMLDivElement | null = null;
let backdropElement: HTMLDivElement | null = null;
let iframeElement: HTMLIFrameElement | null = null;
let resizeHandle: HTMLDivElement | null = null;
let closeButton: HTMLButtonElement | null = null;
let isResizing = false;
// Deferred cleanup when hiding: resets backdrop + body margin after slide-out.
let hideTimeoutId: ReturnType<typeof setTimeout> | undefined;

function updateSidebarWidth(width: number): void {
  const clampedWidth = Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(MAX_SIDEBAR_WIDTH, width)
  );
  sidebarWidth = clampedWidth;

  if (sidebarElement) {
    sidebarElement.style.width = `${clampedWidth}px`;
  }

  if (backdropElement) {
    backdropElement.style.width = `${clampedWidth + SIDEBAR_MARGIN * 2}px`;
  }

  if (sidebarVisible) {
    document.body.style.marginRight = `${clampedWidth + SIDEBAR_MARGIN * 2}px`;
  }

  // Save width to storage
  chrome.storage.local
    .set({ [STORAGE_KEY_WIDTH]: clampedWidth })
    .catch(console.error);
}

function handleResizeStart(e: MouseEvent): void {
  e.preventDefault();
  isResizing = true;
  document.body.style.cursor = "ew-resize";
  document.body.style.userSelect = "none";

  // Disable pointer events on iframe to capture mouseup
  if (iframeElement) {
    iframeElement.style.pointerEvents = "none";
  }
}

function handleResizeMove(e: MouseEvent): void {
  if (!isResizing) {
    return;
  }

  const newWidth = window.innerWidth - e.clientX;
  updateSidebarWidth(newWidth);
}

function handleResizeEnd(): void {
  if (isResizing) {
    isResizing = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    // Re-enable pointer events on iframe
    if (iframeElement) {
      iframeElement.style.pointerEvents = "auto";
    }
  }
}

function createSidebar(): void {
  // Check if sidebar already exists
  if (sidebarElement) {
    return;
  }

  // Create sidebar container
  sidebarElement = document.createElement("div");
  sidebarElement.id = SIDEBAR_ID;
  sidebarElement.style.cssText = `
    position: fixed;
    top: ${SIDEBAR_MARGIN}px;
    right: ${SIDEBAR_MARGIN}px;
    width: ${sidebarWidth}px;
    height: calc(100vh - ${SIDEBAR_MARGIN * 2}px);
    z-index: 2147483647;
    background: white;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: ${SIDEBAR_SLIDE_OUT};
    transition: ${SIDEBAR_TRANSITION};
    pointer-events: none;
  `;

  // Create resize handle
  resizeHandle = document.createElement("div");
  resizeHandle.id = RESIZE_HANDLE_ID;
  resizeHandle.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 4px;
    height: 100%;
    cursor: ew-resize;
    z-index: 2147483648;
    background: transparent;
    transition: background 0.2s;
  `;

  // Add hover effect
  resizeHandle.addEventListener("mouseenter", () => {
    if (resizeHandle) {
      resizeHandle.style.background = "rgba(59, 130, 246, 0.3)";
    }
  });

  resizeHandle.addEventListener("mouseleave", () => {
    if (resizeHandle && !isResizing) {
      resizeHandle.style.background = "transparent";
    }
  });

  // Add resize listeners
  resizeHandle.addEventListener("mousedown", handleResizeStart);

  // Create header with close button
  const header = document.createElement("div");
  header.id = HEADER_ID;
  header.style.cssText = `
    flex-shrink: 0;
    height: ${HEADER_HEIGHT}px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0 8px;
    border-bottom: 1px solid #e5e7eb;
  `;

  closeButton = document.createElement("button");
  closeButton.id = CLOSE_BUTTON_ID;
  closeButton.textContent = "✕";
  closeButton.style.cssText = `
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.06);
    color: #6b7280;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.15s, color 0.15s;
  `;
  closeButton.addEventListener("mouseenter", () => {
    if (closeButton) {
      closeButton.style.background = "rgba(0, 0, 0, 0.12)";
      closeButton.style.color = "#111827";
    }
  });
  closeButton.addEventListener("mouseleave", () => {
    if (closeButton) {
      closeButton.style.background = "rgba(0, 0, 0, 0.06)";
      closeButton.style.color = "#6b7280";
    }
  });
  closeButton.addEventListener("click", hideSidebar);
  header.appendChild(closeButton);

  // Create iframe
  iframeElement = document.createElement("iframe");
  iframeElement.id = IFRAME_ID;
  // Mark the URL so PortProvider knows it is embedded in a content-script
  // sidebar (Arc, etc.) rather than running as a native side panel.
  iframeElement.src = chrome.runtime.getURL("main.html") + "?embedded=1";
  iframeElement.style.cssText = `
    flex: 1;
    width: 100%;
    border: none;
    margin: 0;
    padding: 0;
    min-height: 0;
  `;

  // Create white backdrop covering the full reserved strip
  backdropElement = document.createElement("div");
  backdropElement.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: ${sidebarWidth + SIDEBAR_MARGIN * 2}px;
    height: 100vh;
    z-index: 2147483646;
    background: white;
    display: none;
  `;

  sidebarElement.appendChild(resizeHandle);
  sidebarElement.appendChild(header);
  sidebarElement.appendChild(iframeElement);
  document.body.appendChild(backdropElement);
  document.body.appendChild(sidebarElement);

  // Add global mouse listeners for resizing
  document.addEventListener("mousemove", handleResizeMove);
  document.addEventListener("mouseup", handleResizeEnd);
}

function showSidebar(): void {
  if (!sidebarElement) {
    createSidebar();
  }

  if (sidebarElement) {
    // Cancel any deferred cleanup from a previous hide.
    if (hideTimeoutId !== undefined) {
      clearTimeout(hideTimeoutId);
      hideTimeoutId = undefined;
    }

    if (backdropElement) {
      backdropElement.style.display = "block";
    }
    document.body.style.marginRight = `${sidebarWidth + SIDEBAR_MARGIN * 2}px`;
    sidebarElement.style.pointerEvents = "all";
    // Force a reflow so the off-screen transform is committed before we
    // change it, ensuring the CSS transition fires.
    void sidebarElement.offsetWidth;
    sidebarElement.style.transform = "translateX(0)";
    sidebarVisible = true;

    // Save state
    chrome.storage.local
      .set({ [STORAGE_KEY_VISIBLE]: true })
      .catch(console.error);
  }
}

function hideSidebar(): void {
  if (sidebarElement) {
    sidebarElement.style.transform = SIDEBAR_SLIDE_OUT;
    sidebarElement.style.pointerEvents = "none";
    sidebarVisible = false;

    // Defer the layout cleanup until after the slide-out animation so the
    // page content doesn't snap back before the panel has fully left.
    hideTimeoutId = setTimeout(() => {
      hideTimeoutId = undefined;
      if (backdropElement) {
        backdropElement.style.display = "none";
      }
      document.body.style.marginRight = "0";
    }, TRANSITION_DURATION);

    // Save state
    chrome.storage.local
      .set({ [STORAGE_KEY_VISIBLE]: false })
      .catch(console.error);
  }
}

function toggleSidebar(): void {
  if (sidebarVisible) {
    hideSidebar();
  } else {
    showSidebar();
  }
}

// Unlike hideSidebar (animated slide-out), this immediately destroys the DOM
// elements and removes global event listeners. Used on page unload.
function removeSidebar(): void {
  if (hideTimeoutId !== undefined) {
    clearTimeout(hideTimeoutId);
    hideTimeoutId = undefined;
  }

  if (sidebarElement) {
    sidebarElement.remove();
    sidebarElement = null;
    iframeElement = null;
    resizeHandle = null;
    closeButton = null;
    backdropElement?.remove();
    backdropElement = null;
    document.body.style.marginRight = "0";
    sidebarVisible = false;
  }

  // Clean up event listeners
  document.removeEventListener("mousemove", handleResizeMove);
  document.removeEventListener("mouseup", handleResizeEnd);
}

async function init(): Promise<void> {
  try {
    // Restore previous state
    const result = await chrome.storage.local.get([STORAGE_KEY_WIDTH]);

    // Restore saved width
    if (result[STORAGE_KEY_WIDTH]) {
      sidebarWidth = result[STORAGE_KEY_WIDTH];
    }
  } catch (error) {
    console.error("[Dust Content Script] Error initializing:", error);
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ping") {
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "openSidebar") {
    showSidebar();
    sendResponse({ success: true, visible: sidebarVisible });
    return true;
  }

  if (message.action === "toggleSidebar") {
    toggleSidebar();
    sendResponse({ success: true, visible: sidebarVisible });
    return true;
  }

  return false;
});

// Handle page unload
window.addEventListener("beforeunload", () => {
  removeSidebar();
});

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  void init();
}
