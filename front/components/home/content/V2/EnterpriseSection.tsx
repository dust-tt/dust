import { H2, P } from "@app/components/home/ContentComponents";

interface FeatureColumnProps {
  icon: string;
  iconBg: string;
  title: string;
  items: string[];
}

function FeatureColumn({ icon, iconBg, title, items }: FeatureColumnProps) {
  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      <div
        className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-lg ${iconBg}`}
      >
        {icon}
      </div>
      <h3 className="mb-4 text-lg font-semibold text-foreground">{title}</h3>
      <ul className="space-y-2.5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-0.5 text-emerald-500">✓</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const COLUMNS: FeatureColumnProps[] = [
  {
    icon: "🛡",
    iconBg: "bg-rose-100",
    title: "Security & compliance",
    items: [
      "SOC 2 Type II certified",
      "GDPR compliant (EU data residency)",
      "HIPAA-ready deployment",
      "SSO (SAML, OIDC) + SCIM",
      "Audit logs (365-day retention)",
      "RBAC + dual-layer permissions",
      "AES-256 at rest, TLS 1.3 in transit",
      "Zero model training on your data",
    ],
  },
  {
    icon: "⚡",
    iconBg: "bg-amber-100",
    title: "Performance & scale",
    items: [
      "99.9% uptime SLA",
      "Supports 10,000+ users per workspace",
      "Concurrent agent execution",
      "Sub-2s agent response time (p95)",
      "CDN-backed global deployment",
    ],
  },
  {
    icon: "🔗",
    iconBg: "bg-blue-100",
    title: "Integration architecture",
    items: [
      "RESTful API for custom integrations",
      "MCP for proprietary systems",
      "Webhook support for event-driven workflows",
      "OAuth2 for third-party permissions",
      "Bi-directional sync (read + write)",
      "Incremental data refresh",
      "100+ production connectors",
    ],
  },
];

export function EnterpriseSection() {
  return (
    <section className="py-16 lg:py-24">
      <div className="mb-12">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          🔒 Enterprise Ready, Obviously
        </p>
        <H2 mono className="mb-6 max-w-3xl text-left">
          When AI has access to your company&rsquo;s knowledge, &ldquo;mostly
          secure&rdquo; doesn&rsquo;t cut&nbsp;it.
        </H2>
        <P size="lg" className="max-w-3xl text-muted-foreground">
          Your operators build fast. Your data stays locked down. Dust&rsquo;s
          dual-layer permission model separates what agents can access from who
          can use them, with SCIM-synced groups, admin-gated overrides, and zero
          privilege escalation.
        </P>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <FeatureColumn key={col.title} {...col} />
        ))}
      </div>
    </section>
  );
}
