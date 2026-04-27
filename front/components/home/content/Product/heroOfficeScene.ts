/* eslint-disable */
// @ts-nocheck
// biome-ignore-all: imperative DOM/SVG scene ported from the
// landing-gather-remix design prototype. The animation and SVG foreignObject
// chat cards rely on per-frame DOM mutation — rewriting as React idioms
// would lose visual fidelity. Keep this file self-contained.

import {
  ACTIVITY_EMOJIS,
  buildAgent,
  buildHuman,
} from "@app/components/home/content/Product/heroOfficeActors";
import {
  ROOM_POPULATIONS,
  ROOMS,
} from "@app/components/home/content/Product/heroOfficeFloor";
import {
  iso,
  SVG_NS,
} from "@app/components/home/content/Product/heroOfficeIso";
import { STATIC_SVG_MARKUP } from "@app/components/home/content/Product/heroOfficeMarkup";
import type {
  AgentDef,
  Beat,
  CastSlot,
  Scenario,
} from "@app/components/home/content/Product/heroOfficeScenario";
import { SCENE_CSS } from "@app/components/home/content/Product/heroOfficeStyles";
import type { TeamMember } from "@app/components/home/content/shared/team";

// =============================================================================
// Mount the floor scene into the host element. Returns a cleanup function
// that fully tears the scene down (cancels rAF, clears timers, removes
// stray flying-emoji nodes, and resets the host).
//
// NB: This module is descended from the prototype IIFE. Anything that looks
// unidiomatic for React (raw DOM manipulation, _planX-style ad-hoc fields)
// is intentional — the scene uses per-frame DOM mutation to drive visuals
// that React's render cycle can't.
// =============================================================================

export interface MountFloorSceneOptions {
  /** Pool of teammates to populate the office with. The engine Fisher-Yates
   *  shuffles a copy and assigns one teammate per seat. */
  avatarPool: TeamMember[];
  /** Scenario controlling agent definitions, cast slots, and beats. */
  scenario: Scenario;
}

export function mountFloorScene(
  host: HTMLElement,
  options: MountFloorSceneOptions
): () => void {
  const { avatarPool, scenario } = options;
  // Inject scene CSS once (scoped to host class).
  const styleId = "dust-floor-scene-style";
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  let injectedStyle = false;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent = SCENE_CSS;
    document.head.appendChild(styleEl);
    injectedStyle = true;
  }

  host.innerHTML = STATIC_SVG_MARKUP;

  // Cleanup tracking
  const rafs = new Set<number>();
  const intervals = new Set<number>();
  const timeouts = new Set<number>();
  const flyNodes = new Set<HTMLElement>();
  let disposed = false;

  const trackedRAF = (cb: FrameRequestCallback) => {
    const id = requestAnimationFrame((t) => {
      rafs.delete(id);
      cb(t);
    });
    rafs.add(id);
    return id;
  };
  const trackedSetInterval = (cb: () => void, ms: number) => {
    const id = window.setInterval(cb, ms);
    intervals.add(id);
    return id;
  };
  const trackedSetTimeout = (cb: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeouts.delete(id);
      cb();
    }, ms);
    timeouts.add(id);
    return id;
  };

  // Scoped lookup — replaces the prototype's bare `document.getElementById`.
  const $byId = (id: string) =>
    host.querySelector(
      "#" + (window.CSS && window.CSS.escape ? window.CSS.escape(id) : id)
    );

  // ===========================================================================
  // Scene engine. Drives population, agent positioning, the chat-card UI,
  // and the scenario beat runner. Pure visuals (markup, CSS, iso math,
  // actor builders) live in sibling modules. Pure data (rooms, populations,
  // scenario) is data-only.
  // ===========================================================================

  const rooms = ROOMS;

  // The teammate pool comes from the caller and is Fisher-Yates shuffled
  // here so each page load reseats the office.
  const people: TeamMember[] = avatarPool.slice();
  for (let i = people.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [people[i], people[j]] = [people[j], people[i]];
  }

  const humansLayer = $byId("humans");
  let seed = 0;
  for (const [room, pts] of Object.entries(ROOM_POPULATIONS)) {
    for (const [x, y] of pts) {
      const person = people[seed % people.length];
      humansLayer.appendChild(buildHuman(x, y, seed++, room, person));
    }
  }

  trackedSetInterval(() => {
    const all = humansLayer.querySelectorAll(".activity-emoji");
    if (!all.length) {
      return;
    }
    const howMany = 1 + (Math.random() < 0.35 ? 1 : 0);
    for (let i = 0; i < howMany; i++) {
      const el = all[Math.floor(Math.random() * all.length)];
      let next =
        ACTIVITY_EMOJIS[Math.floor(Math.random() * ACTIVITY_EMOJIS.length)];
      if (next === el.textContent) {
        next =
          ACTIVITY_EMOJIS[
            (ACTIVITY_EMOJIS.indexOf(next) + 1) % ACTIVITY_EMOJIS.length
          ];
      }
      el.textContent = next;
      el.classList.remove("pop");
      void el.getBBox();
      el.classList.add("pop");
    }
  }, 2600);

  const agentsLayer = $byId("agents");
  const agents = scenario.agents.map((d: AgentDef) => {
    const el = buildAgent(d.id, d.label);
    agentsLayer.appendChild(el);
    el._tagTxt.textContent = d.label;
    // Position the agent in the center of its starting room's first
    // interior rect, lifted to z=22 like the humans.
    const rect = rooms[d.startRoom].interior[0];
    const planX = rect.x + rect.w / 2;
    const planY = rect.y + rect.h / 2;
    const [sx, sy] = iso(planX, planY, 22);
    el.style.setProperty("--x", sx + "px");
    el.style.setProperty("--y", sy + "px");
    el._currentRoom = d.startRoom;
    el._target = { x: planX, y: planY };
    el._planX = planX;
    el._planY = planY;
    el._homePlanX = planX;
    el._homePlanY = planY;
    return { el, def: d };
  });
  const agentById: Record<string, (typeof agents)[number]> = {};
  for (const a of agents) {
    agentById[a.def.id] = a;
  }

  const sleep = (ms: number) =>
    new Promise<void>((r) => trackedSetTimeout(() => r(), ms));

  function showChatCard(hostEl, msg, opts: any = {}) {
    return new Promise<void>((resolve) => {
      const existing = hostEl.querySelector(".chat-card-fo");
      if (existing) {
        existing.remove();
      }

      const isAgent = !!opts.isAgent;
      const maxChars = opts.maxChars || 38;
      const lines = msg.split("\n");
      const longest = lines.reduce(
        (m, l) => Math.max(m, l.replace(/\*\*/g, "").length),
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

      const avatar = document.createElement("div");
      avatar.className = "chat-card-avatar" + (isAgent ? " agent-avatar" : "");
      if (isAgent) {
        avatar.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><circle cx="9" cy="13" r="1.2" fill="white" stroke="none"/><circle cx="15" cy="13" r="1.2" fill="white" stroke="none"/><path d="M12 4v3"/><circle cx="12" cy="3.4" r="1" fill="white" stroke="none"/></svg>';
      } else if (opts.avatar) {
        avatar.style.backgroundImage = `url("${opts.avatar}")`;
      }
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
      let tokIdx = 0,
        charIdx = 0;
      let curTextNode: Text | null = null;
      let curLine: HTMLElement = body;
      const caret = document.createElement("span");
      caret.className = "chat-card-caret";

      function beginLine(token) {
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

      function writeSpan(token) {
        let el;
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
              let fadeAnim;
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

  function parseRichMessage(msg) {
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
      let m;
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

  function pickPersonIn(roomKey, skipSet) {
    const candidates = Array.from(
      humansLayer.querySelectorAll(".human")
    ).filter((p: any) => p._roomKey === roomKey && !skipSet.has(p));
    return (candidates[0] as any) || null;
  }

  // Cast picking — bind each scenario CastSlot to a real teammate from the
  // requested room. The chat-card name comes from the picked TeamMember;
  // role stays as the scenario override.
  const skip = new Set();
  const castByRef: Record<string, any> = {};
  for (const slot of scenario.cast as CastSlot[]) {
    const personEl = pickPersonIn(slot.startRoom, skip);
    if (!personEl) {
      continue;
    }
    skip.add(personEl);
    personEl.dataset.person = slot.ref;
    const teammate: TeamMember = personEl._person;
    personEl._chatMeta = {
      name: teammate.name,
      role: slot.role,
      avatar: teammate.image,
    };
    castByRef[slot.ref] = personEl;
  }

  // First name used to expand `{ref}` / `@{ref}` placeholders in beat copy.
  const firstNameOf = (personEl: any): string => {
    const full: string = personEl?._person?.name || "";
    return full.split(/\s+/)[0] || "";
  };
  const resolveMsg = (msg: string): string =>
    msg.replace(/(@?)\{([A-Za-z0-9_]+)\}/g, (whole, at, ref) => {
      const ref_el = castByRef[ref];
      if (!ref_el) {
        return whole; // leave unknown placeholders untouched
      }
      return (at || "") + firstNameOf(ref_el);
    });

  function chatCardFor(targetEl) {
    return targetEl._chatCard || null;
  }
  function bubbleAnchorFor(targetEl) {
    const cc = chatCardFor(targetEl);
    if (cc) {
      const r = cc.card.getBoundingClientRect();
      return { x: r.left + r.width * 0.25, y: r.bottom - 18 };
    }
    const r = targetEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top };
  }

  function addReactionPill(targetEl, emoji, isAgent) {
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
      existing.offsetHeight;
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

  function flyReaction(reactorEl, targetEl, emoji, isAgent) {
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
    targetEl,
    reactions,
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

  function showAgentCard(agent, msg, opts: any = {}) {
    const def: AgentDef = agent.def;
    return showChatCard(agent.el, msg, {
      holdMs: opts.holdMs,
      maxChars: opts.maxChars,
      // Strip leading "@" from the label for the card title
      name: def.label.replace(/^@/, ""),
      role: def.cardRole,
      isAgent: true,
    });
  }

  // Smooth straight walk to a plan-space target. Used by walkTo / walkHome
  // beats so an agent can stand next to a caller in a single room without
  // routing through the corridor.
  function walkAgentTo(agent, tx, ty) {
    return new Promise<void>((resolve) => {
      const el = agent.el;
      if (el._raf) {
        cancelAnimationFrame(el._raf);
      }
      const sx = el._planX;
      const sy = el._planY;
      const dist = Math.hypot(tx - sx, ty - sy);
      if (dist < 4) {
        resolve();
        return;
      }
      const duration = Math.max(900, Math.min(2800, (dist / 90) * 1000));
      const easeInOut = (u) =>
        u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const start = performance.now();
      el.classList.remove("working");
      const tick = (now) => {
        if (disposed) {
          return;
        }
        const u = Math.min(1, (now - start) / duration);
        const eu = easeInOut(u);
        const x = sx + (tx - sx) * eu;
        const y = sy + (ty - sy) * eu;
        const [ix, iy] = iso(x, y, 22);
        el.style.setProperty("--x", ix + "px");
        el.style.setProperty("--y", iy + "px");
        el._planX = x;
        el._planY = y;
        if (u < 1) {
          el._raf = trackedRAF(tick);
        } else {
          el.classList.add("working");
          resolve();
        }
      };
      el._raf = trackedRAF(tick);
    });
  }

  // Generic beat runner — dispatches each Beat in scenario.beats.
  async function runScenario(s: Scenario) {
    if (disposed) {
      return;
    }
    // Bail out gracefully if any cast slot couldn't be filled.
    for (const slot of s.cast as CastSlot[]) {
      if (!castByRef[slot.ref]) {
        return;
      }
    }

    for (const beat of s.beats as Beat[]) {
      if (disposed) {
        return;
      }
      switch (beat.type) {
        case "person": {
          const speaker = castByRef[beat.ref];
          if (!speaker) {
            break;
          }
          const p = showChatCard(speaker, resolveMsg(beat.msg), {
            holdMs: beat.holdMs,
            maxChars: beat.maxChars,
            name: speaker._chatMeta.name,
            role: speaker._chatMeta.role,
            avatar: speaker._chatMeta.avatar,
          });
          if (beat.reactions?.length) {
            scheduleReactions(speaker, beat.reactions);
          }
          await p;
          break;
        }
        case "agent": {
          const agent = agentById[beat.agentId];
          if (!agent) {
            break;
          }
          const p = showAgentCard(agent, resolveMsg(beat.msg), {
            holdMs: beat.holdMs,
            maxChars: beat.maxChars,
          });
          if (beat.reactions?.length) {
            scheduleReactions(agent.el, beat.reactions, 0, true);
          }
          await p;
          break;
        }
        case "walkTo": {
          const agent = agentById[beat.agentId];
          const target = castByRef[beat.ref];
          if (!agent || !target) {
            break;
          }
          await walkAgentTo(
            agent,
            target._planX + (beat.offsetX ?? 60),
            target._planY + (beat.offsetY ?? -10)
          );
          break;
        }
        case "walkHome": {
          const agent = agentById[beat.agentId];
          if (!agent) {
            break;
          }
          // Don't await — the prototype lets the agent stroll home while the
          // loop's tail sleep starts immediately.
          walkAgentTo(agent, agent.el._homePlanX, agent.el._homePlanY);
          break;
        }
        case "pause": {
          await sleep(beat.ms);
          break;
        }
      }
    }
  }

  // Mark every agent as idle / working in its home room.
  agents.forEach((a) => {
    a.el.classList.add("working");
  });

  (async function conductor() {
    await sleep(1200);
    while (!disposed) {
      await runScenario(scenario);
      if (disposed) {
        break;
      }
      await sleep(scenario.loopGapMs ?? 2500);
    }
  })();

  // ===========================================================================
  // Cleanup
  // ===========================================================================
  return () => {
    disposed = true;
    rafs.forEach((id) => cancelAnimationFrame(id));
    intervals.forEach((id) => clearInterval(id));
    timeouts.forEach((id) => clearTimeout(id));
    rafs.clear();
    intervals.clear();
    timeouts.clear();
    flyNodes.forEach((node) => node.remove());
    flyNodes.clear();
    host.innerHTML = "";
    if (injectedStyle && styleEl && styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
    }
  };
}
