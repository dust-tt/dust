// Slack/Claude-style chat card for the hero scene. Mounts inside an SVG
// <foreignObject> anchored to a person or agent group so the card follows
// the speaker. Supports a typewriter animation, inline @mentions and
// **bold**, * bullet lines, > closer lines, and a reactions footer where
// emojis arc in from other cast members.

// biome-ignore-all lint/suspicious/noExplicitAny: the engine threads ad-hoc
// fields through SVG/HTML elements (e.g. _chatCard, _planX). Typing them
// would require a parallel WeakMap and gain little.

import type { AgentDef } from "@app/components/home/content/Product/heroOfficeScenario";

// ---------------------------------------------------------------------------
// Avatar builders for the chat card header. The card's user avatar is a
// 42px CSS-styled HTML disc with the teammate's photo as background; the
// agent avatar is the same disc with an embedded sparkle robot SVG instead.
// ---------------------------------------------------------------------------

/** Sparkle-robot fallback used when an agent didn't pass a custom icon. */
const AGENT_AVATAR_FALLBACK_SVG =
  '<rect x="4" y="7" width="16" height="12" rx="3"/><circle cx="9" cy="13" r="1.2" fill="white" stroke="none"/><circle cx="15" cy="13" r="1.2" fill="white" stroke="none"/><path d="M12 4v3"/><circle cx="12" cy="3.4" r="1" fill="white" stroke="none"/>';

/** Wrap a 24x24 viewBox icon body (paths/rects/etc.) in an outer SVG sized
 *  for the chat-card avatar. Stroke + linecap shared with the floor agent. */
const wrapAgentIcon = (innerSvg: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${innerSvg}</svg>`;

/** Build the chat card's user avatar (round disc with the teammate photo).
 *  Uses a real <img> with object-fit: cover so non-square photos center-
 *  crop predictably across browsers (background-image + size:cover proved
 *  unreliable in practice — some avatars rendered with a gray strip). */
export function buildChatCardUserAvatar(photoUrl?: string): HTMLDivElement {
  const avatar = document.createElement("div");
  avatar.className = "chat-card-avatar";
  if (photoUrl) {
    const img = document.createElement("img");
    img.src = photoUrl;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    avatar.appendChild(img);
  }
  return avatar;
}

/** Build the chat card's agent avatar — either the same 24x24 viewBox icon
 *  body the floor avatar uses (rendered on the brand-blue disc), or, when
 *  `iconImage` is provided, that pre-rendered illustration filling the
 *  avatar slot directly. Keeps the floor mark and the message-bubble mark
 *  in lockstep regardless of which agent is speaking. */
export function buildChatCardAgentAvatar(
  iconSvg?: string,
  iconImage?: string
): HTMLDivElement {
  const avatar = document.createElement("div");
  if (iconImage) {
    // Image-based agent — drop the agent-avatar (blue disc) class so the
    // illustration carries the avatar's color and shape on its own.
    avatar.className = "chat-card-avatar";
    const img = document.createElement("img");
    img.src = iconImage;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    avatar.appendChild(img);
    return avatar;
  }
  avatar.className = "chat-card-avatar agent-avatar";
  avatar.innerHTML = wrapAgentIcon(iconSvg ?? AGENT_AVATAR_FALLBACK_SVG);
  return avatar;
}

// ---------------------------------------------------------------------------
// Tool brand-mark map. Add an entry here when a new logo SVG is dropped into
// /static/landing/home/tools — the chat-card parser swaps the textual chip
// for the image automatically. Tools without a mapping fall back to a text
// chip with the brand name.
// ---------------------------------------------------------------------------

const TOOL_LOGOS: Record<string, string> = {
  slack: "/static/landing/home/tools/slack.svg",
  snowflake: "/static/landing/home/tools/snowflake.svg",
  hubspot: "/static/landing/home/tools/hubspot.svg",
  notion: "/static/landing/home/tools/notion.svg",
  zendesk: "/static/landing/home/tools/zendesk.svg",
  salesforce: "/static/landing/home/tools/salesforce.svg",
  github: "/static/landing/home/tools/github.svg",
  datadog: "/static/landing/home/tools/datadog.svg",
  statuspage: "/static/landing/home/tools/statuspage.svg",
  figma: "/static/landing/home/tools/figma.svg",
  gmail: "/static/landing/home/tools/gmail.svg",
  "google docs": "/static/landing/home/tools/google-docs.svg",
  linkedin: "/static/landing/home/tools/linkedin.svg",
};

// ---------------------------------------------------------------------------
// Tokenizer for chat-card body copy.
// Recognized inline syntax:
//   **bold**          -> bold span
//   @mention          -> .mention chip (.agent-mention if it references an
//                        agent, e.g. "@QualBot")
//   {Tool}            -> .tool-chip (e.g. {Slack}, {HubSpot}, {Salesforce})
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
    // Mentions accept Unicode letters/digits so accented first names
    // (Clément, Adèle, Théo, …) and dashes (Lucien-Brun) stay inside the
    // chip instead of breaking at the first non-ASCII character.
    // Tool chips wrap brand names in braces: {Slack}, {Google Workspace}.
    const re = /(\*\*[^*]+\*\*|@\p{L}[\p{L}\p{N}_-]*|\{[^}]+\})/gu;
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
      } else if (tk.startsWith("{") && tk.endsWith("}")) {
        tokens.push({
          kind: "tool",
          text: tk.slice(1, -1),
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
  /** Tracked rAF from the engine — calls get cancelled on unmount. */
  trackedRAF: (cb: FrameRequestCallback) => number;
  /** Set the engine cleans up at unmount; flying-emoji nodes register here. */
  flyNodes: Set<HTMLElement>;
  /** Resolves a cast `ref` to its SVG <g> for reaction sourcing. */
  castByRef: Record<string, any>;
  /** Absolute-positioned HTML overlay sibling to the SVG. Cards live here
   *  (not inside a foreignObject) so font-size / spacing render at real CSS
   *  px instead of the SVG viewBox's scaled-down user units. */
  overlayEl: HTMLElement;
}

export interface ChatCardOptions {
  holdMs?: number;
  maxChars?: number;
  isAgent?: boolean;
  name?: string;
  role?: string;
  avatar?: string;
  /** When `isAgent`, the inner SVG markup (24x24 viewBox) used as the avatar
   *  glyph — keeps the floor mark and the message bubble mark in sync. */
  agentIconSvg?: string;
  /** When `isAgent`, an illustration that wins over the SVG glyph and fills
   *  the avatar slot directly. Mirrors AgentDef.iconImage. */
  agentIconImage?: string;
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

// Shared easing — entrance and exit share the same curve so they feel
// like one component. ease-out-quart is the recommended curve for elements
// entering or exiting on screen. The reaction pill keeps a slight spring
// (defined in CSS) for a touch of playfulness.
const EASE_OUT_QUART = "cubic-bezier(0.165, 0.84, 0.44, 1)";

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createChatCard(deps: ChatCardDeps): ChatCardModule {
  const {
    trackedSetTimeout,
    trackedSetInterval,
    trackedRAF,
    flyNodes,
    castByRef,
    overlayEl,
  } = deps;

  function showChatCard(
    hostEl: any,
    msg: string,
    opts: ChatCardOptions = {}
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      // Remove any prior card still attached to this speaker.
      if (hostEl._chatCard?.anchor) {
        hostEl._chatCard.anchor.remove();
        hostEl._chatCard = null;
      }

      const isAgent = !!opts.isAgent;
      const lines = msg.split("\n");
      const longest = lines.reduce(
        (m: number, l: string) => Math.max(m, l.replace(/\*\*/g, "").length),
        0
      );
      // Sized for the smaller (13 px) body type — ~7 px per char + padding.
      const cardW = Math.max(260, Math.min(380, longest * 7 + 60));

      // Build an absolute-positioned anchor div in the overlay, with the
      // card inside it. The anchor's transform is updated per rAF to follow
      // the speaker's screen position; the inner card animates independently.
      const anchor = document.createElement("div");
      anchor.className = "dust-floor-card-anchor";

      const card = document.createElement("div");
      card.className = "chat-card" + (isAgent ? " agent-card" : "");
      card.style.width = cardW + "px";
      anchor.appendChild(card);

      const header = document.createElement("div");
      header.className = "chat-card-header";
      card.appendChild(header);

      const avatar = isAgent
        ? buildChatCardAgentAvatar(opts.agentIconSvg, opts.agentIconImage)
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

      overlayEl.appendChild(anchor);

      // Per-frame tracker: position the anchor at the speaker's screen
      // position. svgEl.getScreenCTM() composes any browser zoom / page
      // scroll, and hostEl.getCTM() applies the speaker's local transform.
      //
      // Only write the transform when the screen position actually changed.
      // Speakers stand still during dialogue, so the writes collapse to one
      // per scenario beat instead of one per rAF — which avoids forcing a
      // layout invalidation on the SVG subtree every frame. At high browser
      // zoom that per-frame invalidation made the avatars rasterize at a
      // budget the browser couldn't meet, so some `.human` groups got
      // dropped each frame and the whole floor flickered independently.
      let trackerActive = true;
      let lastX = Number.NaN;
      let lastY = Number.NaN;
      const updatePos = () => {
        if (!trackerActive) {
          return;
        }
        const ctm = (hostEl as SVGGraphicsElement).getScreenCTM?.();
        const overlayRect = overlayEl.getBoundingClientRect();
        if (ctm) {
          const x = ctm.e - overlayRect.left;
          const y = ctm.f - overlayRect.top;
          if (x !== lastX || y !== lastY) {
            lastX = x;
            lastY = y;
            anchor.style.transform = `translate(${x}px, ${y}px)`;
          }
        }
        trackedRAF(updatePos);
      };
      updatePos();

      const reduced = prefersReducedMotion();
      if (!reduced) {
        try {
          card.animate(
            [
              { transform: "translateX(-50%) scale(0.96)", opacity: 0 },
              { transform: "translateX(-50%) scale(1)", opacity: 1 },
            ],
            {
              duration: 220,
              easing: EASE_OUT_QUART,
              fill: "forwards",
            } as KeyframeAnimationOptions
          );
        } catch (_e) {
          /* noop */
        }
      }

      hostEl._chatCard = {
        card,
        reactions: rx,
        anchor,
        stopTracker: () => {
          trackerActive = false;
        },
      };

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
        } else if (token.kind === "tool") {
          el = document.createElement("span");
          el.className = "tool-chip";
          const logo = TOOL_LOGOS[token.text.toLowerCase().trim()];
          if (logo) {
            // When we have a brand mark, swap the chip body for the logo and
            // render the brand name as alt-text only — keeps the chat card
            // dense without losing accessibility.
            el.classList.add("tool-chip-logo");
            const img = document.createElement("img");
            img.src = logo;
            img.alt = token.text;
            img.draggable = false;
            el.appendChild(img);
          }
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

      // Reduced motion: render the full message instantly, then schedule
      // the hold + exit so the rest of the conductor flow is unaffected.
      if (reduced) {
        for (const tok of tokens) {
          if (tok.kind === "newline") {
            curTextNode = null;
            const next = tokens[tokens.indexOf(tok) + 1];
            if (next) {
              beginLine(next);
            }
            continue;
          }
          const tn = writeSpan(tok);
          tn.data = tok.text;
        }
        if (caret.parentNode) {
          caret.parentNode.removeChild(caret);
        }
        trackedSetTimeout(() => {
          hostEl._chatCard?.stopTracker?.();
          anchor.remove();
          hostEl._chatCard = null;
          resolve();
        }, opts.holdMs || 2200);
        return;
      }

      const typeTimer = trackedSetInterval(
        () => {
          if (tokIdx >= tokens.length) {
            clearInterval(typeTimer);
            if (caret.parentNode) {
              caret.parentNode.removeChild(caret);
            }
            trackedSetTimeout(() => {
              let fadeAnim: Animation | undefined;
              if (!reduced) {
                try {
                  fadeAnim = card.animate(
                    [
                      { opacity: 1, transform: "translateX(-50%) scale(1)" },
                      { opacity: 0, transform: "translateX(-50%) scale(0.96)" },
                    ],
                    {
                      duration: 180,
                      easing: EASE_OUT_QUART,
                      fill: "forwards",
                    } as KeyframeAnimationOptions
                  );
                } catch (_e) {
                  /* noop */
                }
              }
              const done = () => {
                hostEl._chatCard?.stopTracker?.();
                anchor.remove();
                hostEl._chatCard = null;
                resolve();
              };
              if (fadeAnim) {
                fadeAnim.onfinish = done;
              } else {
                trackedSetTimeout(done, reduced ? 0 : 180);
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
          // Tool chips are branded entities — render whole, not by character.
          if (tok.kind === "tool") {
            if (curTextNode) {
              curTextNode.data = tok.text;
            }
            tokIdx++;
            charIdx = 0;
            curTextNode = null;
            if (caret.parentNode) {
              caret.parentNode.removeChild(caret);
            }
            curLine.appendChild(caret);
            return;
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
        // ~8–14ms per character (≈ 90 cps). Faster than a human typing but
        // still reads as a typewriter rather than a flash; long bullet
        // responses now finish in ~3s instead of ~9s.
        8 + Math.random() * 6
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
    // Anchor the static position; the animation drives motion via transform
    // (kept on the GPU compositor).
    fly.style.left = fx + "px";
    fly.style.top = fy + "px";
    fly.style.opacity = "0";
    document.body.appendChild(fly);
    flyNodes.add(fly);

    const reduced = prefersReducedMotion();
    if (reduced) {
      // Skip the arc — just register the pill. Honors prefers-reduced-motion.
      flyNodes.delete(fly);
      fly.remove();
      addReactionPill(targetEl, emoji, isAgent);
      return;
    }

    // Path encoded as transform deltas relative to the fly's static position.
    // translate(-50%,-50%) keeps the emoji centered as it scales.
    const peakDx = (to.x - fx) / 2;
    const peakDy = Math.min(0, to.y - fy) - 60;
    const endDx = to.x - fx;
    const endDy = to.y - fy;

    const anim = fly.animate(
      [
        {
          opacity: 0,
          transform: "translate(-50%,-50%) translate(0px,0px) scale(0.6)",
        },
        {
          opacity: 1,
          transform: "translate(-50%,-50%) translate(0px,0px) scale(1.1)",
          offset: 0.2,
        },
        {
          transform: `translate(-50%,-50%) translate(${peakDx}px,${peakDy}px) scale(1.05)`,
          offset: 0.55,
        },
        {
          opacity: 1,
          transform: `translate(-50%,-50%) translate(${endDx}px,${endDy}px) scale(0.8)`,
        },
      ],
      {
        duration: 700,
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
      agentIconSvg: def.iconSvg,
      agentIconImage: def.iconImage,
    });
  }

  return { showChatCard, showAgentCard, scheduleReactions };
}
