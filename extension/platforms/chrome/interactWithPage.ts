import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { ensureDustPageUtils } from "./pageUtils";

type ElementSnapshot = {
  elementId: string;
  tag: string;
  type: "content" | "interactive";
  role: string;
  name: string;
  inputType: string | null;
  value?: string;
  checked?: boolean;
  coords: { x: number; y: number };
};

type DustWindow = {
  __dustUtils: {
    selector: string;
    CONTENT: string[];
    getElementName: (el: HTMLElement) => string;
    highlightElement: (el: HTMLElement) => void;
    getElementCheckedStatus: (el: HTMLElement) => boolean | null;
    getElementValue: (el: HTMLElement) => string | null;
  };
  __dustElementMap: Record<string, WeakRef<HTMLElement>>;
  __dustElementSnapshots: Record<string, ElementSnapshot>;
  __dustElementIdCounter: number;
};

const HAS_FORM_THRESHOLD = 10;

export async function checkHasForm(
  tab: chrome.tabs.Tab | undefined
): Promise<Result<boolean, Error>> {
  if (!tab?.id) {
    return new Err(new Error("Tab not found."));
  }

  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [HAS_FORM_THRESHOLD],
    func: (threshold: number) => {
      const selector = "input, textarea, select";
      const nodes = document.querySelectorAll<HTMLElement>(selector);

      if (nodes.length < threshold) {
        return "NO_FORM";
      }

      return "HAS_FORM";
    },
  });

  const result =
    execution && typeof execution.result === "string"
      ? execution.result === "HAS_FORM"
        ? true
        : false
      : false;

  return new Ok(result);
}

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
      const {
        selector,
        CONTENT,
        getElementName,
        getElementCheckedStatus,
        getElementValue,
      } = w.__dustUtils;

      // Initialize maps only if they don't exist yet — preserve existing IDs
      if (!w.__dustElementMap) {
        w.__dustElementMap = {};
      }
      if (!w.__dustElementSnapshots) {
        w.__dustElementSnapshots = {};
      }
      if (!w.__dustElementIdCounter) {
        w.__dustElementIdCounter = 0;
      }

      const elementPrefix = `el_${tabId.toString(36)}_`;

      // Build reverse map: DOM node → existing elementId
      const domNodeToId = new Map<HTMLElement, string>();
      for (const [elementId, weakRef] of Object.entries(w.__dustElementMap)) {
        const el = weakRef.deref();
        if (el) {
          domNodeToId.set(el, elementId);
        }
      }

      let counter = w.__dustElementIdCounter;
      const elements: ElementSnapshot[] = [];
      const seenIds = new Set<string>();

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

        const tag = el.tagName.toLowerCase();
        const checked = getElementCheckedStatus(el);
        const value = getElementValue(el);

        // Reuse existing ID if this DOM node was already tracked
        const existingId = domNodeToId.get(el);
        let elementId: string;

        if (existingId !== undefined) {
          elementId = existingId;
        } else {
          do {
            elementId = `${elementPrefix}${counter++}`;
          } while (w.__dustElementMap[elementId] !== undefined);
          w.__dustElementMap[elementId] = new WeakRef<HTMLElement>(el);
        }

        seenIds.add(elementId);

        const snapshot: ElementSnapshot = {
          elementId,
          tag,
          type: CONTENT.includes(tag) ? "content" : "interactive",
          role: el.getAttribute("role") ?? tag,
          name: getElementName(el),
          inputType: el.getAttribute("type"),
          ...(checked !== null ? { checked } : {}),
          ...(value !== null ? { value } : {}),
          coords: {
            x: Math.round(rect.x + rect.width / 2 + window.scrollX),
            y: Math.round(rect.y + rect.height / 2 + window.scrollY),
          },
        };

        w.__dustElementSnapshots[elementId] = snapshot;
        elements.push(snapshot);
      });

      w.__dustElementIdCounter = counter;

      // Clean up entries for elements no longer in the DOM
      for (const elementId of Object.keys(w.__dustElementMap)) {
        if (!seenIds.has(elementId)) {
          delete w.__dustElementMap[elementId];
          delete w.__dustElementSnapshots[elementId];
        }
      }

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
  tab: chrome.tabs.Tab | undefined,
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

export async function typeText(
  tab: chrome.tabs.Tab | undefined,
  elementId: string,
  text: string,
  variant: "replace" | "append" | "delete"
): Promise<Result<boolean, Error>> {
  if (!tab?.id) {
    return new Err(new Error("Tab not found."));
  }

  const utilsResult = await ensureDustPageUtils(tab);
  if (utilsResult.isErr()) {
    return utilsResult;
  }

  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [elementId, text, variant],
    func: (
      elementId: string,
      text: string,
      variant: "replace" | "append" | "delete"
    ):
      | "OK"
      | "NOT_FOUND"
      | "SETTER_NOT_FOUND"
      | "SELECTION_UNAVAILABLE"
      | "OPTION_NOT_FOUND"
      | "UNSUPPORTED_ELEMENT" => {
      const w = window as unknown as DustWindow;

      const element = w.__dustElementMap?.[elementId].deref();
      if (!element) {
        return "NOT_FOUND";
      }

      const { highlightElement } = w.__dustUtils;

      highlightElement(element);

      const tag = element.tagName.toLowerCase();

      if (tag === "input" || tag === "textarea") {
        const proto =
          tag === "input"
            ? HTMLInputElement.prototype
            : HTMLTextAreaElement.prototype;

        const nativeSetter = Object.getOwnPropertyDescriptor(
          proto,
          "value"
        )?.set;
        if (!nativeSetter) {
          return "SETTER_NOT_FOUND";
        }

        element.focus();

        if (variant === "delete") {
          nativeSetter.call(element, "");
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          return "OK";
        }

        const baseValue =
          variant === "append"
            ? (element as HTMLInputElement | HTMLTextAreaElement).value
            : "";

        let current = baseValue;
        for (const char of text) {
          current += char;
          nativeSetter.call(element, current);
          element.dispatchEvent(new Event("input", { bubbles: true }));
        }
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return "OK";
      }

      if (
        element.getAttribute("role") === "combobox" ||
        element.getAttribute("role") === "searchbox"
      ) {
        const inner = element.querySelector<HTMLInputElement>("input");
        if (inner) {
          const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          )?.set;
          if (!nativeSetter) {
            return "SETTER_NOT_FOUND";
          }

          inner.focus();

          if (variant === "delete") {
            nativeSetter.call(inner, "");
            inner.dispatchEvent(new Event("input", { bubbles: true }));
            inner.dispatchEvent(new Event("change", { bubbles: true }));
            return "OK";
          }

          const baseValue = variant === "append" ? inner.value : "";
          let current = baseValue;
          for (const char of text) {
            current += char;
            nativeSetter.call(inner, current);
            inner.dispatchEvent(new Event("input", { bubbles: true }));
          }
          inner.dispatchEvent(new Event("change", { bubbles: true }));
          return "OK";
        }
        // No inner input — fall through to contenteditable check
      }

      if (element.isContentEditable) {
        element.focus();

        const sel = window.getSelection();
        if (!sel) {
          return "SELECTION_UNAVAILABLE";
        }

        const range = document.createRange();
        range.selectNodeContents(element);

        if (variant === "append") {
          range.collapse(false);
        }

        sel.removeAllRanges();
        sel.addRange(range);

        if (variant === "delete") {
          element.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Backspace",
              code: "Backspace",
              keyCode: 8,
              bubbles: true,
              cancelable: true,
            })
          );
          element.dispatchEvent(
            new InputEvent("beforeinput", {
              inputType: "deleteContentBackward",
              bubbles: true,
              cancelable: true,
            })
          );

          range.deleteContents();

          element.dispatchEvent(
            new InputEvent("input", {
              inputType: "deleteContentBackward",
              bubbles: true,
            })
          );
          element.dispatchEvent(
            new KeyboardEvent("keyup", {
              key: "Backspace",
              code: "Backspace",
              keyCode: 8,
              bubbles: true,
            })
          );
          return "OK";
        }

        for (const char of text) {
          element.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: char,
              bubbles: true,
              cancelable: true,
            })
          );
          element.dispatchEvent(
            new KeyboardEvent("keypress", {
              key: char,
              bubbles: true,
              cancelable: true,
            })
          );

          // Even if deprecated execCommand works with Notion
          // while other alternatives do not
          document.execCommand("insertText", false, char);

          element.dispatchEvent(
            new InputEvent("input", {
              inputType: "insertText",
              data: char,
              bubbles: true,
            })
          );
          element.dispatchEvent(
            new KeyboardEvent("keyup", {
              key: char,
              bubbles: true,
            })
          );
        }
        return "OK";
      }

      if (tag === "select") {
        const select = element as HTMLSelectElement;

        if (variant === "delete") {
          select.value = "";
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return "OK";
        }

        const option = Array.from(select.options).find(
          (o) => o.text === text || o.value === text
        );
        if (!option) {
          return "OPTION_NOT_FOUND";
        }
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return "OK";
      }

      return "UNSUPPORTED_ELEMENT";
    },
  });

  const result = execution?.result;

  if (!result) {
    return new Err(new Error("Unexpected error"));
  }

  switch (result) {
    case "OK":
      return new Ok(true);
    case "NOT_FOUND":
      return new Err(
        new Error("Element not found. Call getPageElements first.")
      );
    case "SETTER_NOT_FOUND":
      return new Err(new Error("Could not resolve native setter for element."));
    case "SELECTION_UNAVAILABLE":
      return new Err(new Error("Could not get selection for element."));
    case "OPTION_NOT_FOUND":
      return new Err(
        new Error(`Option "${text}" not found in select element.`)
      );
    case "UNSUPPORTED_ELEMENT":
      return new Err(new Error("Element is not a supported input type."));
    default:
      assertNever(result);
  }
}

export async function getPageElementsDiff(
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

      if (!w.__dustElementMap || !w.__dustElementSnapshots) {
        return JSON.stringify({ added: [], edited: [], deleted: [] });
      }

      const {
        selector,
        CONTENT,
        getElementName,
        getElementCheckedStatus,
        getElementValue,
      } = w.__dustUtils;
      const {
        __dustElementMap: elementMap,
        __dustElementSnapshots: snapshots,
      } = w;

      const elementPrefix = `el_${tabId.toString(36)}_`;

      // ── Build reverse map: DOM node → elementId ───────────────────────────
      const domNodeToId = new Map<HTMLElement, string>();
      for (const [elementId, weakRef] of Object.entries(elementMap)) {
        const el = weakRef.deref();
        if (el) {
          domNodeToId.set(el, elementId);
        }
      }

      const added: ElementSnapshot[] = [];
      const edited: ElementSnapshot[] = [];
      const seenIds = new Set<string>();
      let counter = w.__dustElementIdCounter ?? 0;

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

        const tag = el.tagName.toLowerCase();
        const checked = getElementCheckedStatus(el);
        const value = getElementValue(el);

        const current: Omit<ElementSnapshot, "elementId"> = {
          tag,
          type: CONTENT.includes(tag) ? "content" : "interactive",
          role: el.getAttribute("role") ?? tag,
          name: getElementName(el),
          inputType: el.getAttribute("type"),
          ...(checked !== null ? { checked } : {}),
          ...(value !== null ? { value } : {}),
          coords: {
            x: Math.round(rect.x + rect.width / 2 + window.scrollX),
            y: Math.round(rect.y + rect.height / 2 + window.scrollY),
          },
        };

        const existingId = domNodeToId.get(el);

        if (existingId !== undefined) {
          seenIds.add(existingId);
          const prev = snapshots[existingId];
          const changed =
            prev.role !== current.role ||
            prev.name !== current.name ||
            prev.inputType !== current.inputType ||
            prev.checked !== current.checked ||
            prev.value !== current.value;

          if (changed) {
            const editedElement: ElementSnapshot = {
              ...current,
              elementId: existingId,
            };
            edited.push(editedElement);
            snapshots[existingId] = editedElement;
          }
        } else {
          let elementId: string;
          do {
            elementId = `${elementPrefix}${counter++}`;
          } while (elementMap[elementId] !== undefined);

          const newSnapshot: ElementSnapshot = { ...current, elementId };
          elementMap[elementId] = new WeakRef<HTMLElement>(el);
          snapshots[elementId] = newSnapshot;
          domNodeToId.set(el, elementId);
          seenIds.add(elementId);
          added.push(newSnapshot);
        }
      });

      w.__dustElementIdCounter = counter;

      // ── Deleted: tracked entries not seen in current DOM walk ─────────────
      const deleted: ElementSnapshot[] = [];
      for (const elementId of Object.keys(elementMap)) {
        if (!seenIds.has(elementId)) {
          deleted.push(snapshots[elementId]);
          delete elementMap[elementId];
          delete snapshots[elementId];
        }
      }

      return JSON.stringify({ added, edited, deleted });
    },
  });

  const result =
    execution && typeof execution.result === "string"
      ? execution.result
      : JSON.stringify({ added: [], edited: [], deleted: [] });

  return new Ok(result);
}
