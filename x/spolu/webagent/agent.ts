import { chromium, Page, Browser, BrowserContext } from "playwright";
import { v4 as uuidv4 } from "uuid";
import { JSDOM } from "jsdom";

/**
 * TextDOM methods
 */

type TextDOM = {
  nodeType: "text" | "clickable" | "input" | "image" | null;
  element: Element;
  text: string | null;
  value: string | null;
  selector: string | null;
  children: TextDOM[];
};

type SelectorMap = {
  clickable: Map<string, number>;
  input: Map<string, number>;
  image: Map<string, number>;
};

type IdentifierMap = Record<string, string>;

const renderTree = (
  node: TextDOM | null,
  indent: string,
  selectorMap: SelectorMap
): { render: string; identifiers: IdentifierMap } => {
  if (!node) {
    return { render: "", identifiers: {} };
  }
  let lines: string[] = [];
  let identifiers: IdentifierMap = {};
  if (node.nodeType !== null) {
    let out = "";
    switch (node.nodeType) {
      case "text":
        out = `[t]${node.text ? ` ${node.text}` : ""}`;
        break;
      case "clickable":
        out = `[c${selectorMap.clickable.get(node.selector!)}]${
          node.text ? ` ${node.text}` : ""
        }`;
        identifiers[`c${selectorMap.clickable.get(node.selector!)}`] =
          node.selector!;
        break;
      case "input":
        out = `[i${selectorMap.input.get(node.selector!)}]${
          node.text ? ` ${node.text}` : ""
        }`;
        identifiers[`i${selectorMap.input.get(node.selector!)}`] =
          node.selector!;
        if (node.value) {
          out += ` {value: "${node.value}"}`;
        }
        break;
      case "image":
        out = `[v${selectorMap.image.get(node.selector!)}]${
          node.text ? ` ${node.text}` : ""
        }`;
        identifiers[`v${selectorMap.image.get(node.selector!)}`] =
          node.selector!;
        break;
    }
    if (out) {
      lines.push(`${indent}${out}`);
    }
  }

  const hasNonNullChild = node.children.some(
    (child) => child.nodeType !== null
  );
  const childIndent = hasNonNullChild ? indent + "  " : indent;

  node.children.forEach((child) => {
    const { render: childRender, identifiers: childIdentifiers } = renderTree(
      child,
      childIndent,
      selectorMap
    );
    if (childRender) {
      lines.push(childRender);
    }
    identifiers = { ...identifiers, ...childIdentifiers };
  });

  return { render: lines.join("\n"), identifiers };
};

const buildSelectorMap = (node: TextDOM): SelectorMap => {
  const maps: SelectorMap = {
    clickable: new Map(),
    input: new Map(),
    image: new Map(),
  };

  const traverse = (node: TextDOM) => {
    if (node.selector) {
      const map = maps[node.nodeType as keyof SelectorMap];
      if (map) {
        map.set(node.selector, map.size + 1);
      }
    }
    node.children.forEach(traverse);
  };

  traverse(node);
  return maps;
};

type Session = {
  id: string;
  browser: Browser;
  context: BrowserContext;
  url: string;
  page: Page;
};

/**
 * Session methods
 */

const generateSelector = (element: Element): string => {
  const path: string[] = [];
  let current: Element | null = element;

  while (current) {
    let selector = current.tagName.toLowerCase();

    // Add id if present
    if (current.id) {
      path.unshift(`[id="${current.id}"]`);
      // path.unshift(`#${current.id}`);
      break; // ID is unique, no need to go further up
    }

    // Add classes if present
    const classes = Array.from(current.classList)
      .filter((c) => !c.startsWith("clickable-") && !c.startsWith("input-"))
      .map((c) => c.replace(/:/g, "\\:"))
      .map((c) => c.replace(/\.(\d+)/g, "\\.$1")); // Escape decimal points in class names
    if (classes.length) {
      selector += `.${classes.join(".")}`;
    }

    // Add nth-of-type for uniqueness among siblings
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (el) => el.tagName === current!.tagName
      );
      const index = siblings.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(" > ");
};

const CLICKABLE_INPUTS = [
  "button",
  "checkbox",
  // "color",
  // "file",
  // "image",
  "radio",
  "reset",
  "submit",
];

const FILLABLE_INPUTS = [
  "date",
  "datetime-local",
  "email",
  "month",
  "number",
  "password",
  "range",
  "search",
  "tel",
  "text",
  "time",
  "url",
  "week",
  "",
];

const textDOMFromSession = async (
  session: Session
): Promise<{ tree: TextDOM; selectorMap: SelectorMap }> => {
  const traverseDOM = async (
    element: Element,
    tree: TextDOM,
    depth: number = 0
  ) => {
    const skipTags = ["SCRIPT", "STYLE"];
    if (skipTags.includes(element.tagName)) {
      return;
    }

    // Process all child nodes in order
    for (const node of Array.from(element.childNodes)) {
      if (skipTags.includes(node.nodeName)) {
        return;
      }

      let child: TextDOM | null = null;

      if (node.nodeType === 3) {
        // [t]
        const text = node.textContent?.trim();
        if (text?.length) {
          child = {
            nodeType: "text",
            element: node.parentElement!,
            text,
            value: null,
            selector: null,
            children: [],
          };
          tree.children.push(child);
        }
      } else if (node.nodeType === 1) {
        // [v] | [c] | [i] | null
        const el = node as Element;

        if (el.tagName === "IMG") {
          // [v]
          let text = el.getAttribute("alt") || null;
          child = {
            nodeType: "image",
            element: el,
            text,
            value: null,
            selector: generateSelector(el),
            children: [],
          };
        } else if (
          // [c]
          el.tagName === "A" ||
          el.tagName === "BUTTON" ||
          el.getAttribute("role") === "button" ||
          // el.getAttribute("tabindex") ||
          el.getAttribute("onclick") ||
          (el as HTMLElement).onclick ||
          (el.tagName === "INPUT" &&
            CLICKABLE_INPUTS.includes(el.getAttribute("type") || ""))
        ) {
          const ariaLabel = el.getAttribute("aria-label");
          child = {
            nodeType: "clickable",
            element: el,
            text: ariaLabel, // Use aria-label as text if available
            value: null,
            selector: generateSelector(el),
            children: [],
          };
        } else if (
          // [i]
          el.tagName === "TEXTAREA" ||
          el.getAttribute("contenteditable") === "true" ||
          (el.tagName === "INPUT" &&
            FILLABLE_INPUTS.includes(el.getAttribute("type") || ""))
        ) {
          const selector = generateSelector(el);
          const placeholder =
            el.getAttribute("placeholder") ||
            el.getAttribute("aria-label") ||
            el.getAttribute("data-placeholder") ||
            null;
          // console.log("SELECTOR", selector);
          // console.log("PLACEHOLDER", placeholder);
          // console.log(el);
          let value: string | null = null;
          try {
            value = await session.page.evaluate((sel) => {
              const el = document.querySelector(sel) as HTMLInputElement;
              return el ? el.value : null;
            }, selector);
          } catch (e) {
            console.log("ERROR FETCHING VALUE", e);
          }
          // const value = await session.page.locator(selector).inputValue();
          // console.log("VALUE", value);
          child = {
            nodeType: "input",
            element: el,
            text: placeholder, // Use placeholder as text if available
            value,
            selector,
            children: [],
          };
          // TODO(spolu): handle select
        } else {
          const placeholder =
            el.getAttribute("placeholder") ||
            el.getAttribute("aria-label") ||
            el.getAttribute("data-placeholder") ||
            null;
          // null
          child = {
            nodeType: placeholder ? "text" : null,
            element: el,
            text: placeholder,
            value: null,
            selector: null,
            children: [],
          };
        }

        // Add child to tree.
        tree.children.push(child);

        // Recursively traverse children element/tree: el/child.
        await traverseDOM(el, child, depth + 1);
      }
    }
  };

  try {
    // Sometime we end up here while navigating, wait again.
    await session.page.waitForLoadState("domcontentloaded", { timeout: 5000 });
  } catch (_) {}
  const content = await session.page.content();
  const parsedDOM = new JSDOM(content);
  const document = parsedDOM.window.document;

  let body: TextDOM = {
    nodeType: null,
    element: document.body,
    text: null,
    value: null,
    selector: null,
    children: [],
  };
  await traverseDOM(document.body, body, 0);

  return { tree: body, selectorMap: buildSelectorMap(body) };
};

const closeSession = async (session: Session): Promise<void> => {
  await session.browser.close();
};

const startSession = async (url: string): Promise<Session> => {
  let browser: Browser | null = null;
  if (process.env.CDP_URL) {
    browser = await chromium.connectOverCDP(process.env.CDP_URL || "");
  } else {
    browser = await chromium.launch();
  }
  const context = await browser.newContext();
  const page: Page = await context.newPage();
  await page.goto(url);
  return { id: uuidv4(), browser, context, url, page };
};

const useInput = async (
  session: Session,
  selector: string,
  value: string,
  enter: boolean
): Promise<void> => {
  try {
    console.log(">> INPUT", selector, value, enter);
    await session.page.type(selector, value, { timeout: 10000 });
    if (enter) {
      await session.page.press(selector, "Enter");
    }
  } catch (e) {
    console.log("INPUT failed:", e);
  }
};

const useClick = async (session: Session, selector: string) => {
  try {
    console.log(">> CLICK", selector);
    // try {
    //   await session.page.waitForSelector(selector, {
    //     state: "visible",
    //     timeout: 2000,
    //   });
    //   console.log("Element visible");
    // } catch (e) {
    //   console.log("Element not visible:", e);
    // }

    // const result = await session.page.evaluate((sel: string) => {
    //   const element = document.querySelector(sel);
    //   return {
    //     found: !!element,
    //     tag: element?.tagName,
    //     id: element?.id,
    //     isVisible:
    //       element instanceof HTMLElement
    //         ? window.getComputedStyle(element).display !== "none"
    //         : false,
    //   };
    // }, selector);

    // console.log("Element debug:", result);
    await session.page.click(selector, {
      // force: true,
      timeout: 5000,
    });
  } catch (e) {
    console.log("CLICK failed:", e);
  }
};

const useWait = async (session: Session, seconds: number): Promise<void> => {
  console.log(">> WAIT", seconds);
  await session.page.waitForTimeout(seconds * 1000);
};

const useGoto = async (session: Session, url: string): Promise<void> => {
  console.log(">> GOTO", url);
  await session.page.goto(url);
};

/**
 * Agent loop
 */

type AgentAction =
  | {
      type: "click";
      identifier: string;
    }
  | {
      type: "input";
      identifier: string;
      value: string;
      enter: boolean;
    }
  | {
      type: "wait";
      seconds: number;
    }
  | {
      type: "goto";
      url: string;
    }
  | {
      type: "success";
      output: string;
    }
  | {
      type: "fail";
      reason: string;
    };

const runWebAgentDustApp = async (input: any) => {
  const res = await fetch(
    "https://dust.tt/api/v1/w/0ec9852c2f/spaces/vlt_ZqMdUAzI0OTf/apps/wiG964FakA/runs",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DUST_PROD_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        specification_hash:
          "26fe18b5463a9150ea6f0c4b5caf2204e7d340b604a8d438a2627b43803e1133",
        config: {
          MODEL: {
            provider_id: "anthropic",
            model_id: "claude-3-5-haiku-20241022",
            function_call: "any",
            use_cache: false,
          },
        },
        blocking: true,
        inputs: [input],
      }),
    }
  );
  return await res.json();
};

type History = {
  url: string;
  actions: AgentAction[];
}[];

const runAgent = async (
  task: string,
  history: History,
  url: string,
  session: Session | null
): Promise<{ actions: AgentAction[]; identifiers: IdentifierMap }> => {
  const { tree, selectorMap } = session
    ? await textDOMFromSession(session)
    : {
        tree: null,
        selectorMap: {
          clickable: new Map(),
          input: new Map(),
          image: new Map(),
        },
      };
  const { render, identifiers } = renderTree(tree, "", selectorMap);

  const h = history.map((h) => {
    let s = h.url + "\n";
    for (const action of h.actions) {
      switch (action.type) {
        case "click":
          s += `  > click ${action.identifier}\n`;
          break;
        case "input":
          s += `  > input ${action.identifier} value="${action.value}" enter=${action.enter}\n`;
          break;
        case "wait":
          s += `  > wait seconds=${action.seconds}\n`;
          break;
        case "goto":
          s += `  > goto ${action.url}\n`;
          break;
      }
    }
    return s;
  });

  console.log(`URL: ${url}`);
  console.log(`TEXT_DOM:\n${tree ? render : "(empty)"}`);
  console.log(`HISTORY\n${h.join("")}`);
  // console.log("IDENTIFIERS", identifiers);

  const input = {
    task,
    url,
    textDOM: render,
    history: h,
  };

  const out = await runWebAgentDustApp(input);
  if (
    !(
      out.run.results.length === 1 &&
      out.run.results[0].length === 1 &&
      out.run.results[0][0].value &&
      out.run.results[0][0].value.message &&
      out.run.results[0][0].value.message.function_calls.length > 0
    )
  ) {
    throw new Error("Invalid response from agent");
  }

  const calls = out.run.results[0][0].value.message.function_calls;

  return {
    actions: calls.map((call: any) => {
      const args = JSON.parse(call.arguments);
      switch (call.name) {
        case "click":
          return { type: "click", identifier: args.identifier };
        case "input":
          return {
            type: "input",
            identifier: args.identifier,
            value: args.value,
            enter: args.enter,
          };
        case "wait":
          return { type: "wait", seconds: args.seconds };
        case "goto":
          return { type: "goto", url: args.url };
        case "success":
          return { type: "success", output: args.output };
        case "fail":
          return { type: "fail", output: args.reason };
        default:
          throw new Error("Invalid function call");
      }
    }),
    identifiers,
  };
};

/**
 * Main
 */

(async () => {
  const task = process.argv[2] || "";
  if (!task) {
    console.error("Usage: npx tsx agent.ts '<task>'");
    process.exit(1);
  }
  console.log("TASK", task);

  let session: Session | null = null;
  const history: History = [];
  try {
    let success = false;

    while (!success) {
      if (session) {
        try {
          await session.page.waitForLoadState("load", { timeout: 5000 });
        } catch (_) {}
        try {
          await session.page.waitForLoadState("networkidle", { timeout: 5000 });
        } catch (_) {}
        // try {
        //   await session?.page.waitForTimeout(10000);
        // } catch (_) {}
      }

      const url = session ? session.page.url() : "about:blank";
      const { actions, identifiers } = await runAgent(
        task,
        history,
        url,
        session
      );

      console.log("ACTIONS", actions);

      let interrupt = false;
      const executedActions = [];

      for (const action of actions) {
        if (interrupt) {
          break;
        }
        switch (action.type) {
          case "click":
            if (session) {
              await useClick(session, identifiers[action.identifier]);
              executedActions.push(action);
              interrupt = true;
            }
            break;
          case "input":
            if (session) {
              await useInput(
                session,
                identifiers[action.identifier],
                action.value,
                action.enter
              );
              executedActions.push(action);
              if (action.enter) {
                interrupt = true;
              }
            }
            break;
          case "wait":
            if (session) {
              await useWait(session, action.seconds);
              executedActions.push(action);
            }
            break;
          case "goto":
            if (!session) {
              session = await startSession(action.url);
            } else {
              await useGoto(session, action.url);
              executedActions.push(action);
            }
            executedActions.push(action);
            interrupt = true;
            break;
          case "success":
            console.log(">> SUCCESS\n", action.output);
            success = true;
            interrupt = true;
            break;
          case "fail":
            console.log(">> FAIL\n", action.reason);
            success = true;
            interrupt = true;
            break;
        }
      }

      history.push({ url, actions: executedActions });
    }
  } catch (e) {
    console.log("ERROR", e);
  } finally {
    if (session) {
      await closeSession(session);
    }
  }
})();

// TODO(spolu) add support for select
// TODO(spolu) add notes
