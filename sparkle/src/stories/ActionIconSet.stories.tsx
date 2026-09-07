import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import * as ActionIcons from "@sparkle/icons/actions";
import * as V2StrokeIcons from "@sparkle/icons/v2-stroke";

import { Icon } from "../index_with_tw_base";

type IconModule = {
  [key: string]: React.ComponentType<{ className?: string }> & {
    default?: React.ComponentType<{ className?: string }>;
  };
};

const meta = {
  title: "Assets/Action Icons",
  tags: ["!manifest", "autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Catalog of the Sparkle action icon set (\`@sparkle/icons/actions\`) — the filled glyphs used for agent tools and capabilities. Browse for the icon you need, then import it by name and render it through the **Icon** component (or pass it to a component's \`icon\` prop) rather than embedding raw SVGs.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: "48px 16px",
};
const itemStyle: React.CSSProperties = {
  marginTop: "12px",
  textOverflow: "ellipsis",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textAlign: "left",
  width: "100%",
};

const renderIconGrid = (icons: IconModule) => (
  <div style={gridStyle}>
    {Object.entries(icons).map(([iconName, IconComponent]) => {
      const CurrentIcon = (
        "default" in IconComponent ? IconComponent.default : IconComponent
      ) as React.ComponentType<{ className?: string }>;
      return (
        <div key={iconName}>
          <Icon visual={CurrentIcon} size="md" className="text-foreground" />
          <div style={itemStyle} className="text-sm text-foreground">
            {iconName}
          </div>
        </div>
      );
    })}
  </div>
);

export const ActionIconSet: Story = {
  render: () => renderIconGrid(ActionIcons as IconModule),
};

/*
 * Migration review table.
 *
 * Extracted from the `OldIcons` page of the "Sparkle Icons" Figma file
 * (fileKey VI4wJUjAzkaQ3EOanVGIW8, page 514:55), a two-column board pairing each
 * legacy `actions/<name>` icon with its proposed v2-stroke replacement. Rows are in
 * board order, top to bottom.
 *
 * The board side is a hand-maintained snapshot: it does NOT re-read Figma, so it
 * drifts whenever the board changes. Edit rows in place as decisions get made.
 * Everything that can be answered by the repo instead — whether a target exists,
 * and whether two rows want the same one — is derived below rather than stored, so
 * a row cannot go stale just because the v2-stroke set gained or lost an icon.
 */
type MigrationStatus = "ready" | "target-missing" | "orphan" | "no-proposal";

/**
 * The two statuses the icon modules cannot answer, so they are declared per row:
 * `orphan` (the board's left-hand icon has no source in `src/icons/src/actions`,
 * even where a same-named export survives in the generated set) and `no-proposal`
 * (a local action icon the board has no row for).
 */
type DeclaredStatus = Extract<MigrationStatus, "orphan" | "no-proposal">;

type MigrationEntry = {
  /** Legacy icon name, kebab-case, as in `src/icons/src/actions/<action>.svg`. */
  action: string;
  /** Export in `@sparkle/icons/actions`, or null when the row has no local icon. */
  actionExport: string | null;
  /** Proposed replacement, kebab-case, as named on the Figma board. */
  target: string | null;
  status?: DeclaredStatus;
};

type MigrationRow = Omit<MigrationEntry, "status"> & {
  /** Export in `@sparkle/icons/v2-stroke`, or null when the target is not in the repo. */
  targetExport: string | null;
  status: MigrationStatus;
  /** True when this target is proposed for more than one action icon. */
  collision: boolean;
};

// biome-ignore format: one row per line keeps this readable as a table.
const MIGRATION_MAPPING: MigrationEntry[] = [
  { action: "credit-coins", actionExport: "ActionCreditCoinsIcon", target: "coins-stacked-03", status: "orphan" },
  { action: "MapPin", actionExport: "ActionMapPinIcon", target: "marker-pin-01", status: "orphan" },
  { action: "speak", actionExport: "ActionSpeakIcon", target: "message-smile-circle" },
  { action: "noise", actionExport: "ActionNoiseIcon", target: "volume-noise" },
  { action: "frame", actionExport: "ActionFrameIcon", target: "action-frame" },
  { action: "chat-bubble-bottom-center-text", actionExport: "ActionChatBubbleBottomCenterTextIcon", target: "message-circle-01" },
  { action: "chat-bubble-thought", actionExport: "ActionChatBubbleThoughtIcon", target: "message-dots-circle" },
  { action: "atom", actionExport: "ActionAtomIcon", target: "atom-01" },
  { action: "globe-alt", actionExport: "ActionGlobeAltIcon", target: "globe-01" },
  { action: "brush", actionExport: null, target: "brush-01", status: "orphan" },
  { action: "space", actionExport: null, target: "cube-01", status: "orphan" },
  { action: "brain", actionExport: "ActionBrainIcon", target: "brain" },
  { action: "include", actionExport: "ActionIncludeIcon", target: "arrow-circle-broken-right" },
  { action: "scan", actionExport: "ActionScanIcon", target: "scan-file" },
  { action: "magnifying-glass", actionExport: "ActionMagnifyingGlassIcon", target: "search-md" },
  { action: "table", actionExport: "ActionTableIcon", target: "layout-grid-02" },
  { action: "command", actionExport: "ActionCommandIcon", target: "terminal-square" },
  { action: "plus", actionExport: "ActionPlusIcon", target: "plus" },
  { action: "document", actionExport: "ActionDocumentIcon", target: "file-04" },
  { action: "document-plus", actionExport: "ActionDocumentPlusIcon", target: "file-plus-03" },
  { action: "folder-open", actionExport: "ActionFolderOpenIcon", target: "folder-open" },
  { action: "folder-add", actionExport: "ActionFolderAddIcon", target: "folder-plus" },
  { action: "folder", actionExport: "ActionFolderIcon", target: "folder" },
  { action: "cloud-arrow-down", actionExport: "ActionCloudArrowDownIcon", target: "download-cloud-02" },
  { action: "cloud-arrow-up", actionExport: "ActionCloudArrowUpIcon", target: "upload-cloud-02" },
  { action: "cloud-arrow-left-right", actionExport: "ActionCloudArrowLeftRightIcon", target: "sync-cloud-02" },
  { action: "menu", actionExport: "ActionMenuIcon", target: "menu-01" },
  { action: "filter", actionExport: "ActionFilterIcon", target: "filter-lines" },
  { action: "document-pile", actionExport: "ActionDocumentPileIcon", target: "document-pile" },
  { action: "document-text", actionExport: "ActionDocumentTextIcon", target: "file-06" },
  { action: "code-box", actionExport: "ActionCodeBoxIcon", target: "code-square-01" },
  { action: "home", actionExport: "ActionHomeIcon", target: "home-02" },
  { action: "building", actionExport: "ActionBuildingIcon", target: "building-05" },
  { action: "check-circle", actionExport: "ActionCheckCircleIcon", target: "check-circle" },
  { action: "x-circle", actionExport: "ActionXCircleIcon", target: "x-circle" },
  { action: "code-block", actionExport: "ActionCodeBlockIcon", target: "code-browser" },
  { action: "arrow-up-on-square", actionExport: "ActionArrowUpOnSquareIcon", target: "upload-01" },
  { action: "server", actionExport: "ActionServerIcon", target: "server-03" },
  { action: "cube", actionExport: "ActionCubeIcon", target: "cube-01" },
  { action: "square-3-stack-3d", actionExport: "ActionSquare3Stack3DIcon", target: "layers-three-01" },
  { action: "plus-circle", actionExport: "ActionPlusCircleIcon", target: "plus-circle" },
  { action: "clipboard", actionExport: "ActionClipboardIcon", target: "clipboard" },
  { action: "lightbulb", actionExport: "ActionLightbulbIcon", target: "lightbulb-01" },
  { action: "test-tube", actionExport: "ActionTestTubeIcon", target: "beaker-02" },
  { action: "planet", actionExport: "ActionPlanetIcon", target: "planet" },
  { action: "hospital", actionExport: "ActionHospitalIcon", target: "building-hospital" },
  { action: "arrow-down-on-square", actionExport: "ActionArrowDownOnSquareIcon", target: "download-01" },
  { action: "robot", actionExport: "ActionRobotIcon", target: "robot" },
  { action: "user-group", actionExport: "ActionUserGroupIcon", target: "users-01" },
  { action: "user", actionExport: "ActionUserIcon", target: "user-01" },
  { action: "magic", actionExport: "ActionMagicIcon", target: "magic-wand-02" },
  { action: "pencil-square", actionExport: "ActionPencilSquareIcon", target: "edit-04" },
  { action: "community", actionExport: "ActionCommunityIcon", target: "building-home" },
  { action: "emotion-laugh", actionExport: "ActionEmotionLaughIcon", target: "face-happy" },
  { action: "store", actionExport: "ActionStoreIcon", target: "building-02" },
  { action: "bank", actionExport: "ActionBankIcon", target: "bank" },
  { action: "logout", actionExport: "ActionLogoutIcon", target: "log-out-01" },
  { action: "rocket", actionExport: "ActionRocketIcon", target: "rocket-02" },
  { action: "card", actionExport: "ActionCardIcon", target: "credit-card-01" },
  { action: "external-link", actionExport: "ActionExternalLinkIcon", target: "link-external-01" },
  { action: "fullscreen-exit", actionExport: "ActionFullscreenExitIcon", target: "minimize-01" },
  { action: "braces", actionExport: "ActionBracesIcon", target: "brackets" },
  { action: "book-open", actionExport: "ActionBookOpenIcon", target: "book-open-01" },
  { action: "paint", actionExport: "ActionPaintIcon", target: "paint" },
  { action: "fullscreen", actionExport: "ActionFullscreenIcon", target: "maximize-01" },
  { action: "mail", actionExport: "ActionMailIcon", target: "mail-01" },
  { action: "pie-chart", actionExport: "ActionPieChartIcon", target: "pie-chart-01" },
  { action: "medal", actionExport: "ActionMedalIcon", target: "award-01" },
  { action: "inbox", actionExport: "ActionInboxIcon", target: "inbox-01" },
  { action: "mail-close", actionExport: "ActionMailCloseIcon", target: "mail-close" },
  { action: "mail-ai", actionExport: "ActionMailAiIcon", target: "mail-ai" },
  { action: "list-check", actionExport: "ActionListCheckIcon", target: "list-select" },
  { action: "stop-sign", actionExport: "ActionStopSignIcon", target: "slash-circle-01" },
  { action: "company", actionExport: "ActionCompanyIcon", target: "building-04" },
  { action: "translate", actionExport: "ActionTranslateIcon", target: "translate-01" },
  { action: "command-1", actionExport: "ActionCommand1Icon", target: "command" },
  { action: "list", actionExport: "ActionListIcon", target: "list" },
  { action: "calendar", actionExport: "ActionCalendarIcon", target: "calendar" },
  { action: "calendar-check", actionExport: "ActionCalendarCheckIcon", target: "calendar-check-01" },
  { action: "printer", actionExport: "ActionPrinterIcon", target: "printer" },
  { action: "slideshow", actionExport: "ActionSlideshowIcon", target: "presentation-chart-01" },
  { action: "megaphone", actionExport: "ActionMegaphoneIcon", target: "announcement-01" },
  { action: "mark-pen", actionExport: "ActionMarkPenIcon", target: "mark-pen" },
  { action: "layout", actionExport: "ActionLayoutIcon", target: "columns-03" },
  { action: "customer-service", actionExport: "ActionCustomerServiceIcon", target: "headphones-01" },
  { action: "briefcase", actionExport: "ActionBriefcaseIcon", target: "briefcase-01" },
  { action: "git-fork", actionExport: "ActionGitForkIcon", target: "dataflow-01" },
  { action: "git-branch", actionExport: "ActionGitBranchIcon", target: "dataflow-02" },
  { action: "double-quotes", actionExport: "ActionDoubleQuotesIcon", target: "double-quotes" },
  { action: "numbers", actionExport: "ActionNumbersIcon", target: "bar-chart-12" },
  { action: "trophy", actionExport: "ActionTrophyIcon", target: "trophy-01" },
  { action: "shopping-basket", actionExport: "ActionShoppingBasketIcon", target: "shopping-bag-01" },
  { action: "safe", actionExport: "ActionSafeIcon", target: "safe" },
  { action: "attachment", actionExport: "ActionAttachmentIcon", target: "attachment-01" },
  { action: "dashboard", actionExport: "ActionDashboardIcon", target: "speedometer-03" },
  { action: "barcode", actionExport: "ActionBarcodeIcon", target: "qr-code-01" },
  { action: "identity", actionExport: "ActionIdentityIcon", target: "fingerprint-03" },
  { action: "gamepad", actionExport: "ActionGamepadIcon", target: "gaming-pad-02" },
  { action: "save", actionExport: "ActionSaveIcon", target: "save-01" },
  { action: "database", actionExport: "ActionDatabaseIcon", target: "database-01" },
  { action: "map-pin", actionExport: "ActionMapPinIcon", target: "marker-pin-01" },
  { action: "pin-distance", actionExport: "ActionPinDistanceIcon", target: "route" },
  { action: "movie", actionExport: "ActionMovieIcon", target: "youtube" },
  { action: "hand-heart", actionExport: "ActionHandHeartIcon", target: "heart-hand" },
  { action: "train", actionExport: "ActionTrainIcon", target: "train" },
  { action: "ship", actionExport: "ActionShipIcon", target: "anchor" },
  { action: "flight-land", actionExport: "ActionFlightLandIcon", target: "plane-land" },
  { action: "pushpin", actionExport: "ActionPushpinIcon", target: "pin-02" },
  { action: "flight-takeoff", actionExport: "ActionFlightTakeoffIcon", target: "plane-takeoff" },
  { action: "car", actionExport: "ActionCarIcon", target: "car-01" },
  { action: "map", actionExport: "ActionMapIcon", target: "map-01" },
  { action: "globe", actionExport: "ActionGlobeIcon", target: "globe-slated-02" },
  { action: "vidicon", actionExport: "ActionVidiconIcon", target: "video-recorder" },
  { action: "camera", actionExport: "ActionCameraIcon", target: "camera-01" },
  { action: "mic", actionExport: "ActionMicIcon", target: "microphone-01" },
  { action: "volume-up", actionExport: "ActionVolumeUpIcon", target: "volume-max" },
  { action: "hand-thumb-down", actionExport: "ActionHandThumbDownIcon", target: "thumbs-down" },
  { action: "trash", actionExport: "ActionTrashIcon", target: "trash-01" },
  { action: "eye", actionExport: "ActionEyeIcon", target: "eye" },
  { action: "eye-slash", actionExport: "ActionEyeSlashIcon", target: "eye-off" },
  { action: "sparkles", actionExport: "ActionSparklesIcon", target: "stars-02" },
  { action: "film", actionExport: "ActionFilmIcon", target: "film-03" },
  { action: "image", actionExport: "ActionImageIcon", target: "image-01" },
  { action: "hand-thumb-up", actionExport: "ActionHandThumbUpIcon", target: "thumbs-up" },
  { action: "sun", actionExport: "ActionSunIcon", target: "sun" },
  { action: "t-shirt", actionExport: "ActionTShirtIcon", target: "t-shirt" },
  { action: "rainbow", actionExport: "ActionRainbowIcon", target: "rainbow" },
  { action: "fire", actionExport: "ActionFireIcon", target: "fire" },
  { action: "moon", actionExport: "ActionMoonIcon", target: "moon-01" },
  { action: "beer", actionExport: "ActionBeerIcon", target: "beer" },
  { action: "cup", actionExport: "ActionCupIcon", target: "cup" },
  { action: "tag", actionExport: "ActionTagIcon", target: "tag-01" },
  { action: "heart", actionExport: "ActionHeartIcon", target: "heart" },
  { action: "time", actionExport: "ActionTimeIcon", target: "clock" },
  { action: "lock", actionExport: "ActionLockIcon", target: "lock-01" },
  { action: "flag", actionExport: "ActionFlagIcon", target: "flag-01" },
  { action: "shake-hands", actionExport: "ActionShakeHandsIcon", target: "shake-hands" },
  { action: "issue", actionExport: null, target: "refresh-cw-05", status: "orphan" },
  { action: "ping-pong", actionExport: "ActionPingPongIcon", target: "ping-pong" },
  { action: "umbrella", actionExport: "ActionUmbrellaIcon", target: "umbrella-02" },
  { action: "seedling", actionExport: "ActionSeedlingIcon", target: "seedling" },
  { action: "scales", actionExport: "ActionScalesIcon", target: "scales-01" },
  { action: "graduation-cap", actionExport: "ActionGraduationCapIcon", target: "graduation-hat-01" },
  { action: "armchair", actionExport: "ActionArmchairIcon", target: "armchair" },
  { action: "shirt", actionExport: "ActionShirtIcon", target: "shirt" },
  { action: "sword", actionExport: "ActionSwordIcon", target: "sword" },
  { action: "calculator", actionExport: "ActionCalculatorIcon", target: "calculator" },
  // Not on the Figma board at all — no replacement has been proposed.
  { action: "hashtag", actionExport: "ActionHashtagIcon", target: "hash-02" },
];

/** Mirrors SVGR's file naming: `download-cloud-02` → `DownloadCloud02`. */
const toExportName = (target: string) =>
  target
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");

const resolveTargetExport = (target: string | null) => {
  if (!target) {
    return null;
  }
  const exportName = toExportName(target);
  return exportName in V2StrokeIcons ? exportName : null;
};

/*
 * Orphan rows are excluded from the collision count: with no local action icon
 * behind them they are not competing for a replacement, so a target they share
 * with a real row needs no decision.
 */
const MIGRATION_ROWS: MigrationRow[] = (() => {
  const contested = new Map<string, number>();
  for (const entry of MIGRATION_MAPPING) {
    if (entry.target && entry.status !== "orphan") {
      contested.set(entry.target, (contested.get(entry.target) ?? 0) + 1);
    }
  }
  return MIGRATION_MAPPING.map((entry) => {
    const targetExport = resolveTargetExport(entry.target);
    return {
      ...entry,
      targetExport,
      status: entry.status ?? (targetExport ? "ready" : "target-missing"),
      collision: entry.target ? (contested.get(entry.target) ?? 0) > 1 : false,
    };
  });
})();

const STATUS_LABEL: Record<MigrationStatus, string> = {
  ready: "Ready",
  "target-missing": "Target missing from repo",
  orphan: "Orphan row (no local action icon)",
  "no-proposal": "No proposal on the board",
};

const STATUS_HINT: Record<MigrationStatus, string> = {
  ready: "Both sides exist. Review the pair visually and approve or reject.",
  "target-missing":
    "The board proposes a replacement that is not exported from @sparkle/icons/v2-stroke. Export it from Figma, or pick a different target.",
  orphan:
    "The board has a row whose left-hand icon has no source in src/icons/src/actions. Decide whether to drop the row or add the icon.",
  "no-proposal":
    "A local action icon with no row on the board. It needs a replacement chosen before the set can be deleted.",
};

const lookupIcon = (module: IconModule, exportName: string | null) => {
  if (!exportName) {
    return null;
  }
  const entry = module[exportName];
  if (!entry) {
    return null;
  }
  return ("default" in entry ? entry.default : entry) as React.ComponentType<{
    className?: string;
  }>;
};

const MissingSlot = ({ label }: { label: string }) => (
  <div
    className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-dashed border-warning-400 text-xs text-warning-500"
    title={label}
  >
    ?
  </div>
);

const MappingRow = ({ row }: { row: MigrationRow }) => {
  const ActionIcon = lookupIcon(ActionIcons as IconModule, row.actionExport);
  const TargetIcon = lookupIcon(V2StrokeIcons as IconModule, row.targetExport);
  return (
    <div className="flex items-center gap-3 border-b border-border py-2">
      <div className="flex w-1/2 min-w-0 items-center gap-3">
        {ActionIcon ? (
          <Icon visual={ActionIcon} size="md" className="text-foreground" />
        ) : (
          <MissingSlot label={`No action icon for "${row.action}"`} />
        )}
        <span className="truncate text-sm text-foreground">{row.action}</span>
      </div>
      <span className="shrink-0 text-sm text-muted-foreground">&rarr;</span>
      <div className="flex w-1/2 min-w-0 items-center gap-3">
        {TargetIcon ? (
          <Icon visual={TargetIcon} size="md" className="text-foreground" />
        ) : (
          <MissingSlot label={`Not in v2-stroke: "${row.target ?? "none"}"`} />
        )}
        <span className="truncate text-sm text-foreground">
          {row.target ?? "— no proposal —"}
        </span>
        {row.collision ? (
          <span className="shrink-0 rounded bg-warning-100 px-1.5 py-0.5 text-xs text-warning-800">
            shared target
          </span>
        ) : null}
      </div>
    </div>
  );
};

const Section = ({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: MigrationRow[];
}) => (
  <section className="mb-10">
    <h3 className="heading-lg text-foreground">
      {title} ({rows.length})
    </h3>
    <p className="mb-3 text-sm text-muted-foreground">{hint}</p>
    <div className="border-t border-border">
      {rows.map((row) => (
        <MappingRow key={`${title}-${row.action}`} row={row} />
      ))}
    </div>
  </section>
);

const STATUS_ORDER: MigrationStatus[] = [
  "no-proposal",
  "target-missing",
  "orphan",
  "ready",
];

/**
 * @summary Side-by-side review of every proposed action-icon → v2-stroke replacement.
 */
export const MigrationReview: Story = {
  render: () => {
    const collisionRows = MIGRATION_ROWS.filter((row) => row.collision);
    const collisionTargets = Array.from(
      new Set(collisionRows.map((row) => row.target))
    );
    return (
      <div>
        <h2 className="heading-xl text-foreground">
          Action icon migration review
        </h2>
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Proposed replacements for the legacy <code>actions</code> set,
          extracted from the <code>OldIcons</code> Figma board. Left is
          today&apos;s action icon, right is the proposed v2-stroke replacement.
          Problem rows come first; the{" "}
          {MIGRATION_ROWS.filter((r) => r.status === "ready").length} ready
          pairs are at the bottom.
        </p>
        <div className="mb-8 flex flex-wrap gap-2">
          {STATUS_ORDER.map((status) => (
            <span
              key={status}
              className="rounded border border-border px-2 py-1 text-sm text-foreground"
            >
              {STATUS_LABEL[status]}:{" "}
              <strong>
                {MIGRATION_ROWS.filter((row) => row.status === status).length}
              </strong>
            </span>
          ))}
          <span className="rounded border border-border px-2 py-1 text-sm text-foreground">
            Total rows: <strong>{MIGRATION_ROWS.length}</strong>
          </span>
        </div>

        <Section
          title="Shared targets — one replacement, several action icons"
          hint={`${collisionTargets.length} targets are each proposed for more than one action icon: ${collisionTargets.join(", ")}. Each needs a decision — collapse the icons, or pick a distinct replacement. These rows also appear under their status below.`}
          rows={collisionRows}
        />

        {STATUS_ORDER.map((status) => (
          <Section
            key={status}
            title={STATUS_LABEL[status]}
            hint={STATUS_HINT[status]}
            rows={MIGRATION_ROWS.filter((row) => row.status === status)}
          />
        ))}
      </div>
    );
  },
};
