import {
  Avatar,
  Bell01,
  Button,
  Checkbox,
  Chip,
  CoinsStacked01,
  ContentMessage,
  CreditCard01,
  Cube01,
  Download01,
  File04,
  Globe01,
  Input,
  Link01,
  Lock01,
  MessageChatSquare,
  Plus,
  Robot,
  SearchInput,
  Settings01,
  Shapes,
  ShieldTick,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Trash01,
  UsersCheck,
  UsersPlus,
  UserSquare,
  Zap,
} from "@dust-tt/sparkle";
import { useState } from "react";

import {
  ALLOWED_DOMAINS,
  GROUPS,
  INVOICES,
  MEMBERS,
  SKILLS,
  type Member,
} from "./data";
import {
  ActionRow,
  AdminPage,
  AdminSection,
  AdminTab,
  AdminTabs,
  GroupsRow,
  KpiCard,
  KpiGrid,
  MovedFrom,
  PermissionRow,
  Row,
  SelectRow,
  Status,
  ToggleRow,
  ValueRow,
} from "./primitives";
import { SimpleTable } from "./table";

function MemberCell({ m }: { m: Member }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar size="xs" name={m.name} isRounded />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{m.name}</span>
        <span className="copy-xs truncate text-muted-foreground">{m.email}</span>
      </div>
    </div>
  );
}

// ── 1. Members ────────────────────────────────────────────────────────────────

export function PeopleAccessPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("members");
  const members = MEMBERS.filter(
    (m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.email.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <AdminPage title="Members" question="Manage team members and their roles.">
      <AdminTabs storageKey="people">
        <AdminTab value="members" label="Members">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <SearchInput name="members" value={query} onChange={setQuery} placeholder="Search members" className="flex-1" />
              <Button size="sm" variant="outline" isSelect label="All roles" />
              <Button size="sm" label="Invite members" icon={Plus} />
            </div>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList border={false}>
                <TabsTrigger value="members" label="Members" />
                <TabsTrigger value="invitations" label="Invitations" />
              </TabsList>
              <TabsContent value="members" className="flex flex-col gap-2 pt-2">
                <SimpleTable<Member>
                  rows={members}
                  cols={[
                    {
                      key: "name",
                      header: "Name",
                      render: (m) => (
                        <div className="flex items-center gap-2">
                          <Avatar size="xs" name={m.name} isRounded />
                          <span className="font-medium">{m.name}</span>
                        </div>
                      ),
                    },
                    { key: "email", header: "Email", render: (m) => <span className="text-muted-foreground">{m.email}</span> },
                    {
                      key: "role",
                      header: "Role",
                      className: "w-28",
                      render: (m) => <Status label={m.role} color={m.role === "Admin" ? "warning" : m.role === "Manager" ? "info" : "success"} />,
                    },
                    { key: "status", header: "Status", className: "w-48", render: (m) => <span>{m.status}</span> },
                    {
                      key: "groups",
                      header: "Groups",
                      render: (m) => <span className="truncate text-muted-foreground">{m.groups.join(", ")}</span>,
                    },
                  ]}
                />
                <div className="flex items-center justify-between px-1">
                  <span className="copy-xs text-muted-foreground">Showing 1-25 of 136 items</span>
                  <div className="flex items-center gap-1">
                    {["1", "2", "3", "4", "5", "6"].map((n) => (
                      <Button key={n} size="xs" variant={n === "1" ? "outline" : "ghost"} label={n} />
                    ))}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="invitations" className="pt-2">
                <ContentMessage variant="outline" size="lg" title="3 pending invitations">
                  dev@dust.tt, thomas+newtest4@dust.tt and edouardwautier@gmail.com have not accepted yet. You can resend or revoke each invitation.
                </ContentMessage>
              </TabsContent>
            </Tabs>
          </div>

          <AdminSection icon={UsersPlus} title="Joining the workspace">
            <ActionRow
              title="Invite members"
              description="Invite people by email. Invited members get a Member role and a seat if eligible."
              label="Invite members"
              icon={Plus}
            />
            <Row
              title="Auto-join Workspace"
              titleSuffix={<Chip size="xs" color="success" label="Enabled" />}
              description={
                <>
                  Allow your team members to access your Dust workspace when they authenticate with a "@dust.tt" account.{" "}
                  <MovedFrom from="IT & Security" />
                </>
              }
              action={<Button size="sm" variant="outline" label="De-activate Auto-join" />}
            />
          </AdminSection>
        </AdminTab>

        <AdminTab value="groups" label="Groups">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <SearchInput name="groups" value="" onChange={() => {}} placeholder="Search groups" className="flex-1" />
              <Button size="sm" label="Create group" icon={Plus} />
            </div>
            <SimpleTable
              rows={GROUPS}
              cols={[
                { key: "name", header: "Name", render: (g) => <span className="font-medium">{g.name}</span> },
                { key: "members", header: "Members", className: "w-28", align: "right", render: (g) => <span className="tabular-nums">{g.members}</span> },
                {
                  key: "origin",
                  header: "Origin",
                  className: "w-36",
                  render: (g) => <Status label={g.origin} color={g.origin === "Provisioned" ? "info" : "primary"} />,
                },
                {
                  key: "actions",
                  header: "",
                  className: "w-32",
                  align: "right",
                  render: (g) => (g.origin === "Manual" ? <Button size="xs" variant="ghost" label="Delete group" icon={Trash01} /> : null),
                },
              ]}
            />
          </div>
          <AdminSection icon={UsersCheck} title="User provisioning">
            <Row
              title="Directory sync"
              titleSuffix={<Chip size="xs" color="success" label="Enabled" />}
              description={
                <>
                  Automatically syncing users and groups from gsuite directory <MovedFrom from="IT & Security" />
                </>
              }
              action={
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" label="Configure Directory sync" />
                  <Button size="sm" variant="outline" label="De-activate Directory sync" />
                  <Button size="sm" variant="ghost" label="View groups" />
                </div>
              }
            />
          </AdminSection>
        </AdminTab>

        <AdminTab value="roles" label="Roles">
          <ContentMessage variant="outline" size="lg">
            Groups assigned here are managed in Members → Groups
          </ContentMessage>
          <AdminSection icon={ShieldTick} title="Roles">
            <GroupsRow title="Admin" description="Full administrative control, including settings, connections, billing, and governance." defaultGroups={[]} />
            <GroupsRow title="Manager" description="Can manage members, groups, roles, and workspace analytics." defaultGroups={[]} />
          </AdminSection>
          <AdminSection icon={Lock01} title="Billing and security">
            <GroupsRow title="Access billing features" description="Who can manage billing settings, invoices, and payment methods" defaultGroups={["Billing"]} />
            <GroupsRow title="Access security features" description="Who can manage user access, identities, and provisioning" defaultGroups={["security-mdm"]} />
          </AdminSection>
        </AdminTab>
      </AdminTabs>
    </AdminPage>
  );
}

// ── 2. Security ───────────────────────────────────────────────────────────────

export function SecurityPage() {
  const [domain, setDomain] = useState("");
  return (
    <AdminPage title="Security" question="Verify your domain, manage authentication and network access.">
      <AdminTabs storageKey="security">
        <AdminTab value="identity" label="Domains & SSO">
          <AdminSection
            icon={Globe01}
            title="Domain Verification"
            description="Verify your company domains to enable Single Sign-On (SSO), automatic workspace enrollment for team members, and secure connections to your internal MCP servers."
            plain
          >
            <div className="flex flex-col gap-3">
              <SimpleTable
                rows={[{ id: "d1", domain: "@dust.tt", status: "Verified" }]}
                cols={[
                  { key: "domain", header: "Domain", render: (d) => <span className="font-medium">{d.domain}</span> },
                  { key: "status", header: "Status", className: "w-40", render: (d) => <Status label={d.status} color="success" /> },
                ]}
              />
              <div>
                <Button size="sm" variant="outline" label="Add Domain" icon={Plus} />
              </div>
            </div>
          </AdminSection>

          <AdminSection icon={ShieldTick} title="Authentication and access">
            <Row
              title="Single Sign-On (SSO)"
              titleSuffix={
                <>
                  <Chip size="xs" color="success" label="Enabled" />
                  <Chip size="xs" label="GoogleOIDC" />
                </>
              }
              description="Manage your enterprise Identity Provider (IdP) settings and user provisioning via WorkOS."
              action={
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" label="Configure SSO" />
                  <Button size="sm" variant="outline" label="De-activate SSO" />
                </div>
              }
            />
            <ToggleRow
              title="Enforce SSO login"
              description="When SSO is enforced, users will no longer be able to use social logins and will be redirected to the SSO portal."
            />
          </AdminSection>
        </AdminTab>

        <AdminTab value="network" label="Network">
          <AdminSection icon={Lock01} title="Agent-requested domains" plain>
            <div className="divide-y divide-border rounded-2xl border border-border">
              <ToggleRow
                title="Agent-requested domains"
                description={
                  <>
                    Applies to every Computer in this workspace, across all Pods. Allow agents to ask for additional domains, one approval per domain, during the conversation. When disabled, agents cannot request new domains and rely only on the allowed domains configured per scope below.{" "}
                    <MovedFrom from="Computer" />
                  </>
                }
                defaultOn
              />
            </div>
          </AdminSection>
          <AdminSection
            icon={Globe01}
            title="Network"
            action={<Button size="sm" variant="outline" isSelect label="Workspace" />}
            plain
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="heading-sm text-foreground">Allowed domains</span>
                <span className="copy-sm text-muted-foreground">
                  Domains allowed across the selected scopes. Adding writes to the Workspace when it is selected (inherited by all Pods), otherwise to each selected Pod.
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="copy-xs text-muted-foreground">Domain</span>
                <div className="flex items-center gap-2">
                  <Input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="e.g. api.openai.com or *.mistral.ai"
                    className="flex-1"
                  />
                  <Button size="sm" variant="outline" label="Add domain" icon={Plus} disabled={!domain} />
                </div>
                <span className="copy-xs text-muted-foreground">
                  Use an exact domain such as api.openai.com or a wildcard such as *.mistral.ai.
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {ALLOWED_DOMAINS.map((d) => (
                  <div key={d} className="flex items-center justify-between rounded-xl bg-muted-background/60 px-3 py-2">
                    <span className="font-mono text-sm">{d}</span>
                    <Button size="xs" variant="warning" icon={Trash01} />
                  </div>
                ))}
              </div>
            </div>
          </AdminSection>
        </AdminTab>

        <AdminTab value="audit" label="Audit Logs">
          <AdminSection
            icon={File04}
            title="Audit Logs"
            description="View workspace activity logs or configure export to your security information and event management (SIEM) system."
            plain
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" label="View Logs" />
                <Button size="sm" variant="outline" label="Configure Export" />
              </div>
              <div className="divide-y divide-border rounded-2xl border border-border">
                <ToggleRow
                  title="Audit logs"
                  description={
                    <>
                      Whether audit events are emitted to WorkOS and the audit logs section is shown in Security <MovedFrom from="Settings & Governance" />
                    </>
                  }
                  defaultOn
                />
              </div>
            </div>
          </AdminSection>
        </AdminTab>
      </AdminTabs>
    </AdminPage>
  );
}

// ── 3. Governance ─────────────────────────────────────────────────────────────

export function GovernancePage() {
  return (
    <AdminPage title="Governance" question="Manage what members can do in your workspace">
      <AdminTabs storageKey="governance">
        <AdminTab value="agents" label="Agents & Skills">
          <ContentMessage variant="outline" size="lg">
            Groups assigned here are managed in Members → Groups
          </ContentMessage>
          <AdminSection icon={Robot} title="Agents">
            <PermissionRow title="Create agents" description="Who can create agents in the Agent Builder" />
            <PermissionRow title="Publish agents" description="Who can publish agents to the whole workspace" />
          </AdminSection>
          <AdminSection icon={Shapes} title="Skills">
            <PermissionRow title="Create skills" description="Who can create custom skills" defaultScope="groups" defaultGroups={["team-france", "team-us", "team-nyc", "team-sf", "support-mdm"]} />
            <PermissionRow title="Manage skill availability" description="Who can make skills available across the workspace" defaultScope="groups" defaultGroups={["team-france", "team-us", "engineering-mdm", "team-nyc", "team-sf", "ai-ops"]} />
            <PermissionRow title="Make skills discoverable to agents" description="Who can make skills discoverable to @Dust and agents with Discover Skills" defaultScope="groups" defaultGroups={["ai-ops"]} />
          </AdminSection>
          <AdminSection icon={Zap} title="Self-Improving Skills" action={<MovedFrom from="Self-Improving Skills" />}>
            <ToggleRow title="Allow self-improving skills" description="Allow Dust to analyze conversations to improve your workspace's skills. Dust does not use conversations to train models." defaultOn />
            <ToggleRow
              title="Enable batch processing"
              description="Conversations are sent in batches to reduce costs. Data may remain on LLM provider servers for up to several hours before processing. Disable to ensure immediate data deletion (ZDR-compatible). This will increase your plan's pricing."
              defaultOn
            />
            <Row title="Skills" description="Skills currently allowed to self-improve, with their editors and spend.">
              <SimpleTable
                rows={SKILLS}
                cols={[
                  { key: "name", header: "Name", render: (s) => <span className="font-medium">{s.name}</span> },
                  { key: "editors", header: "Editors", render: (s) => <Chip size="xs" label={s.editors} /> },
                  { key: "enabled", header: "Enabled", className: "w-24", render: (s) => <Status label={s.enabled ? "On" : "Off"} color={s.enabled ? "success" : "primary"} /> },
                  { key: "spent", header: "Currently Spent", className: "w-40", align: "right", render: (s) => <span className="tabular-nums">{s.spent.toLocaleString()} / {s.cap.toLocaleString()}</span> },
                  { key: "locked", header: "Lock State", className: "w-28", render: (s) => <Status label={s.locked ? "Locked" : "Open"} color={s.locked ? "warning" : "primary"} /> },
                ]}
              />
            </Row>
          </AdminSection>
        </AdminTab>

        <AdminTab value="pods" label="Pods & Frames">
          <AdminSection icon={Cube01} title="Pods">
            <SelectRow title="Restricted and Open Pods" description="Whether members are allowed to create open pods" options={["Restricted only", "Restricted and open Pods"]} defaultValue="Restricted and open Pods" />
            <SelectRow title="Pod files" description="Whether members can manually add files to Pods" options={["Manual updates allowed", "Manual updates disabled"]} />
          </AdminSection>
          <AdminSection icon={Link01} title="Frames">
            <Row
              title="Frame sharing"
              description="Whether frames are shareable outside the workspace"
              action={<Button size="sm" variant="outline" isSelect label="No restrictions" />}
            />
            <PermissionRow title="Invite people by email" description="Who can share frames by email with people outside your organization" />
            <PermissionRow title="Share by public link" description="Who can create public links to frames" />
          </AdminSection>
          <AdminSection icon={Zap} title="Automations">
            <PermissionRow title="Charge automations to the workspace" description="Who can run a trigger on the workspace credit pool instead of their own" defaultScope="admins_only" />
          </AdminSection>
        </AdminTab>

        <AdminTab value="features" label="Features">
          <AdminSection icon={Settings01} title="Workspace Name" plain>
            <div className="divide-y divide-border rounded-2xl border border-border">
              <Row title="Dust" action={<Button size="sm" variant="outline" label="Edit" />} />
            </div>
          </AdminSection>
          <AdminSection icon={MessageChatSquare} title="Features">
            <ToggleRow title="Voice transcription" description="Whether members can use voice transcription in conversations" defaultOn />
            <ToggleRow
              title="Email and Slack notifications"
              description="Whether members can receive conversation notifications by email or Slack. In-app Dust notifications are not affected."
              defaultOn
            />
            <ToggleRow title="Private conversation URLs by default" description="Whether conversation URLs are private by default, limiting access to participants" />
            <ToggleRow
              title="Workspace Analyst"
              description="Whether workspace admins get the Analyst agent and analytics tools to explore how the workspace is used"
              defaultOn
            />
            <ToggleRow title="Archive unused agents" description="Automatically archive unused agents. Or archive them once." extra={<Button size="xs" variant="outline" label="Archive them" />} />
            <ValueRow title="Inactivity threshold" description="How long an agent has to go unmentioned before it's archived. Agents with a schedule are excluded." value="90" unit="days" />
          </AdminSection>
        </AdminTab>
      </AdminTabs>
    </AdminPage>
  );
}

// ── 4. Credits ────────────────────────────────────────────────────────────────

export function CreditsPage() {
  const [tab, setTab] = useState("members");
  return (
    <AdminPage
      title="Credits"
      question="Control credit consumption across your workspace."
      action={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" label="Breakdown in analytics" icon={Link01} />
          <Button size="sm" label="Add credits" icon={Plus} />
        </div>
      }
    >
      <KpiGrid>
        <KpiCard label="Remaining credits in the pool" value="25,374,840" />
        <KpiCard label="Used this cycle" value="6,129,864.6" hint="Day 31/31" />
        <KpiCard label="Programmatic usage this cycle" value="981,715" hint="16% of the usage" />
      </KpiGrid>
      <AdminTabs storageKey="credits">
        <AdminTab value="seats" label="Members">
          <div className="flex flex-col gap-3">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList border={false}>
                <TabsTrigger value="members" label="Members" />
                <TabsTrigger value="requests" label="Requests" />
              </TabsList>
              <TabsContent value="members" className="flex flex-col gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <SearchInput name="seats" value="" onChange={() => {}} placeholder="Search members" className="flex-1" />
                  <Button size="sm" variant="outline" isSelect label="All groups" />
                  <Button size="sm" variant="outline" isSelect label="All seats" />
                </div>
                <SimpleTable<Member>
                  rows={[...MEMBERS].sort((a, b) => b.poolUsed - a.poolUsed)}
                  cols={[
                    { key: "select", header: "", className: "w-10", render: () => <Checkbox /> },
                    { key: "name", header: "Name", render: (m) => <MemberCell m={m} /> },
                    { key: "seat", header: "Seats", className: "w-28", render: (m) => <Status label={m.seat} color={m.seat === "Max" ? "highlight" : m.seat === "Pro" ? "info" : "primary"} /> },
                    {
                      key: "seatUsage",
                      header: "Seat Usage",
                      className: "w-32",
                      align: "right",
                      render: (m) => <span className="tabular-nums">{m.seatUsage === null ? "--" : `${m.seatUsage}%`}</span>,
                    },
                    {
                      key: "poolUsed",
                      header: "Pool Usage",
                      className: "w-44",
                      align: "right",
                      render: (m) => (
                        <div className="flex flex-col items-end">
                          <span className="tabular-nums">{m.poolUsed.toLocaleString()}</span>
                          <span className="copy-xs tabular-nums text-muted-foreground">{m.poolLimit.toLocaleString()}</span>
                        </div>
                      ),
                    },
                    {
                      key: "actions",
                      header: "",
                      className: "w-12",
                      align: "right",
                      render: () => <Button size="xs" variant="ghost" label="…" tooltip="Change seat type · Edit spend limit · Remove seat" />,
                    },
                  ]}
                />
                <span className="copy-xs px-1 text-muted-foreground">Showing 1-25 of 136 items</span>
              </TabsContent>
              <TabsContent value="requests" className="pt-2">
                <ContentMessage variant="outline" size="lg" title="3 upgrade requests">
                  Nic Siegle, Ilias Bettahi and Zach Friedland reached their limit and asked for a higher seat.
                </ContentMessage>
              </TabsContent>
            </Tabs>
          </div>
        </AdminTab>

        <AdminTab value="groups" label="Groups">
          <SimpleTable
            rows={GROUPS.filter((g) => g.seat !== "—")}
            cols={[
              { key: "name", header: "Group", render: (g) => <span className="font-medium">{g.name}</span> },
              { key: "members", header: "Members", className: "w-28", align: "right", render: (g) => <span className="tabular-nums">{g.members}</span> },
              { key: "seat", header: "Granted seat", className: "w-32", render: (g) => <Status label={g.seat} color={g.seat === "Max" ? "highlight" : "info"} /> },
              { key: "monthlyLimit", header: "Monthly spend limit", className: "w-44", align: "right", render: (g) => <span className="tabular-nums">{g.monthlyLimit}</span> },
              { key: "edit", header: "", className: "w-24", align: "right", render: () => <Button size="xs" variant="ghost" label="Edit limit" /> },
            ]}
          />
          <p className="copy-xs px-1 text-muted-foreground">
            When a member belongs to several groups, the highest limit wins. Model tiers per group are set in Models → Access tiers.
          </p>
        </AdminTab>

        <AdminTab value="topups" label="Top-ups history">
          <SimpleTable
            rows={[
              { id: "c1", cycle: "Aug 1 – Aug 25", used: "3,653,194" },
              { id: "c2", cycle: "Aug 25 – Aug 25", used: "26,640" },
            ]}
            cols={[
              { key: "cycle", header: "Cycle", render: (c) => <span>{c.cycle}</span> },
              { key: "used", header: "Used Credits", className: "w-40", align: "right", render: (c) => <span className="tabular-nums">{c.used}</span> },
            ]}
          />
          <div className="flex items-center justify-between px-1">
            <Button size="xs" variant="ghost" label="Load more" />
            <span className="copy-xs text-muted-foreground">2 items</span>
          </div>
          <SimpleTable
            rows={[
              { id: "t1", date: "Sep 1, 2026", amount: "+10,000,000", expires: "Dec 1, 2026", kind: "Purchased credits" },
              { id: "t2", date: "Aug 1, 2026", amount: "+25,000,000", expires: "Nov 1, 2026", kind: "Purchased credits" },
              { id: "t3", date: "Jul 15, 2026", amount: "+500,000", expires: "Oct 15, 2026", kind: "Bonus Credits" },
            ]}
            cols={[
              { key: "date", header: "Date", render: (t) => <span>{t.date}</span> },
              { key: "kind", header: "Type", render: (t) => <Status label={t.kind} color={t.kind === "Bonus Credits" ? "highlight" : "primary"} /> },
              { key: "amount", header: "Added Credits", className: "w-40", align: "right", render: (t) => <span className="tabular-nums">{t.amount}</span> },
              { key: "expires", header: "Expires", className: "w-36", render: (t) => <span className="text-muted-foreground">{t.expires}</span> },
            ]}
          />
        </AdminTab>

        <AdminTab value="settings" label="Settings">
          <AdminSection icon={CoinsStacked01} title="Spending policies">
            <ValueRow
              title="Default per-user workspace credit pool monthly limit"
              description="Set to 0 to remove pool access."
              value="300000"
              unit="credits"
            />
            <ToggleRow
              title="Upgrade request"
              description="Allow members who reach their limit to request an upgrade. Workspace admins and managers review requests on the this page."
              defaultOn
            />
            <ToggleRow title="Require a reason for upgrade requests" description="Members must explain why they need an upgrade before their request can be submitted." />
            <ToggleRow title="Auto-upgrade seats" description="Automatically move members to the next seat (free → pro → max) when they reach their limit." />
            <ValueRow title="Credit spend checkpoint" description="Pause the agent and ask for confirmation when a single message exceeds this amount." value="5000" unit="credits" />
          </AdminSection>
          <AdminSection icon={Zap} title="Programmatic usage">
            <ValueRow title="Programmatic monthly limit" description="Set to 0 to block all programmatic access." value="1500000" unit="credits" />
            <ValueRow
              title="Self-improving skills global spending cap"
              description={
                <>
                  Self-improving skills is priced as programmatic usage. This is the maximum cost per month (in credits) for the feature across all skills. Once reached, no new self-improving runs are started until the next billing month.{" "}
                  <MovedFrom from="Self-Improving Skills" />
                </>
              }
              value="15000"
              unit="credits"
            />
            <ValueRow
              title="Default cost cap per skill"
              description={
                <>
                  Maximum cost per skill per self-improvement run (in credits). Once reached, no further self-improvement runs are started for that skill. <MovedFrom from="Self-Improving Skills" />
                </>
              }
              value="2000"
              unit="credits"
            />
          </AdminSection>
          <AdminSection icon={Bell01} title="Notifications">
            <ValueRow title="Workspace credit pool threshold alert" description="Set to 0 to disable." value="20" unit="%" />
            <ToggleRow title="Upgrade request emails" description="Email all workspace admins and managers when a member requests a spend-limit upgrade." defaultOn />
          </AdminSection>
        </AdminTab>
      </AdminTabs>
    </AdminPage>
  );
}

// ── 5. Billing ────────────────────────────────────────────────────────────────

function SeatCard({ name, assigned, credits }: { name: string; assigned: string; credits?: string }) {
  return (
    <div className="flex min-w-[260px] flex-1 flex-col gap-2 rounded-2xl border border-border p-4">
      <div className="flex items-center gap-2">
        <UserSquare className="h-4 w-4 text-muted-foreground" />
        <span className="heading-sm">{name}</span>
      </div>
      <span className="copy-sm text-muted-foreground">{assigned} seats assigned</span>
      {credits && <span className="copy-xs text-muted-foreground">{credits} credits per month</span>}
    </div>
  );
}

export function BillingPage() {
  return (
    <AdminPage title="Billing" question="Change your subscription and edit your billing information.">
      <AdminTabs storageKey="billing">
        <AdminTab value="info" label="Billing information">
          <div className="flex flex-col gap-2 rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2">
              <span className="heading-sm">Dust team - Credit priced</span>
              <Chip size="xs" color="success" label="Active" />
            </div>
            <div className="copy-sm flex flex-col gap-1 text-muted-foreground">
              <span>Frequency: Monthly</span>
              <span>Next billing date: September 25, 2026</span>
              <span>Amount: 0.00€</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <SeatCard name="Pro seat" assigned="12" credits="8,000" />
            <SeatCard name="Max seat" assigned="8" credits="40,000" />
            <SeatCard name="Max seat (Yearly)" assigned="5" credits="40,000" />
            <SeatCard name="Platform seat" assigned="26" />
            <SeatCard name="Platform seat (Yearly)" assigned="85" />
          </div>
          <AdminSection icon={CreditCard01} title="Billing information">
            <Row title="Billing contact" description="accounts@dust.tt" action={<Button size="sm" variant="outline" label="Edit" />} />
            <Row title="Address" description="6 rue Ménars, 75002 Paris, France" action={<Button size="sm" variant="outline" label="Edit" />} />
            <Row title="Payment method" description="Visa ending 4242" action={<Button size="sm" variant="outline" label="Update" />} />
          </AdminSection>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" label="Manage invoices" />
            <Button size="sm" variant="warning-ghost" label="Cancel subscription" />
          </div>
        </AdminTab>
        <AdminTab value="invoices" label="Invoices">
          <SimpleTable
            rows={INVOICES}
            cols={[
              { key: "id", header: "Invoice", render: (i) => <span className="font-medium">{i.id}</span> },
              { key: "date", header: "Date", render: (i) => <span>{i.date}</span> },
              { key: "amount", header: "Amount", className: "w-36", align: "right", render: (i) => <span className="tabular-nums">{i.amount}</span> },
              { key: "status", header: "Status", className: "w-28", render: (i) => <Status label={i.status} color={i.status === "Paid" ? "success" : "warning"} /> },
              { key: "dl", header: "", className: "w-16", align: "right", render: () => <Button size="xs" variant="ghost" icon={Download01} /> },
            ]}
          />
        </AdminTab>
      </AdminTabs>
    </AdminPage>
  );
}
