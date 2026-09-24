import {
  Avatar,
  BarChart01,
  Brain,
  Button,
  ChevronDown,
  ChevronRight,
  Clock,
  CoinsStacked01,
  CreditCard01,
  LayoutLeft,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  PuzzlePiece01,
  SearchInput,
  Settings01,
  ShieldTick,
  SliderToggle,
  Terminal,
  Toggle01Left,
  Users01,
} from "@dust-tt/sparkle";
import { type ComponentType, useEffect, useMemo, useState } from "react";

import { ShowOriginsContext } from "./primitives";
import {
  BillingPage,
  CreditsPage,
  GovernancePage,
  PeopleAccessPage,
  SecurityPage,
} from "./pagesA";
import {
  AnalyticsPage,
  AutomationsPage,
  DeveloperPage,
  IntegrationsPage,
  ModelsPage,
} from "./pagesB";
import { searchSettings, type SettingEntry } from "./searchIndex";

type PageId =
  | "people"
  | "security"
  | "governance"
  | "credits"
  | "billing"
  | "analytics"
  | "models"
  | "integrations"
  | "automations"
  | "developers";

type NavItem = { id: PageId; label: string; icon: ComponentType; page: ComponentType };

/** Sidebar groups: who is here and what they may do / money / what the product connects to. */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Organization",
    items: [
      { id: "people", label: "Members", icon: Users01, page: PeopleAccessPage },
      { id: "security", label: "Security", icon: ShieldTick, page: SecurityPage },
      { id: "governance", label: "Governance", icon: Toggle01Left, page: GovernancePage },
    ],
  },
  {
    label: "Spend",
    items: [
      { id: "credits", label: "Credits", icon: CoinsStacked01, page: CreditsPage },
      { id: "billing", label: "Billing", icon: CreditCard01, page: BillingPage },
      { id: "analytics", label: "Analytics", icon: BarChart01, page: AnalyticsPage },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "models", label: "Models", icon: Brain, page: ModelsPage },
      { id: "integrations", label: "Integrations", icon: PuzzlePiece01, page: IntegrationsPage },
      { id: "automations", label: "Automations", icon: Clock, page: AutomationsPage },
      { id: "developers", label: "Developers", icon: Terminal, page: DeveloperPage },
    ],
  },
];

const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
const pageLabel = (id: string) => NAV.find((n) => n.id === id)?.label ?? id;

/** AdminTabs stores its active tab under this key; the storage key is the page's id. */
const TAB_STORAGE_PREFIX = "sparkle-playground-admin-tab-";
const STORAGE_KEY = "sparkle-playground-admin-page";

export function AdminShell() {
  const [current, setCurrent] = useState<PageId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as PageId | null;
      return saved && NAV.some((n) => n.id === saved) ? saved : "people";
    } catch {
      return "people";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, current);
    } catch {
      // ignore
    }
  }, [current]);

  // Bumped when search navigates, so the page remounts and AdminTabs re-reads its stored tab.
  const [mountKey, setMountKey] = useState(0);
  const [pendingSection, setPendingSection] = useState<string | null>(null);

  // After a search jump, scroll the target section into view and flash it.
  useEffect(() => {
    if (!pendingSection) {
      return;
    }
    // Wait one tick so the remounted tabs have settled (Radix moves focus on mount, which
    // would cancel a smooth scroll), then scroll the <main> container ourselves.
    const timer = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-admin-section="${pendingSection.replace(/"/g, '\\"')}"]`);
      const main = el?.closest("main");
      if (el && main) {
        const delta = el.getBoundingClientRect().top - main.getBoundingClientRect().top - 24;
        main.scrollTo({ top: main.scrollTop + delta, behavior: "smooth" });
        el.classList.add("is-target");
        setTimeout(() => el.classList.remove("is-target"), 1800);
      }
      setPendingSection(null);
    }, 80);
    return () => clearTimeout(timer);
  }, [pendingSection, mountKey]);
  const [showOrigins, setShowOrigins] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchSettings(query, pageLabel), [query]);

  const goTo = (entry: SettingEntry) => {
    try {
      localStorage.setItem(TAB_STORAGE_PREFIX + entry.page, entry.tab);
    } catch {
      // ignore
    }
    setCurrent(entry.page as PageId);
    setMountKey((k) => k + 1);
    setPendingSection(entry.section);
    setQuery("");
  };

  const Page = NAV.find((n) => n.id === current)?.page ?? PeopleAccessPage;

  return (
    <ShowOriginsContext.Provider value={showOrigins}>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-muted-background/60">
          <div className="flex items-center justify-between px-3 pt-3">
            <Button size="sm" variant="outline" icon={Settings01} label="Admin" />
            <Button size="xs" variant="ghost" icon={LayoutLeft} />
          </div>
          <div className="px-3 pt-3">
            <SearchInput
              name="settings-search"
              value={query}
              onChange={setQuery}
              placeholder="Search settings"
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && results[0]) {
                  goTo(results[0]);
                }
                if (ev.key === "Escape") {
                  setQuery("");
                }
              }}
            />
          </div>
          <div className="flex-1 overflow-y-auto px-2 pt-3">
            {query.trim() ? (
              <div className="flex flex-col gap-1">
                {results.length === 0 && (
                  <p className="copy-sm px-2 py-3 text-muted-foreground">No setting matches "{query}".</p>
                )}
                {results.map((r) => (
                  <button
                    key={`${r.page}/${r.tab}/${r.label}`}
                    type="button"
                    onClick={() => goTo(r)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-xl px-2 py-2 text-left hover:bg-muted-background"
                  >
                    <span className="heading-sm text-foreground">{r.label}</span>
                    <span className="copy-xs flex items-center gap-1 text-muted-foreground">
                      {pageLabel(r.page)}
                      <ChevronRight className="h-3 w-3" />
                      {tabLabel(r)}
                      <ChevronRight className="h-3 w-3" />
                      {r.section}
                    </span>
                  </button>
                ))}
                {results.length > 0 && (
                  <p className="copy-xs px-2 pt-2 text-muted-foreground">Press Enter to open the first result.</p>
                )}
              </div>
            ) : (
              <NavigationList>
                {NAV_GROUPS.map((g) => (
                  <div key={g.label} className="flex flex-col pb-3">
                    <NavigationListLabel label={g.label} />
                    {g.items.map((n) => (
                      <NavigationListItem
                        key={n.id}
                        label={n.label}
                        icon={n.icon}
                        selected={n.id === current}
                        onClick={() => setCurrent(n.id)}
                      />
                    ))}
                  </div>
                ))}
              </NavigationList>
            )}
          </div>
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="copy-xs text-muted-foreground">Show where settings moved from</span>
            <SliderToggle selected={showOrigins} onClick={() => setShowOrigins(!showOrigins)} />
          </div>
          <div className="flex items-center gap-2 border-t border-border px-3 py-3">
            <Avatar size="sm" name="Clément" isRounded />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="heading-sm truncate">Clément</span>
              <span className="copy-xs text-muted-foreground">Dust</span>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Page key={`${current}-${mountKey}`} />
        </main>
      </div>
    </ShowOriginsContext.Provider>
  );
}

/** Human label for a tab value, derived from the page's tab set. */
const TAB_LABELS: Record<string, string> = {
  members: "Members",
  groups: "Groups",
  roles: "Roles",
  identity: "Domains & SSO",
  network: "Network",
  audit: "Audit Logs",
  agents: "Agents & Skills",
  pods: "Pods & Frames",
  features: "Features",
  seats: "Members",
  topups: "Top-ups history",
  settings: "Settings",
  info: "Billing information",
  invoices: "Invoices",
  overview: "Consumption",
  export: "Export",
  providers: "Providers",
  tiers: "Access tiers",
  apps: "App Credentials",
  messaging: "Messaging apps",
  email: "Email",
  clients: "Clients & tools",
  triggers: "Triggers",
  workflows: "Slack workflows",
  keys: "API keys",
  secrets: "Secrets",
  env: "Computer environment",
};
const tabLabel = (r: SettingEntry) => TAB_LABELS[r.tab] ?? r.tab;
