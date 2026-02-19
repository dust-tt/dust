// Content script that injects a sidebar with iframe containing the Dust extension

const DEFAULT_SIDEBAR_WIDTH = 450;
const MIN_SIDEBAR_WIDTH = 300;
const MAX_SIDEBAR_WIDTH = 1200;
const SIDEBAR_ID = "dust-extension-sidebar";
const IFRAME_ID = "dust-extension-iframe";
const RESIZE_HANDLE_ID = "dust-extension-resize-handle";
const STORAGE_KEY_VISIBLE = "dustSidebarVisible";
const STORAGE_KEY_WIDTH = "dustSidebarWidth";

// Track sidebar state
let sidebarVisible = false;
let sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
let sidebarElement: HTMLDivElement | null = null;
let iframeElement: HTMLIFrameElement | null = null;
let resizeHandle: HTMLDivElement | null = null;
let isResizing = false;

/**
 * Update sidebar width
 */
function updateSidebarWidth(width: number): void {
  const clampedWidth = Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(MAX_SIDEBAR_WIDTH, width)
  );
  sidebarWidth = clampedWidth;

  if (sidebarElement) {
    sidebarElement.style.width = `${clampedWidth}px`;
  }

  if (sidebarVisible) {
    document.body.style.marginRight = `${clampedWidth}px`;
  }

  // Save width to storage
  chrome.storage.local
    .set({ [STORAGE_KEY_WIDTH]: clampedWidth })
    .catch(console.error);
}

/**
 * Handle resize start
 */
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

/**
 * Handle resize move
 */
function handleResizeMove(e: MouseEvent): void {
  if (!isResizing) {
    return;
  }

  const newWidth = window.innerWidth - e.clientX;
  updateSidebarWidth(newWidth);
}

/**
 * Handle resize end
 */
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

/**
 * Create and inject the sidebar into the page
 */
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
    top: 0;
    right: 0;
    width: ${sidebarWidth}px;
    height: 100vh;
    z-index: 2147483647;
    background: white;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
    border-left: 1px solid #e5e7eb;
    display: none;
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

  // Create iframe
  iframeElement = document.createElement("iframe");
  iframeElement.id = IFRAME_ID;
  iframeElement.src = chrome.runtime.getURL("main.html");
  iframeElement.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    margin: 0;
    padding: 0;
  `;

  sidebarElement.appendChild(resizeHandle);
  sidebarElement.appendChild(iframeElement);
  document.body.appendChild(sidebarElement);

  // Add global mouse listeners for resizing
  document.addEventListener("mousemove", handleResizeMove);
  document.addEventListener("mouseup", handleResizeEnd);
}

/**
 * Show the sidebar
 */
function showSidebar(): void {
  if (!sidebarElement) {
    createSidebar();
  }

  if (sidebarElement) {
    sidebarElement.style.display = "block";
    document.body.style.marginRight = `${sidebarWidth}px`;
    sidebarVisible = true;

    // Save state
    chrome.storage.local
      .set({ [STORAGE_KEY_VISIBLE]: true })
      .catch(console.error);
  }
}

/**
 * Hide the sidebar
 */
function hideSidebar(): void {
  if (sidebarElement) {
    sidebarElement.style.display = "none";
    document.body.style.marginRight = "0";
    sidebarVisible = false;

    // Save state
    chrome.storage.local
      .set({ [STORAGE_KEY_VISIBLE]: false })
      .catch(console.error);
  }
}

/**
 * Toggle sidebar visibility
 */
function toggleSidebar(): void {
  if (sidebarVisible) {
    hideSidebar();
  } else {
    showSidebar();
  }
}

/**
 * Remove the sidebar from the page
 */
function removeSidebar(): void {
  if (sidebarElement) {
    sidebarElement.remove();
    sidebarElement = null;
    iframeElement = null;
    resizeHandle = null;
    document.body.style.marginRight = "0";
    sidebarVisible = false;
  }

  // Clean up event listeners
  document.removeEventListener("mousemove", handleResizeMove);
  document.removeEventListener("mouseup", handleResizeEnd);
}

/**
 * Initialize the content script
 */
async function init(): Promise<void> {
  try {
    // Restore previous state
    const result = await chrome.storage.local.get([
      STORAGE_KEY_VISIBLE,
      STORAGE_KEY_WIDTH,
    ]);

    // Restore saved width
    if (result[STORAGE_KEY_WIDTH]) {
      sidebarWidth = result[STORAGE_KEY_WIDTH];
    }

    // Restore visibility
    const wasVisible = result[STORAGE_KEY_VISIBLE] === true;
    if (wasVisible) {
      showSidebar();
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
