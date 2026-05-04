import { H2, P } from "@app/components/home/ContentComponents";
import { HomeEyebrow } from "@app/components/home/content/Product/HomeEyebrow";
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";

type Accent = "red" | "green" | "blue";

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
  red: {
    bg: "bg-rose-50",
    bgSubtle: "bg-rose-50/50",
    iconBg: "bg-rose-200",
    iconAccent: "bg-rose-500",
    number: "text-rose-500",
    dot: "bg-rose-500",
    rowHover: "hover:bg-rose-50/50",
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
  blue: {
    bg: "bg-blue-50",
    bgSubtle: "bg-blue-50/50",
    iconBg: "bg-blue-200",
    iconAccent: "bg-blue-500",
    number: "text-blue-500",
    dot: "bg-blue-500",
    rowHover: "hover:bg-blue-50/50",
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
    accent: "red",
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
    accent: "green",
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
    accent: "blue",
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

// Padlock-with-shackle icon — recolored per accent. The SVG ships with
// pink/red defaults; here we map the lighter shape to the accent's 200-tone
// and the body to the accent's primary tone so each column reads in its
// own brand register.
const ICON_COLORS: Record<Accent, { light: string; dark: string }> = {
  red: { light: "#FFC3DF", dark: "#E14322" },
  green: { light: "#E2F78C", dark: "#418B5C" },
  blue: { light: "#9FDBFF", dark: "#1C91FF" },
};

function PadlockIcon({ accent }: { accent: Accent }) {
  const c = ICON_COLORS[accent];
  return (
    <svg
      width="30"
      height="40"
      viewBox="0 0 77 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <path
        d="M0 99.9997C0 78.8631 17.1346 61.7285 38.2712 61.7285C59.4078 61.7285 76.5424 78.8631 76.5424 99.9997H0Z"
        fill={c.light}
      />
      <path
        d="M20.436 40.9289V24.0845C20.436 14.2348 28.4208 6.25 38.2706 6.25C48.1203 6.25 56.1051 14.2348 56.1051 24.0845V40.9289"
        stroke={c.light}
        strokeWidth="10"
      />
      <path
        d="M0 61.7292C0 40.5926 17.1346 23.458 38.2712 23.458C59.4078 23.458 76.5424 40.5926 76.5424 61.7292H0Z"
        fill={c.dark}
      />
      <path
        d="M38.271 68.707C42.8946 68.707 46.6428 72.4552 46.6428 77.0789C46.6426 80.3388 44.7777 83.1607 42.0579 84.5432V89.2376C42.0577 91.3289 40.3623 93.0246 38.271 93.0246C36.1797 93.0246 34.4843 91.3289 34.4841 89.2376V84.5432C31.7643 83.1607 29.8994 80.3388 29.8992 77.0789C29.8992 72.4552 33.6474 68.707 38.271 68.707Z"
        fill="#111418"
      />
    </svg>
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
            <H2 className="max-w-[820px] text-balance font-semibold leading-[1.08] tracking-[-0.03em] text-foreground">
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

          {/* Tinted columns sitting flush — no separator. Each column's
              tinted bg lands directly next to its neighbor. */}
          <div className="grid grid-cols-1 overflow-hidden rounded-3xl md:grid-cols-3">
            {COLUMNS.map((column, colIdx) => {
              const theme = ACCENT[column.accent];
              return (
                <div key={column.code} className={`flex flex-col ${theme.bg}`}>
                  {/* Column header */}
                  <header className="flex items-center gap-4 px-7 pb-6 pt-7">
                    <PadlockIcon accent={column.accent} />
                    <div className="flex flex-col">
                      <span
                        className={`text-base font-semibold leading-tight tracking-[-0.02em] md:text-lg ${theme.number}`}
                      >
                        {column.code}
                      </span>
                      <span className="text-base font-semibold leading-tight tracking-[-0.01em] text-foreground">
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
