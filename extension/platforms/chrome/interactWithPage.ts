import { Err, Ok, type Result } from "@app/types/shared/result";
import { ensureDustPageUtils } from "./pageUtils";

type ElementSnapshot = {
  elementId: string;
  tag: string;
  type: "content" | "interactive";
  role: string;
  name: string;
  inputType: string | null;
  coords: { x: number; y: number };
};

type DustWindow = {
  __dustUtils: {
    selector: string;
    CONTENT: string[];
    getElementName: (el: HTMLElement) => string;
    highlightElement: (el: HTMLElement) => void;
  };
  __dustElementMap: Record<string, WeakRef<HTMLElement>>;
  __dustElementSnapshots: Record<string, ElementSnapshot>;
  __dustElementIdCounter: number;
};

export async function getPageElements(
  tab: chrome.tabs.Tab | undefined
): Promise<Result<string, Error>> {
  if (!tab?.id) {
    return new Err(new Error("Tab not found."));
  }

  const utilsResult = await ensureDustPageUtils(tab);
  if (utilsResult.isErr()) {
    return utilsResult;
  }

  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [tab.id],
    func: (tabId: number) => {
      const w = window as unknown as DustWindow;
      const { selector, CONTENT, getElementName } = w.__dustUtils;

      w.__dustElementMap = {};
      w.__dustElementSnapshots = {};
      w.__dustElementIdCounter = 0;

      const elementPrefix = `el_${tabId.toString(36)}_`;

      const elements: ElementSnapshot[] = [];
      const nodes = document.querySelectorAll<HTMLElement>(selector);

      nodes.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") {
          return;
        }
        if (el.getAttribute("aria-hidden") === "true") {
          return;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return;
        }

        const elementId = `${elementPrefix}${w.__dustElementIdCounter++}`;
        w.__dustElementMap[elementId] = new WeakRef<HTMLElement>(el);

        const tag = el.tagName.toLowerCase();
        const snapshot: ElementSnapshot = {
          elementId,
          tag,
          type: CONTENT.includes(tag) ? "content" : "interactive",
          role: el.getAttribute("role") ?? tag,
          name: getElementName(el),
          inputType: el.getAttribute("type"),
          coords: {
            x: Math.round(rect.x + rect.width / 2),
            y: Math.round(rect.y + rect.height / 2),
          },
        };

        w.__dustElementSnapshots[elementId] = snapshot;
        elements.push(snapshot);
      });

      return JSON.stringify(elements);
    },
  });

  const result =
    execution && typeof execution.result === "string"
      ? execution.result
      : JSON.stringify([]);

  return new Ok(result);
}

export async function clickPageElement(
  tab: chrome.tabs.Tab,
  elementId: string
): Promise<Result<boolean, Error>> {
  if (!tab?.id) {
    return new Err(new Error("No active tab found."));
  }

  const utilsResult = await ensureDustPageUtils(tab);
  if (utilsResult.isErr()) {
    return utilsResult;
  }

  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [elementId],
    func: (elementId: string) => {
      const w = window as unknown as DustWindow;

      const element = w.__dustElementMap?.[elementId].deref();
      if (!element) {
        return "NOT_FOUND";
      }

      const opts: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        buttons: 1,
      };

      const { highlightElement } = w.__dustUtils;

      highlightElement(element);

      element.dispatchEvent(new MouseEvent("mouseover", opts));
      element.dispatchEvent(new MouseEvent("mousedown", opts));
      element.dispatchEvent(new MouseEvent("mouseup", opts));
      element.dispatchEvent(new MouseEvent("click", opts));

      return "OK";
    },
  });

  const result = execution?.result;

  if (!result) {
    return new Err(new Error("Unexpected error"));
  }

  if (result === "NOT_FOUND") {
    return new Err(new Error("Element not found"));
  }
  return new Ok(true);
}
