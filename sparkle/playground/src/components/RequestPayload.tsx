import {
  ArrowRight,
  Avatar,
  Checkbox,
  Chip,
  Cube01,
  CubeOutline,
  Eye,
  EyeOff,
  Icon,
  ProgressBar,
  PuzzlePiece01,
  ShapesPlus,
  SpaceClosed,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import type { ReactNode } from "react";

import { getAgentById } from "../data/agents";
import { getIconForFileType } from "../data/dataSources";
import {
  getPlatformLogo,
  getProviderLabel,
  getProviderLogo,
  ROLE_CHIP_COLORS,
  ROLE_LABELS,
  SEAT_CHIP_COLORS,
  SEAT_TYPE_LABELS,
} from "../data/requests";
import type {
  AdminRequest,
  RequestCredit,
  RequestDocument,
  RequestRole,
  RequestTarget,
  User,
} from "../data/types";
import { getUserById } from "../data/users";

/** Credits are shown in full, the way the product prints them. */
export function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US");
}

/** The member a request acts on: its user target, or whoever it is for. */
function getMember(request: AdminRequest): User | undefined {
  if (request.target.kind === "user" && request.target.id) {
    return getUserById(request.target.id);
  }
  return getUserById(request.beneficiaryId ?? request.requesterId);
}

/**
 * A labelled line. It holds a 24px floor so rows keep an even rhythm whether
 * their value is bare text, a chip, or an avatar.
 */
function PayloadRow({
  label,
  children,
  /** Top-align the label when the value runs taller than a line. */
  alignTop = false,
}: {
  label: string;
  children: ReactNode;
  alignTop?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-6 flex-wrap gap-x-3 gap-y-0.5",
        alignTop ? "items-start" : "items-center"
      )}
    >
      <dt className="w-40 shrink-0 py-0.5 text-sm text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "flex min-h-6 min-w-0 flex-1 text-sm text-foreground",
          alignTop ? "flex-col items-stretch" : "items-center"
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/**
 * Entities are named the way they are everywhere else: their mark, then their
 * name. Avatars sit at `xxs` and icons at `sm`, the two sizes that render at
 * the same 20px, so a member lines up with a Pod.
 */
function EntityValue({
  mark,
  name,
  /** Trails the name, for entities that have to say what they are. */
  suffix,
}: {
  mark: ReactNode;
  name: string;
  suffix?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {mark}
      <span className="min-w-0 truncate">{name}</span>
      {suffix}
    </span>
  );
}

function MemberValue({ user }: { user: User }) {
  return (
    <EntityValue
      mark={
        <Avatar
          size="xxs"
          name={user.fullName}
          visual={user.portrait}
          isRounded
        />
      }
      name={user.fullName}
    />
  );
}

/**
 * A Pod or a company Space, each with its own mark. Restricted Pods wear the
 * outlined cube; open ones are never the subject of an access request, which is
 * why that path passes `isRestricted`.
 */
function PlaceValue({
  target,
  isRestricted = target.label.toLowerCase().includes("restricted"),
  /** Names the kind after the place, when which one it is carries weight. */
  showKind = false,
}: {
  target: RequestTarget;
  isRestricted?: boolean;
  showKind?: boolean;
}) {
  const icon =
    target.kind === "space" ? SpaceClosed : isRestricted ? CubeOutline : Cube01;

  return (
    <EntityValue
      mark={<Icon visual={icon} size="sm" />}
      name={target.label}
      suffix={
        showKind ? (
          <span className="shrink-0 text-muted-foreground">
            {target.kind === "space" ? "Space" : "Pod"}
          </span>
        ) : undefined
      }
    />
  );
}

function ToolValue({ label }: { label: string }) {
  return (
    <EntityValue
      mark={<Avatar size="xxs" icon={getPlatformLogo(label) ?? ShapesPlus} />}
      name={label}
    />
  );
}

/** Connections wear their bare platform logo, no avatar around it. */
function ConnectorValue({ label }: { label: string }) {
  const logo = getPlatformLogo(label);
  return (
    <EntityValue
      mark={logo ? <Icon visual={logo} size="sm" /> : null}
      name={label}
    />
  );
}

function AgentValue({ target }: { target: RequestTarget }) {
  const agent = target.id ? getAgentById(target.id) : undefined;

  return (
    <EntityValue
      mark={
        <Avatar
          size="xxs"
          name={target.label}
          emoji={agent?.emoji}
          backgroundColor={agent?.backgroundColor}
        />
      }
      name={target.label}
    />
  );
}

/** Roles keep the colors they wear in the members table. */
function RoleValue({ role }: { role: RequestRole }) {
  return (
    <Chip size="xs" color={ROLE_CHIP_COLORS[role]} label={ROLE_LABELS[role]} />
  );
}

/**
 * A state the request would move something out of, and the one it would move
 * it into. The arrow carries the change, so both sides only have to name a
 * state.
 */
function ChangeValue({ from, to }: { from: ReactNode; to: ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      {from}
      <Icon visual={ArrowRight} size="xs" className="text-muted-foreground" />
      {to}
    </span>
  );
}

function SkillValue({ label }: { label: string }) {
  return (
    <EntityValue
      mark={
        <Avatar
          size="xxs"
          icon={PuzzlePiece01}
          backgroundColor="bg-highlight-50"
          iconColor="text-highlight-700"
        />
      }
      name={label}
    />
  );
}

/**
 * Where the requester stands on credits. Short of the cap that is a share of a
 * quota, so it reads as a bar; at the cap there is nothing left to measure, so
 * it reads as the single fact that matters.
 */
function CreditRows({ credit }: { credit: RequestCredit }) {
  const isOverQuota = credit.usedPercent >= 100;

  return (
    <>
      <PayloadRow label="Quota status">
        {isOverQuota ? (
          <Chip size="xs" color="warning" label="Over quota" />
        ) : (
          <div className="flex items-center gap-3 py-1">
            <span>{credit.usedPercent}%</span>
            <ProgressBar
              label="Credit usage"
              className="h-2 w-40"
              radius="xs"
              values={[
                { value: credit.usedPercent, className: "bg-highlight-500" },
                {
                  value: 100 - credit.usedPercent,
                  className: "bg-muted-background",
                },
              ]}
            />
          </div>
        )}
      </PayloadRow>
      <PayloadRow label="Current seat">
        <Chip
          size="xs"
          color={SEAT_CHIP_COLORS[credit.seatType]}
          label={SEAT_TYPE_LABELS[credit.seatType]}
        />
      </PayloadRow>
      <PayloadRow label="Current limit">
        {formatCredits(credit.limit)} credits/month
      </PayloadRow>
    </>
  );
}

/**
 * Documents listed the way Pod files are: type icon, name, then its source.
 * Pass `onToggle` to make the same list pickable, so approving a selection
 * shows the documents exactly as the request does.
 */
export function DocumentList({
  documents,
  selectedNames,
  onToggle,
}: {
  documents: RequestDocument[];
  selectedNames?: string[];
  onToggle?: (name: string) => void;
}) {
  return (
    <div className="flex flex-col">
      {documents.map((document) => {
        const providerLogo = getProviderLogo(document.provider);
        const providerLabel = getProviderLabel(document.provider);

        const content = (
          <>
            {onToggle && (
              <Checkbox
                checked={selectedNames?.includes(document.name) ?? false}
                onCheckedChange={() => onToggle(document.name)}
              />
            )}
            <Icon visual={getIconForFileType(document.fileType)} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {document.name}
            </span>
            {providerLogo && (
              <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                <Icon visual={providerLogo} size="xs" />
                {providerLabel}
              </span>
            )}
          </>
        );

        const className =
          "flex items-center gap-2 border-border border-b py-2 last:border-b-0";

        return onToggle ? (
          <label
            key={document.name}
            className={cn(className, "cursor-pointer")}
          >
            {content}
          </label>
        ) : (
          <div key={document.name} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

/**
 * What is being asked for. Each type names the entities it acts on — a member,
 * a Pod, a tool, an agent — and leaves the rest to its `details` lines.
 */
export function RequestPayload({ request }: { request: AdminRequest }) {
  const { type, variant, target, destination, roles } = request;
  const member = getMember(request);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="heading-sm text-foreground">Request</h2>
      <dl className="flex flex-col gap-2">
        {request.credit && <CreditRows credit={request.credit} />}

        {(type === "access" || type === "roleChange") && member && (
          <PayloadRow label="Member">
            <MemberValue user={member} />
          </PayloadRow>
        )}

        {type === "access" && (
          <PayloadRow label="Access to">
            <PlaceValue target={target} isRestricted showKind />
          </PayloadRow>
        )}

        {type === "knowledgeManagement" && variant === "connector" && (
          <PayloadRow label="Connection">
            <ConnectorValue label={target.label} />
          </PayloadRow>
        )}

        {type === "knowledgeManagement" && variant === "dataSource" && (
          <PayloadRow label="Destination">
            <PlaceValue target={target} />
          </PayloadRow>
        )}

        {type === "toolAddition" && (
          <PayloadRow label="Tool">
            <ToolValue label={target.label} />
          </PayloadRow>
        )}

        {type === "publication" && (
          <PayloadRow label={variant === "skill" ? "Skill" : "Agent"}>
            {variant === "skill" ? (
              <SkillValue label={target.label} />
            ) : (
              <AgentValue target={target} />
            )}
          </PayloadRow>
        )}

        {destination && (
          <PayloadRow label="Destination">
            <PlaceValue target={destination} />
          </PayloadRow>
        )}

        {request.details?.map((detail) => (
          <PayloadRow key={detail.label} label={detail.label}>
            {detail.value}
          </PayloadRow>
        ))}

        {type === "publication" && (
          <PayloadRow label="Change">
            <ChangeValue
              from={
                <Chip
                  size="xs"
                  color="primary"
                  icon={EyeOff}
                  label="Unpublished"
                />
              }
              to={
                <Chip size="xs" color="success" icon={Eye} label="Published" />
              }
            />
          </PayloadRow>
        )}

        {roles &&
          (roles.current ? (
            <PayloadRow label="Change">
              <ChangeValue
                from={<RoleValue role={roles.current} />}
                to={<RoleValue role={roles.requested} />}
              />
            </PayloadRow>
          ) : (
            <PayloadRow label="Role">
              <RoleValue role={roles.requested} />
            </PayloadRow>
          ))}

        {request.documents && request.documents.length > 0 && (
          <PayloadRow label="Documents" alignTop>
            <DocumentList documents={request.documents} />
          </PayloadRow>
        )}
      </dl>
    </div>
  );
}
