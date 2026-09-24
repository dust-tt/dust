import {
  Avatar,
  BarChart01,
  Brain,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Checkbox,
  Chip,
  Clipboard,
  Clock,
  CodeBrowser,
  Download01,
  Globe01,
  Key01,
  LinkExternal01,
  Lock01,
  Mail01,
  MessageChatSquare,
  Monitor01,
  Plus,
  SearchInput,
  SliderToggle,
  Stars02,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Zap,
} from "@dust-tt/sparkle";
import { useState } from "react";

import {
  API_KEYS,
  ATTRIBUTION,
  GROUPS,
  PROVIDERS,
  SECRETS,
  TRIGGERS,
  WORKFLOWS,
} from "./data";
import {
  ActionRow,
  AdminPage,
  AdminSection,
  AdminTab,
  AdminTabs,
  KpiCard,
  KpiGrid,
  MovedFrom,
  Row,
  SelectRow,
  Status,
  ToggleRow,
} from "./primitives";
import { AttributionTable, SimpleTable } from "./table";

// ── 6. Analytics ──────────────────────────────────────────────────────────────

const SERIES = [
  { name: "dust", color: "bg-blue-900" },
  { name: "Others", color: "bg-blue-700" },
  { name: "support", color: "bg-blue-500" },
  { name: "deep-dive", color: "bg-blue-400" },
  { name: "dust-lionel-high", color: "bg-blue-300" },
  { name: "morty", color: "bg-blue-200" },
];

export function AnalyticsPage() {
  const [view, setView] = useState("daily");
  const [tab, setTab] = useState("agents");
  return (
    <AdminPage
      title="Analytics"
      question={
        <span className="flex items-center gap-2">
          <span>Aug 25 to Sep 25</span>
          <span className="text-border">|</span>
          <span>121 of 136 members active</span>
          <span className="text-border">|</span>
          <span>Updated 1min ago</span>
        </span>
      }
      action={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" isSelect label="This cycle" />
          <Button
            size="sm"
            variant="outline"
            isSelect
            label={view === "daily" ? "Daily" : "Cumulative"}
            onClick={() => setView(view === "daily" ? "cumulative" : "daily")}
          />
          <Button size="sm" label="Ask @analyst" icon={Stars02} />
        </div>
      }
    >
      <AdminTabs storageKey="analytics">
        <AdminTab value="overview" label="Consumption">
          <div className="flex justify-end">
            <Button size="xs" variant="ghost" label="Manage in Credits" icon={LinkExternal01} />
          </div>
          <KpiGrid>
            <KpiCard label="Used this period" value="6,358,670 credits" hint="13% of 50,106,000 cap" />
            <KpiCard label="Messages" value="126,856" hint="50.1 credits / message" />
            <KpiCard label="Top agent" value="dust" hint="45% of total consumption" />
          </KpiGrid>

          <div className="flex items-center justify-between">
            <span className="heading-base">Explore</span>
            <Button size="xs" variant="outline" label="Filters" />
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between">
              <span className="heading-sm">Consumption</span>
              <ButtonsSwitchList size="xs" value={view} onValueChange={setView}>
                <ButtonsSwitch value="daily" label="Daily" />
                <ButtonsSwitch value="cumulative" label="Cumulative" />
              </ButtonsSwitchList>
            </div>
            <div className="flex h-52 items-end gap-1">
              {Array.from({ length: 30 }).map((_, i) => {
                const base = view === "daily" ? 25 + ((i * 37) % 70) : Math.min(100, 6 + i * 3.2);
                return (
                  <div key={i} className="flex flex-1 flex-col-reverse overflow-hidden rounded-t" style={{ height: `${base}%` }}>
                    {SERIES.map((s, k) => (
                      <div key={s.name} className={s.color} style={{ flex: k === 0 ? 4 : k === 1 ? 2 : 1 }} />
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {SERIES.map((s) => (
                <span key={s.name} className="copy-xs flex items-center gap-1.5 text-muted-foreground">
                  <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
                  {s.name}
                </span>
              ))}
              <span className="copy-xs flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-orange-400" />
                Active users
              </span>
            </div>
          </div>

          <AdminSection
            icon={BarChart01}
            title="Attribution"
            plain
            action={<Button size="sm" variant="outline" label="Download raw data" icon={Download01} />}
          >
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="agents" label="Agents" />
                <TabsTrigger value="members" label="Members" />
                <TabsTrigger value="groups" label="Groups" />
                <TabsTrigger value="models" label="Models" />
                <TabsTrigger value="tools" label="Tools" />
                <TabsTrigger value="skills" label="Skills" />
                <TabsTrigger value="sources" label="Sources" />
                <TabsTrigger value="triggers" label="Triggers" />
                <TabsTrigger value="keys" label="API keys" />
              </TabsList>
              <TabsContent value="agents" className="pt-4"><AttributionTable label="Name" rows={ATTRIBUTION.agents} /></TabsContent>
              <TabsContent value="members" className="pt-4"><AttributionTable label="Name" rows={ATTRIBUTION.members} /></TabsContent>
              <TabsContent value="keys" className="flex flex-col gap-3 pt-4">
                <KpiGrid>
                  <KpiCard label="Credits" value="256,360" hint="11 API keys used this period" />
                  <KpiCard label="Keys active" value="51 / 314" hint="263 revoked" />
                </KpiGrid>
                <AttributionTable label="Name" rows={ATTRIBUTION.keys} />
                <div><MovedFrom from="Dust API Keys" /></div>
              </TabsContent>
              <TabsContent value="triggers" className="flex flex-col gap-3 pt-4">
                <KpiGrid>
                  <KpiCard label="Credits" value="394,322" hint="6% of workspace consumption" />
                  <KpiCard label="Triggers enabled" value="217 / 333" hint="116 disabled" />
                  <KpiCard label="Workspace pool" value="7 / 333" hint="326 on member pool" />
                  <KpiCard label="Slack workflows" value="2" hint="Workflows allowed" />
                </KpiGrid>
                <AttributionTable label="Name" rows={ATTRIBUTION.triggers} />
                <div><MovedFrom from="Automations" /></div>
              </TabsContent>
              <TabsContent value="skills" className="flex flex-col gap-3 pt-4">
                <KpiGrid>
                  <KpiCard label="Current period consumption" value="1,719 / 15,000 credits" hint="Self-improving skills · Total consumed" />
                </KpiGrid>
                <AttributionTable label="Name" rows={ATTRIBUTION.skills} />
                <div><MovedFrom from="Self-Improving Skills" /></div>
              </TabsContent>
              {["groups", "models", "tools", "sources"].map((t) => (
                <TabsContent key={t} value={t} className="pt-4">
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No consumption over this period.
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </AdminSection>
        </AdminTab>

        <AdminTab value="export" label="Export">
          <AdminSection icon={Download01} title="Exports" description="Download the raw metrics behind these charts as CSV files.">
            <ActionRow title="New export" description="Usage metrics for the selected period, as CSV." label="Download raw data" icon={Download01} />
            <Row title="Sep 1 – Sep 25 · Usage metrics" description="Generated 2 hours ago · 4.2 MB" action={<Button size="sm" variant="ghost" label="Download" icon={Download01} />} />
            <Row title="Aug 1 – Aug 31 · Usage metrics" description="Generated Sep 1 · 12.8 MB" action={<Button size="sm" variant="ghost" label="Download" icon={Download01} />} />
          </AdminSection>
        </AdminTab>
      </AdminTabs>
    </AdminPage>
  );
}

// ── 7. Models ─────────────────────────────────────────────────────────────────

export function ModelsPage() {
  const [providers, setProviders] = useState(PROVIDERS);
  const toggle = (id: string) =>
    setProviders((ps) => ps.map((p) => (p.id === id ? { ...p, enabledForAgents: !p.enabledForAgents } : p)));
  const all = providers.every((p) => p.enabledForAgents);
  return (
    <AdminPage title="Models" question="Choose which AI providers and models are available to your workspace.">
      <AdminTabs storageKey="models">
        <AdminTab value="providers" label="Providers">
          <div className="flex items-center justify-between px-1">
            <span className="heading-sm">Make all providers available</span>
            <SliderToggle selected={all} onClick={() => setProviders((ps) => ps.map((p) => ({ ...p, enabledForAgents: !all })))} />
          </div>
          <div className="flex flex-col divide-y divide-border">
            {providers
              .filter((p) => p.models)
              .map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar size="sm" name={p.name} />
                    <div className="flex min-w-0 flex-col">
                      <span className="heading-sm">{p.name}</span>
                      <span className="copy-xs truncate text-muted-foreground">{p.models}</span>
                    </div>
                  </div>
                  <SliderToggle selected={p.enabledForAgents} onClick={() => toggle(p.id)} />
                </div>
              ))}
          </div>
          <AdminSection icon={Brain} title="Embedding Provider" plain>
            <div className="divide-y divide-border rounded-2xl border border-border">
              <Row
                title="Embedding Provider:"
                description="Embedding models are used to create numerical representations of your data powering the semantic search capabilities of your agents. Please contact us if you want to change this setting."
                action={<Button size="sm" variant="outline" isSelect label="OpenAI" disabled />}
              />
              <ToggleRow title="EU-hosted models only" description="Limit available models to EU-based ones. Useful for data residency requirements." />
            </div>
          </AdminSection>
        </AdminTab>

        <AdminTab value="tiers" label="Access tiers">
          <AdminSection icon={Lock01} title="Model access tiers" action={<MovedFrom from="Usage" />}>
            <SelectRow title="Workspace access" description="Set the highest model tier available to all members of this workspace." options={["Standard", "Advanced", "Frontier"]} defaultValue="Frontier" />
            <ToggleRow title="Published agents" description="Allow all members to run published agents even when the agent's model tier is above their own access." defaultOn />
          </AdminSection>
          <AdminSection icon={Brain} title="Groups" description="Model tier granted to each group. The highest tier wins when a member belongs to several groups." plain>
            <SimpleTable
              rows={GROUPS.filter((g) => g.tier !== "—")}
              cols={[
                { key: "name", header: "Group", render: (g) => <span className="font-medium">{g.name}</span> },
                { key: "members", header: "Members", className: "w-28", align: "right", render: (g) => <span className="tabular-nums">{g.members}</span> },
                { key: "tier", header: "Models tier", className: "w-40", render: (g) => <Status label={g.tier} color={g.tier === "Frontier" ? "highlight" : "primary"} /> },
                { key: "edit", header: "", className: "w-24", align: "right", render: () => <Button size="xs" variant="ghost" label="Change" /> },
              ]}
            />
          </AdminSection>
        </AdminTab>

        <AdminTab value="apps" label="App Credentials">
          <p className="copy-sm text-muted-foreground">
            Configure model and service providers to enable advanced capabilities in your Apps. Note: These providers are not used by Dust agents at all, but are required for running your own custom Dust Apps. <MovedFrom from="App Credentials" />
          </p>
          <AdminSection icon={Key01} title="Model Providers" description="Model providers available to your Dust apps." plain>
            <div className="flex flex-col divide-y divide-border">
              {providers.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="heading-sm">{p.name}</span>
                      <Chip size="xs" color={p.appKey ? "success" : "primary"} label={p.appKey ? "enabled" : "disabled"} />
                    </div>
                    {p.appKey && <span className="copy-xs font-mono text-muted-foreground">API Key: {p.appKey}</span>}
                  </div>
                  <Button size="sm" variant={p.appKey ? "primary" : "outline"} label={p.appKey ? "Edit" : "Set up"} />
                </div>
              ))}
            </div>
          </AdminSection>
          <AdminSection icon={Globe01} title="Service Providers" description="Service providers enable your Dust Apps to query external data or write to external services." plain>
            <div className="flex flex-col divide-y divide-border">
              {[
                ["SerpApi (Google Search)", "•••••••••••••••••••••••••••3f1a"],
                ["Serper (Google Search)", null],
                ["Browserless (Web scrape)", "•••••••••••••••••••••••••••b9e2"],
              ].map(([name, key]) => (
                <div key={name} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="heading-sm">{name}</span>
                      <Chip size="xs" color={key ? "success" : "primary"} label={key ? "enabled" : "disabled"} />
                    </div>
                    {key && <span className="copy-xs font-mono text-muted-foreground">API Key: {key}</span>}
                  </div>
                  <Button size="sm" variant={key ? "primary" : "outline"} label={key ? "Edit" : "Set up"} />
                </div>
              ))}
            </div>
          </AdminSection>
        </AdminTab>
      </AdminTabs>
    </AdminPage>
  );
}

// ── 8. Integrations ───────────────────────────────────────────────────────────

export function IntegrationsPage() {
  return (
    <AdminPage title="Integrations" question="Connect Dust to the tools where your team already works.">
      <AdminTabs storageKey="integrations">
        <AdminTab value="messaging" label="Messaging apps">
          <AdminSection icon={MessageChatSquare} title="Messaging apps">
            <ToggleRow title="Slack Bot" description="Whether the Dust Bot can be used in Slack" defaultOn extra={<Button size="sm" variant="outline" label="Reconnect" />} />
            <ToggleRow title="Microsoft Teams Bot" description="Whether the Dust Bot can be used in Microsoft Teams" />
            <ToggleRow title="Discord Bot" description="Whether the Dust Bot can be used in Discord" defaultOn extra={<Button size="sm" variant="outline" label="Reconnect" />} />
            <ToggleRow
              title='"Sent via Agent" Slack footer'
              description={
                <>
                  Whether agents can remove the "Sent via Agent" footer on Slack messages posted with user credentials <MovedFrom from="Features" />
                </>
              }
            />
          </AdminSection>
        </AdminTab>
        <AdminTab value="email" label="Email">
          <AdminSection icon={Mail01} title="Email">
            <ToggleRow
              title="Email agents"
              description={
                <>
                  Whether members can reach agents by email at AGENT_NAME@dust.team <MovedFrom from="Features" />
                </>
              }
              defaultOn
            />
          </AdminSection>
        </AdminTab>
        <AdminTab value="clients" label="Clients & tools">
          <AdminSection icon={Monitor01} title="Clients & tools">
            <ToggleRow
              title="MCP server"
              description={
                <>
                  Whether external MCP clients can connect to this workspace <MovedFrom from="Features" />
                </>
              }
              defaultOn
              extra={<Button size="sm" variant="outline" label="Manage" />}
            />
            <ToggleRow
              title="Browser Extension Tools"
              description={
                <>
                  Whether the Dust browser extension is allowed to list and read browser tabs. <MovedFrom from="Features" />
                </>
              }
            />
          </AdminSection>
        </AdminTab>
      </AdminTabs>
    </AdminPage>
  );
}

// ── 9. Automations ────────────────────────────────────────────────────────────

export function AutomationsPage() {
  return (
    <AdminPage
      title="Automations"
      question="Everything that runs on its own: who set it up, how often it runs, what it costs."
      action={<Button size="sm" variant="outline" isSelect label="This cycle" />}
    >
      <AdminTabs storageKey="automations">
        <AdminTab value="triggers" label="Triggers">
          <KpiGrid>
            <KpiCard label="Credits" value="394,322" hint="6% of workspace consumption" />
            <KpiCard label="Triggers enabled" value="217 / 333" hint="116 disabled" />
            <KpiCard label="Workspace pool" value="7 / 333" hint="326 on member pool" />
          </KpiGrid>
          <div className="flex items-center gap-2">
            <SearchInput name="triggers" value="" onChange={() => {}} placeholder="Search…" className="flex-1" />
            <Button size="sm" variant="outline" label="Filters" />
            <Button size="sm" variant="outline" icon={Download01} />
          </div>
          <SimpleTable
            rows={TRIGGERS}
            cols={[
              { key: "select", header: "", className: "w-10", render: () => <Checkbox /> },
              { key: "name", header: "Name", render: (t) => <span className="font-medium">{t.name}</span> },
              {
                key: "owner",
                header: "Owner",
                className: "w-40",
                render: (t) => (
                  <div className="flex items-center gap-2">
                    <Avatar size="xs" name={t.owner} isRounded />
                    <span className="truncate">{t.owner}</span>
                  </div>
                ),
              },
              {
                key: "agent",
                header: "Agent",
                className: "w-40",
                render: (t) => (
                  <div className="flex items-center gap-2">
                    <Avatar size="xs" name={t.agent} />
                    <span className="truncate">{t.agent}</span>
                  </div>
                ),
              },
              {
                key: "type",
                header: "Type",
                className: "w-16",
                render: (t) => (t.type === "Schedule" ? <Clock className="h-4 w-4 text-muted-foreground" /> : <Zap className="h-4 w-4 text-muted-foreground" />),
              },
              { key: "credits", header: "Credits", className: "w-24", align: "right", render: (t) => <span className="tabular-nums">{t.credits}</span> },
              { key: "pool", header: "Pool", className: "w-32", render: (t) => <Button size="xs" variant="ghost" isSelect label={t.pool} /> },
              { key: "enabled", header: "Enabled", className: "w-24", render: (t) => <SliderToggle selected={t.enabled} /> },
            ]}
          />
        </AdminTab>
        <AdminTab value="workflows" label="Slack workflows">
          <KpiGrid>
            <KpiCard label="Credits" value="60,120" hint="1% of workspace consumption" />
            <KpiCard label="Workflows allowed" value="2" />
          </KpiGrid>
          <div className="flex items-center gap-2">
            <SearchInput name="workflows" value="" onChange={() => {}} placeholder="Search…" className="flex-1" />
            <Button size="sm" label="Allow a workflow" icon={Plus} />
          </div>
          <SimpleTable
            rows={WORKFLOWS}
            cols={[
              { key: "name", header: "Workflow", render: (w) => <span className="font-medium">{w.name}</span> },
              { key: "spaces", header: "Spaces", render: (w) => <span>{w.spaces}</span> },
              { key: "added", header: "Added", className: "w-36", render: (w) => <span className="text-muted-foreground">{w.added}</span> },
              { key: "revoke", header: "", className: "w-28", align: "right", render: () => <Button size="xs" variant="warning-ghost" label="Revoke" /> },
            ]}
          />
        </AdminTab>
      </AdminTabs>
    </AdminPage>
  );
}

// ── 10. Developers ────────────────────────────────────────────────────────────

export function DeveloperPage() {
  return (
    <AdminPage
      title="Developers"
      question="Create and manage keys to access the Dust API, store secrets, and configure the Computer environment."
      action={<Button size="sm" variant="outline" isSelect label="This cycle" />}
    >
      <AdminTabs storageKey="developers">
        <AdminTab value="keys" label="API keys">
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" label="API Reference" icon={CodeBrowser} />
            <Button size="sm" label="Create API Key" icon={Plus} />
          </div>
          <KpiGrid>
            <KpiCard label="Credits" value="256,360" hint="11 API keys used this period" />
            <KpiCard label="Keys active" value="51 / 314" hint="263 revoked" />
          </KpiGrid>
          <div className="flex items-center gap-2">
            <SearchInput name="keys" value="" onChange={() => {}} placeholder="Search API Key" className="flex-1" />
            <Button size="sm" variant="outline" label="Filters" />
          </div>
          <SimpleTable
            rows={API_KEYS}
            cols={[
              {
                key: "name",
                header: "Name",
                className: "min-w-52",
                render: (k) => (
                  <div className="flex flex-col">
                    <span className="truncate font-medium">{k.name}</span>
                    <span className="copy-xs text-muted-foreground">{k.owner}</span>
                  </div>
                ),
              },
              { key: "scope", header: "Scope", className: "w-24", render: (k) => <span className="text-muted-foreground">{k.scope}</span> },
              { key: "key", header: "Key", className: "w-28", render: (k) => <span className="font-mono text-xs text-muted-foreground">••••••_{k.key}</span> },
              { key: "spaces", header: "Spaces", className: "w-16", render: () => <Lock01 className="h-4 w-4 text-muted-foreground" /> },
              {
                key: "used",
                header: "Credits",
                className: "w-28",
                align: "right",
                render: (k) => <span className="tabular-nums">{k.used.toLocaleString()}/{k.cap ? k.cap.toLocaleString() : "∞"}</span>,
              },
              { key: "lastUsed", header: "Last Used", className: "w-28", render: (k) => <span className="text-muted-foreground">{k.lastUsed}</span> },
              { key: "status", header: "Status", className: "w-24", render: (k) => <Status label={k.status} color={k.status === "Active" ? "success" : "warning"} /> },
              { key: "more", header: "", className: "w-12", align: "right", render: () => <Button size="xs" variant="ghost" label="…" /> },
            ]}
          />
        </AdminTab>

        <AdminTab value="secrets" label="Secrets">
          <p className="copy-sm text-muted-foreground">Secrets usable in Dust apps or MCP servers to safely store sensitive data.</p>
          <div className="flex items-center gap-2">
            <SearchInput name="secrets" value="" onChange={() => {}} placeholder="Search secrets" className="flex-1" />
            <Button size="sm" variant="outline" label="API Reference" icon={CodeBrowser} />
            <Button size="sm" label="Create Secret" icon={Plus} />
          </div>
          <SimpleTable
            rows={SECRETS.map((s) => ({ id: s, name: s }))}
            cols={[
              {
                key: "name",
                header: "Name",
                render: (s) => (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">env.secrets.{s.name}</span>
                    <Clipboard className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                ),
              },
              { key: "actions", header: "", className: "w-32", align: "right", render: () => <Button size="xs" variant="ghost" label="Edit" /> },
            ]}
          />
        </AdminTab>

        <AdminTab value="env" label="Computer environment">
          <p className="copy-sm text-muted-foreground">
            Environment variables mounted on every Computer in this workspace. Values are write-only and snapshotted when a Computer starts. <MovedFrom from="Computer" />
          </p>
          <AdminSection
            icon={Lock01}
            title="HTTPS secrets (DSEC_)"
            description="Encrypted; injected only into outbound HTTPS requests to allowlisted domains."
            action={<Button size="sm" variant="outline" label="Add secret" icon={Plus} />}
            plain
          >
            <SimpleTable
              rows={[{ id: "e1", name: "DSEC_GITHUB_TOKEN", value: "••••••••" }, { id: "e2", name: "DSEC_LINEAR_API_KEY", value: "••••••••" }]}
              cols={[
                { key: "name", header: "Name", render: (e) => <span className="font-mono text-xs">{e.name}</span> },
                { key: "value", header: "Value", className: "w-40", render: (e) => <span className="font-mono text-xs text-muted-foreground">{e.value}</span> },
                { key: "del", header: "", className: "w-16", align: "right", render: () => <Button size="xs" variant="warning-ghost" label="Delete" /> },
              ]}
            />
          </AdminSection>
          <AdminSection
            icon={CodeBrowser}
            title="Config (DST_)"
            description="Plain, non-sensitive environment variables."
            action={<Button size="sm" variant="outline" label="Add variable" icon={Plus} />}
            plain
          >
            <SimpleTable
              rows={[{ id: "c1", name: "DST_REGION", value: "eu" }, { id: "c2", name: "DST_ENV", value: "prod" }]}
              cols={[
                { key: "name", header: "Name", render: (e) => <span className="font-mono text-xs">{e.name}</span> },
                { key: "value", header: "Value", className: "w-40", render: (e) => <span className="font-mono text-xs">{e.value}</span> },
                { key: "del", header: "", className: "w-16", align: "right", render: () => <Button size="xs" variant="warning-ghost" label="Delete" /> },
              ]}
            />
          </AdminSection>
          <p className="copy-xs text-muted-foreground">Network access for Computers is configured in Security → Network.</p>
        </AdminTab>
      </AdminTabs>
    </AdminPage>
  );
}
