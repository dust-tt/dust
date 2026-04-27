// Slack/Claude-style chat card for the hero scene. Mounts inside an SVG
// <foreignObject> anchored to a person or agent group so the card follows
// the speaker. Supports a typewriter animation, inline @mentions and
// **bold**, * bullet lines, > closer lines, and a reactions footer where
// emojis arc in from other cast members.

// biome-ignore-all lint/suspicious/noExplicitAny: the engine threads ad-hoc
// fields through SVG/HTML elements (e.g. _chatCard, _planX). Typing them
// would require a parallel WeakMap and gain little.

import { SVG_NS } from "@app/components/home/content/Product/heroOfficeIso";
import type { AgentDef } from "@app/components/home/content/Product/heroOfficeScenario";

// ---------------------------------------------------------------------------
// Avatar builders for the chat card header. The card's user avatar is a
// 42px CSS-styled HTML disc with the teammate's photo as background; the
// agent avatar is the same disc with an embedded sparkle robot SVG instead.
// ---------------------------------------------------------------------------

/** Inline sparkle-robot SVG used as the agent's chat-card avatar glyph. */
const AGENT_AVATAR_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><circle cx="9" cy="13" r="1.2" fill="white" stroke="none"/><circle cx="15" cy="13" r="1.2" fill="white" stroke="none"/><path d="M12 4v3"/><circle cx="12" cy="3.4" r="1" fill="white" stroke="none"/></svg>';

/** Build the chat card's user avatar (40px disc with the teammate photo). */
export function buildChatCardUserAvatar(photoUrl?: string): HTMLDivElement {
  const avatar = document.createElement("div");
  avatar.className = "chat-card-avatar";
  if (photoUrl) {
    avatar.style.backgroundImage = `url("${photoUrl}")`;
  }
  return avatar;
}

/** Build the chat card's agent avatar (blue disc with the robot glyph). */
export function buildChatCardAgentAvatar(): HTMLDivElement {
  const avatar = document.createElement("div");
  avatar.className = "chat-card-avatar agent-avatar";
  avatar.innerHTML = AGENT_AVATAR_SVG;
  return avatar;
}

// ---------------------------------------------------------------------------
// Tokenizer for chat-card body copy.
// Recognized inline syntax:
//   **bold**          -> bold span
//   @mention          -> .mention chip (.agent-mention if it references an
//                        agent, e.g. "@QualBot")
//   * bullet at line start -> bullet item
//   > closer at line start -> closer block
// ---------------------------------------------------------------------------

export function parseRichMessage(msg: string): any[] {
  const tokens: any[] = [];
  const lines = msg.split("\n");
  lines.forEach((line, li) => {
    let isBullet = false;
    let isCloser = false;
    if (line.startsWith("* ")) {
      isBullet = true;
      line = line.slice(2);
    } else if (line.startsWith("> ")) {
      isCloser = true;
      line = line.slice(2);
    }
    let lineStart = true;
    const re = /(\*\*[^*]+\*\*|@[A-Za-z][A-Za-z0-9_]*)/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > lastIdx) {
        tokens.push({
          kind: "text",
          text: line.slice(lastIdx, m.index),
          isBullet: lineStart && isBullet,
          isCloser: lineStart && isCloser,
        });
        lineStart = false;
      }
      const tk = m[0];
      if (tk.startsWith("**")) {
        tokens.push({
          kind: "bold",
          text: tk.slice(2, -2),
          isBullet: lineStart && isBullet,
          isCloser: lineStart && isCloser,
        });
      } else {
        tokens.push({
          kind: "mention",
          text: tk,
          isBullet: lineStart && isBullet,
          isCloser: lineStart && isCloser,
        });
      }
      lineStart = false;
      lastIdx = re.lastIndex;
    }
    if (lastIdx < line.length) {
      tokens.push({
        kind: "text",
        text: line.slice(lastIdx),
        isBullet: lineStart && isBullet,
        isCloser: lineStart && isCloser,
      });
    } else if (lastIdx === 0 && line.length === 0) {
      tokens.push({
        kind: "text",
        text: "",
        isBullet: lineStart && isBullet,
        isCloser: lineStart && isCloser,
      });
    }
    if (li < lines.length - 1) {
      tokens.push({ kind: "newline" });
    }
  });
  return tokens;
}

// ---------------------------------------------------------------------------
// Chat card factory. The engine creates one of these per mount with shared
// timer/cleanup helpers and the cast lookup; the returned functions can
// then be called from the beat runner.
// ---------------------------------------------------------------------------

export interface ChatCardDeps {
  /** Tracked setTimeout from the engine — calls get cleared on unmount. */
  trackedSetTimeout: (cb: () => void, ms: number) => number;
  /** Tracked setInterval from the engine — calls get cleared on unmount. */
  trackedSetInterval: (cb: () => void, ms: number) => number;
  /** Set the engine cleans up at unmount; flying-emoji nodes register here. */
  flyNodes: Set<HTMLElement>;
  /** Resolves a cast `ref` to its SVG <g> for reaction sourcing. */
  castByRef: Record<string, any>;
}

export interface ChatCardOptions {
  holdMs?: number;
  maxChars?: number;
  isAgent?: boolean;
  name?: string;
  role?: string;
  avatar?: string;
}

export interface Reaction {
  from: string;
  emoji: string;
  at?: number;
}

export interface ChatCardModule {
  showChatCard: (
    hostEl: any,
    msg: string,
    opts?: ChatCardOptions
  ) => Promise<void>;
  showAgentCard: (
    agent: { el: any; def: AgentDef },
    msg: string,
    opts?: { holdMs?: number; maxChars?: number }
  ) => Promise<void>;
  scheduleReactions: (
    targetEl: any,
    reactions: Reaction[],
    baseDelayMs?: number,
    isAgent?: boolean
  ) => void;
}

export function createChatCard(deps: ChatCardDeps): ChatCardModule {
  const { trackedSetTimeout, trackedSetInterval, flyNodes, castByRef } = deps;

  function showChatCard(
    hostEl: any,
    msg: string,
    opts: ChatCardOptions = {}
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const existing = hostEl.querySelector(".chat-card-fo");
      if (existing) {
        existing.remove();
      }

      const isAgent = !!opts.isAgent;
      const maxChars = opts.maxChars || 38;
      const lines = msg.split("\n");
      const longest = lines.reduce(
        (m: number, l: string) => Math.max(m, l.replace(/\*\*/g, "").length),
        0
      );
      const cardW = Math.max(360, Math.min(560, longest * 10 + 80));
      const bodyLines =
        Math.max(1, Math.ceil(msg.length / (maxChars * 1.2))) +
        (msg.match(/\n/g) || []).length;
      const cardH = 120 + bodyLines * 28 + 60;

      const fo = document.createElementNS(SVG_NS, "foreignObject");
      fo.setAttribute("class", "chat-card-fo");
      fo.setAttribute("x", String(-cardW / 2));
      const foBottom = -24;
      const foTop = foBottom - cardH;
      fo.setAttribute("y", String(foTop));
      fo.setAttribute("width", String(cardW));
      fo.setAttribute("height", String(cardH));
      fo.setAttribute("overflow", "visible");

      const wrap = document.createElement("div");
      wrap.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      wrap.style.cssText =
        "width:100%;height:100%;pointer-events:none;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;";
      fo.appendChild(wrap);

      const card = document.createElement("div");
      card.className = "chat-card" + (isAgent ? " agent-card" : "");
      card.style.width = "100%";
      wrap.appendChild(card);

      const header = document.createElement("div");
      header.className = "chat-card-header";
      card.appendChild(header);

      const avatar = isAgent
        ? buildChatCardAgentAvatar()
        : buildChatCardUserAvatar(opts.avatar);
      header.appendChild(avatar);

      const meta = document.createElement("div");
      meta.className = "chat-card-meta";
      const nameEl = document.createElement("div");
      nameEl.className = "chat-card-name";
      nameEl.textContent = opts.name || "";
      meta.appendChild(nameEl);
      const roleEl = document.createElement("div");
      roleEl.className = "chat-card-role";
      roleEl.innerHTML = `${opts.role || ""}<span class="dot">·</span>just now`;
      meta.appendChild(roleEl);
      header.appendChild(meta);

      const body = document.createElement("div");
      body.className = "chat-card-body";
      card.appendChild(body);

      const rx = document.createElement("div");
      rx.className = "chat-card-reactions";
      card.appendChild(rx);

      hostEl.appendChild(fo);
      card.style.transformOrigin = "50% 100%";
      try {
        card.animate(
          [
            { opacity: 0, transform: "scale(0.2)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          {
            duration: 420,
            easing: "cubic-bezier(.2,.9,.3,1)",
            fill: "forwards",
          } as KeyframeAnimationOptions
        );
      } catch (_e) {
        /* noop */
      }

      hostEl._chatCard = { card, reactions: rx, fo };

      const tokens = parseRichMessage(msg);
      let tokIdx = 0;
      let charIdx = 0;
      let curTextNode: Text | null = null;
      let curLine: HTMLElement = body;
      const caret = document.createElement("span");
      caret.className = "chat-card-caret";

      function beginLine(token: any) {
        if (token.isBullet) {
          let ul = body.querySelector("ul");
          if (!ul || (body.lastChild as HTMLElement).tagName !== "UL") {
            ul = document.createElement("ul");
            body.appendChild(ul);
          }
          const li = document.createElement("li");
          ul.appendChild(li);
          curLine = li;
        } else if (token.isCloser) {
          const p = document.createElement("div");
          p.className = "closer";
          body.appendChild(p);
          curLine = p;
        } else {
          const p = document.createElement("div");
          p.className = "line";
          body.appendChild(p);
          curLine = p;
        }
      }

      function writeSpan(token: any): Text {
        let el: HTMLElement;
        if (token.kind === "mention") {
          el = document.createElement("span");
          el.className =
            "mention" +
            (token.text.toLowerCase().includes("qualbot")
              ? " agent-mention"
              : "");
        } else if (token.kind === "bold") {
          el = document.createElement("strong");
        } else {
          el = document.createElement("span");
        }
        curLine.appendChild(el);
        const tn = document.createTextNode("");
        el.appendChild(tn);
        return tn;
      }

      beginLine(tokens[0] || { kind: "text", text: "" });
      curLine.appendChild(caret);

      const typeTimer = trackedSetInterval(
        () => {
          if (tokIdx >= tokens.length) {
            clearInterval(typeTimer);
            if (caret.parentNode) {
              caret.parentNode.removeChild(caret);
            }
            trackedSetTimeout(() => {
              let fadeAnim: Animation | undefined;
              try {
                fadeAnim = card.animate(
                  [
                    { opacity: 1, transform: "scale(1)" },
                    { opacity: 0, transform: "scale(0.2)" },
                  ],
                  {
                    duration: 280,
                    easing: "cubic-bezier(.4,0,.6,1)",
                    fill: "forwards",
                  } as KeyframeAnimationOptions
                );
              } catch (_e) {
                /* noop */
              }
              const done = () => {
                fo.remove();
                hostEl._chatCard = null;
                resolve();
              };
              if (fadeAnim) {
                fadeAnim.onfinish = done;
              } else {
                trackedSetTimeout(done, 260);
              }
            }, opts.holdMs || 2200);
            return;
          }
          const tok = tokens[tokIdx];
          if (tok.kind === "newline") {
            tokIdx++;
            charIdx = 0;
            curTextNode = null;
            const next = tokens[tokIdx];
            if (next) {
              beginLine(next);
            }
            if (caret.parentNode) {
              caret.parentNode.removeChild(caret);
            }
            curLine.appendChild(caret);
            return;
          }
          if (!curTextNode) {
            curTextNode = writeSpan(tok);
            if (caret.parentNode) {
              caret.parentNode.removeChild(caret);
            }
            curLine.appendChild(caret);
          }
          if (charIdx < tok.text.length) {
            charIdx++;
            if (curTextNode) {
              curTextNode.data = tok.text.slice(0, charIdx);
            }
            if (caret.parentNode) {
              caret.parentNode.removeChild(caret);
            }
            curLine.appendChild(caret);
          } else {
            tokIdx++;
            charIdx = 0;
            curTextNode = null;
          }
        },
        18 + Math.random() * 10
      );
    });
  }

  function chatCardFor(targetEl: any) {
    return targetEl._chatCard || null;
  }

  function bubbleAnchorFor(targetEl: any): { x: number; y: number } {
    const cc = chatCardFor(targetEl);
    if (cc) {
      const r = cc.card.getBoundingClientRect();
      return { x: r.left + r.width * 0.25, y: r.bottom - 18 };
    }
    const r = targetEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top };
  }

  function addReactionPill(
    targetEl: any,
    emoji: string,
    _isAgent: boolean
  ): HTMLElement | null {
    const cc = chatCardFor(targetEl);
    if (!cc) {
      return null;
    }
    const existing = cc.reactions.querySelector(
      `.react-pill[data-em="${emoji}"]`
    );
    if (existing) {
      const countEl = existing.querySelector(".count") as HTMLElement;
      const n = (parseInt(countEl.textContent || "1", 10) || 1) + 1;
      countEl.textContent = String(n);
      existing.style.animation = "none";
      // Force a reflow so the restarted animation actually plays.
      void existing.offsetHeight;
      existing.style.animation = "";
      return existing;
    }
    const pill = document.createElement("span");
    pill.className = "react-pill";
    pill.dataset.em = emoji;
    pill.innerHTML = `<span class="em">${emoji}</span><span class="count">1</span>`;
    cc.reactions.appendChild(pill);
    return pill;
  }

  function flyReaction(
    reactorEl: any,
    targetEl: any,
    emoji: string,
    isAgent: boolean
  ) {
    const from = reactorEl.getBoundingClientRect();
    const to = bubbleAnchorFor(targetEl);
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;

    const fly = document.createElement("div");
    fly.className = "dust-floor-fly-emoji";
    fly.textContent = emoji;
    fly.style.left = fx + "px";
    fly.style.top = fy + "px";
    fly.style.opacity = "0";
    document.body.appendChild(fly);
    flyNodes.add(fly);

    const peakX = (fx + to.x) / 2;
    const peakY = Math.min(fy, to.y) - 60;

    const anim = fly.animate(
      [
        {
          left: fx + "px",
          top: fy + "px",
          opacity: 0,
          transform: "translate(-50%,-50%) scale(0.3)",
        },
        {
          opacity: 1,
          transform: "translate(-50%,-50%) scale(1.25)",
          offset: 0.2,
        },
        {
          left: peakX + "px",
          top: peakY + "px",
          transform: "translate(-50%,-50%) scale(1.1)",
          offset: 0.55,
        },
        {
          left: to.x + "px",
          top: to.y + "px",
          opacity: 1,
          transform: "translate(-50%,-50%) scale(0.75)",
        },
      ],
      {
        duration: 850,
        easing: "cubic-bezier(.4,0,.2,1)",
        fill: "forwards",
      } as KeyframeAnimationOptions
    );

    anim.onfinish = () => {
      flyNodes.delete(fly);
      fly.remove();
      addReactionPill(targetEl, emoji, isAgent);
    };
  }

  function scheduleReactions(
    targetEl: any,
    reactions: Reaction[],
    baseDelayMs = 0,
    isAgent = false
  ) {
    for (const r of reactions) {
      trackedSetTimeout(
        () => {
          const reactor = castByRef[r.from];
          if (!reactor) {
            return;
          }
          flyReaction(reactor, targetEl, r.emoji, isAgent);
        },
        baseDelayMs + (r.at || 0)
      );
    }
  }

  function showAgentCard(
    agent: { el: any; def: AgentDef },
    msg: string,
    opts: { holdMs?: number; maxChars?: number } = {}
  ): Promise<void> {
    const def = agent.def;
    return showChatCard(agent.el, msg, {
      holdMs: opts.holdMs,
      maxChars: opts.maxChars,
      // Strip leading "@" from the label for the card title
      name: def.label.replace(/^@/, ""),
      role: def.cardRole,
      isAgent: true,
    });
  }

  return { showChatCard, showAgentCard, scheduleReactions };
}
