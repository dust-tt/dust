import { H2, P } from "@app/components/home/ContentComponents";
import { HomeEyebrow } from "@app/components/home/content/Product/HomeEyebrow";
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";

type Accent = "blue" | "golden" | "green";

interface AccentTheme {
  bg: string;
  bgSubtle: string;
  iconBg: string;
  iconAccent: string;
  number: string;
  dot: string;
  rowHover: string;
}

const ACCENT: Record<Accent, AccentTheme> = {
  blue: {
    bg: "bg-blue-50",
    bgSubtle: "bg-blue-50/50",
    iconBg: "bg-blue-200",
    iconAccent: "bg-blue-500",
    number: "text-blue-500",
    dot: "bg-blue-500",
    rowHover: "hover:bg-blue-50/50",
  },
  golden: {
    bg: "bg-golden-50",
    bgSubtle: "bg-golden-50/50",
    iconBg: "bg-golden-200",
    iconAccent: "bg-golden-500",
    number: "text-golden-500",
    dot: "bg-golden-500",
    rowHover: "hover:bg-golden-50/50",
  },
  green: {
    bg: "bg-green-50",
    bgSubtle: "bg-green-50/50",
    iconBg: "bg-green-200",
    iconAccent: "bg-green-700",
    number: "text-green-700",
    dot: "bg-green-700",
    rowHover: "hover:bg-green-50/50",
  },
};

interface ComplianceColumn {
  code: string;
  title: string;
  accent: Accent;
  items: string[];
}

const COLUMNS: ComplianceColumn[] = [
  {
    code: "01",
    title: "Security & compliance",
    accent: "blue",
    items: [
      "SOC 2 Type II certified",
      "GDPR compliant — EU data residency",
      "HIPAA-ready deployment",
      "SSO (SAML, OIDC) + SCIM",
      "Audit logs, 365-day retention",
      "RBAC + dual-layer agent permissions",
      "AES-256 at rest, TLS 1.3 in transit",
      "Zero model training on your data",
    ],
  },
  {
    code: "02",
    title: "Performance & scale",
    accent: "golden",
    items: [
      "99.9% uptime SLA",
      "10,000+ users per workspace",
      "Concurrent agent execution",
      "Sub-2s response time (p95)",
    ],
  },
  {
    code: "03",
    title: "Integration architecture",
    accent: "green",
    items: [
      "RESTful API for custom integrations",
      "MCP for proprietary systems",
      "Webhook support for event-driven workflows",
      "OAuth2 for third-party permissions",
      "Bi-directional sync, read + write",
      "Incremental data refresh",
      "100+ production connectors",
    ],
  },
];

function HalfCircleIcon({ accent }: { accent: Accent }) {
  const theme = ACCENT[accent];
  return (
    <div className="relative h-9 w-9" aria-hidden="true">
      <div className={`absolute inset-0 rounded-full ${theme.iconBg}`} />
      <div
        className={`absolute inset-x-0 bottom-0 h-1/2 rounded-b-full ${theme.iconAccent}`}
      />
    </div>
  );
}

const TOTAL_CONTROLS = COLUMNS.reduce((sum, c) => sum + c.items.length, 0);

export function HomeSecuritySection() {
  return (
    <section className="w-full bg-background py-24">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-12 px-6">
        <div className="flex flex-col gap-6">
          <HomeReveal>
            <HomeEyebrow label="Enterprise ready, obviously" />
          </HomeReveal>
          <HomeReveal delay={80}>
            <H2 className="max-w-[820px] text-balance font-medium leading-[1.1] tracking-[-0.03em] text-foreground">
              When AI has access to your company&apos;s knowledge, &ldquo;mostly
              secure&rdquo; doesn&apos;t cut it.
            </H2>
          </HomeReveal>
          <HomeReveal delay={160}>
            <P
              size="sm"
              className="max-w-[820px] leading-[1.6] text-muted-foreground"
            >
              Your operators build fast. Your data stays locked down.
              Dust&apos;s dual-layer permission model separates what agents can
              access from who can use them, with SCIM-synced groups, admin-gated
              overrides, and zero privilege escalation. Granular enough for your
              CISO, invisible to everyone else.
            </P>
          </HomeReveal>
        </div>

        <HomeReveal delay={220} className="flex flex-col gap-3">
          {/* Caption strip — small, kept on-brand: foreground sans, mono only on the link */}
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-1">
            <span className="text-sm text-muted-foreground">
              Trust datasheet —{" "}
              <span className="font-medium text-foreground">
                {TOTAL_CONTROLS} controls live
              </span>
            </span>
            <a
              href="https://dust.tt/security"
              className="group inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-blue-500"
            >
              Visit Trust Center
              <span
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              >
                →
              </span>
            </a>
          </div>

          {/* Tinted columns sitting in a hairline grid (matches the AgentsImprove + Bento family) */}
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl bg-border md:grid-cols-3">
            {COLUMNS.map((column, colIdx) => {
              const theme = ACCENT[column.accent];
              return (
                <div key={column.code} className={`flex flex-col ${theme.bg}`}>
                  {/* Column header */}
                  <header className="flex items-center gap-4 px-7 pb-6 pt-7">
                    <HalfCircleIcon accent={column.accent} />
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={`text-2xl font-semibold leading-none tracking-[-0.02em] md:text-3xl ${theme.number}`}
                      >
                        {column.code}
                      </span>
                      <span className="text-base font-semibold tracking-[-0.01em] text-foreground">
                        {column.title}
                      </span>
                    </div>
                  </header>

                  {/* Items */}
                  <ul className="m-0 flex list-none flex-col p-0 pb-3">
                    {column.items.map((item, itemIdx) => (
                      <HomeReveal
                        key={item}
                        as="li"
                        variant="right"
                        delay={300 + colIdx * 60 + itemIdx * 30}
                        className={`group flex items-start gap-3 px-7 py-3 transition-colors duration-150 ${theme.rowHover}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 block h-1.5 w-1.5 flex-shrink-0 rounded-full ${theme.dot}`}
                        />
                        <span className="text-sm leading-[1.5] text-foreground">
                          {item}
                        </span>
                      </HomeReveal>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </HomeReveal>
      </div>
    </section>
  );
}
