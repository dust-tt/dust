/* eslint-disable */
// @ts-nocheck
// biome-ignore-all: imperative DOM/SVG scene ported from the
// landing-gather-remix design prototype. The animation and SVG foreignObject
// chat cards rely on per-frame DOM mutation — rewriting as React idioms
// would lose visual fidelity. Keep this file self-contained.

import { buildAgent } from "@app/components/home/content/Product/heroOfficeAgentAvatar";
import { createChatCard } from "@app/components/home/content/Product/heroOfficeChatCard";
import {
  ROOM_POPULATIONS,
  ROOMS,
} from "@app/components/home/content/Product/heroOfficeFloor";
import { iso } from "@app/components/home/content/Product/heroOfficeIso";
import { STATIC_SVG_MARKUP } from "@app/components/home/content/Product/heroOfficeMarkup";
import type {
  AgentDef,
  Beat,
  CastSlot,
  Scenario,
} from "@app/components/home/content/Product/heroOfficeScenario";
import { SCENE_CSS } from "@app/components/home/content/Product/heroOfficeStyles";
import {
  ACTIVITY_EMOJIS,
  buildHuman,
} from "@app/components/home/content/Product/heroOfficeUserAvatar";
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
  /** Ordered list of scenarios. The conductor picks a random starting
   *  index on mount, then plays them sequentially in array order, looping
   *  forever. Each scenario re-picks its own cast at the start of its run. */
  scenarios: Scenario[];
}

export function mountFloorScene(
  host: HTMLElement,
  options: MountFloorSceneOptions
): () => void {
  const { avatarPool, scenarios } = options;
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

  // Sibling HTML overlay for chat cards. Cards render here as plain
  // absolute-positioned HTML (real CSS px) instead of inside a foreignObject
  // (where the SVG viewBox would scale them down ~0.5x).
  const overlayEl = document.createElement("div");
  overlayEl.className = "dust-floor-cards";
  host.appendChild(overlayEl);

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

  // Pre-build every unique agent referenced by any scenario, so each one
  // already sits in its home room when its scenario starts. Idle agents
  // from inactive scenarios stay parked silently in their rooms.
  const agentsLayer = $byId("agents");
  const allAgentDefs: AgentDef[] = [];
  const seenAgentIds = new Set<string>();
  for (const s of scenarios) {
    for (const a of s.agents) {
      if (!seenAgentIds.has(a.id)) {
        seenAgentIds.add(a.id);
        allAgentDefs.push(a);
      }
    }
  }
  // Spread agents that share a starting room so they don't stack at the
  // same point. Offsets are applied around the room's center; agent radius
  // is ~22 plan-units so 70 between centers leaves a clean gap.
  const AGENT_SPREAD: Array<[number, number]> = [
    [0, 0],
    [-70, -10],
    [70, -10],
    [0, 60],
    [-70, 60],
    [70, 60],
  ];
  const agentSlotInRoom: Record<string, number> = {};
  const agents = allAgentDefs.map((d: AgentDef) => {
    const el = buildAgent(d.id, d.label);
    agentsLayer.appendChild(el);
    el._tagTxt.textContent = d.label;
    const rect = rooms[d.startRoom].interior[0];
    const slot = agentSlotInRoom[d.startRoom] ?? 0;
    agentSlotInRoom[d.startRoom] = slot + 1;
    const [dx, dy] = AGENT_SPREAD[slot % AGENT_SPREAD.length];
    const planX = rect.x + rect.w / 2 + dx;
    const planY = rect.y + rect.h / 2 + dy;
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

  function pickPersonIn(roomKey, skipSet) {
    const candidates = Array.from(
      humansLayer.querySelectorAll(".human")
    ).filter((p: any) => p._roomKey === roomKey && !skipSet.has(p));
    return (candidates[0] as any) || null;
  }

  // Cast picking is per-scenario: each run resets castByRef and re-binds
  // the slots against the current population. The chat-card module captures
  // castByRef by reference, so it sees the latest mapping every run.
  const castByRef: Record<string, any> = {};
  function pickCastFor(scenario: Scenario): void {
    for (const k of Object.keys(castByRef)) {
      delete castByRef[k];
    }
    const skip = new Set();
    for (const slot of scenario.cast as CastSlot[]) {
      const personEl = pickPersonIn(slot.startRoom, skip);
      if (!personEl) {
        continue;
      }
      skip.add(personEl);
      personEl.dataset.person = slot.ref;
      const teammate: TeamMember = personEl._person;
      // First name only in the chat-card header — keeps the card narrow
      // and avoids leaking last names. @mentions in beat copy already use
      // the first name via resolveMsg().
      const firstName = teammate.name.split(/\s+/)[0] || teammate.name;
      personEl._chatMeta = {
        name: firstName,
        role: slot.role,
        avatar: teammate.image,
      };
      castByRef[slot.ref] = personEl;
    }
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

  // Build the chat-card module against the engine's tracked timers + cast
  // map so all DOM activity it spawns is cleaned up on unmount.
  const { showChatCard, showAgentCard, scheduleReactions } = createChatCard({
    trackedSetTimeout,
    trackedSetInterval,
    trackedRAF,
    flyNodes,
    castByRef,
    overlayEl,
  });

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
    // Pick a random starting scenario, then play the rest sequentially.
    const startIdx = Math.floor(Math.random() * scenarios.length);
    let i = 0;
    while (!disposed) {
      const scenario = scenarios[(startIdx + i) % scenarios.length];
      pickCastFor(scenario);
      await runScenario(scenario);
      if (disposed) {
        break;
      }
      await sleep(scenario.loopGapMs ?? 2500);
      i++;
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
