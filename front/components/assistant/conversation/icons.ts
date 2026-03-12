/**
 * Phosphor icon wrappers for conversation views.
 * Uses "regular" weight with size 16.
 */
import type { IconProps } from "@phosphor-icons/react";
import {
  AddressBook,
  ArrowCounterClockwise,
  ArrowSquareOut,
  BracketsCurly,
  Buildings,
  Camera,
  CaretRight,
  ChatCircle,
  CheckCircle,
  Checks,
  ClipboardText,
  CloudArrowUp,
  Code,
  CodeBlock,
  DotsThree,
  EyeSlash,
  FilePlus,
  Gear,
  Globe,
  Lightbulb,
  Lightning,
  LightningSlash,
  List,
  ListNumbers,
  MagicWand,
  MagnifyingGlass,
  Microphone,
  PencilSimple,
  ArrowDown as PhArrowDown,
  ArrowLeft as PhArrowLeft,
  ArrowRight as PhArrowRight,
  ArrowUp as PhArrowUp,
  BookOpen as PhBookOpen,
  Check as PhCheck,
  Clipboard as PhClipboard,
  FileText as PhFileText,
  FolderOpen as PhFolderOpen,
  Info as PhInfo,
  Link as PhLink,
  ListChecks as PhListChecks,
  Paperclip as PhPaperclip,
  Plus as PhPlus,
  PlusCircle as PhPlusCircle,
  Rocket as PhRocket,
  StopCircle as PhStopCircle,
  TestTube as PhTestTube,
  ThumbsUp as PhThumbsUp,
  User as PhUser,
  X as PhX,
  Planet,
  PuzzlePiece,
  Quotes,
  SignIn,
  Smiley,
  Sparkle,
  TextB,
  TextH,
  TextItalic,
  TextT,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import type { LucideProps } from "lucide-react";
import { Bot as LucideBot, Package, Package2, Shapes } from "lucide-react";
import type { ComponentType } from "react";
import { createElement, forwardRef } from "react";

function withDefaults(
  Icon: ComponentType<IconProps>
): ComponentType<IconProps> {
  const Wrapped = forwardRef<SVGSVGElement, IconProps>((props, ref) =>
    createElement(Icon, { ref, size: 16, weight: "regular", ...props })
  );
  Wrapped.displayName = (Icon as any).displayName ?? (Icon as any).name;
  return Wrapped;
}

function withLucideDefaults(
  Icon: ComponentType<LucideProps>
): ComponentType<LucideProps> {
  const Wrapped = forwardRef<SVGSVGElement, LucideProps>((props, ref) =>
    createElement(Icon, { ref, strokeWidth: 1.5, ...props })
  );
  Wrapped.displayName = Icon.displayName ?? Icon.name;
  return Wrapped;
}

// Conversation view icons.
export const ArrowDown = withDefaults(PhArrowDown);
export const ArrowLeft = withDefaults(PhArrowLeft);
export const ArrowRight = withDefaults(PhArrowRight);
export const ArrowUp = withDefaults(PhArrowUp);
export const BookOpen = withDefaults(PhBookOpen);
export const Bot = withLucideDefaults(LucideBot);
export const BotMessageSquare = withLucideDefaults(LucideBot);
export const Braces = withDefaults(BracketsCurly);
export const Check = withDefaults(PhCheck);
export const CheckCheck = withDefaults(Checks);
export const ChevronRight = withDefaults(CaretRight);
export const CircleAlert = withDefaults(WarningCircle);
export const CircleCheck = withDefaults(CheckCircle);
export const Clipboard = withDefaults(PhClipboard);
export const ClipboardCheck = withDefaults(ClipboardText);
export const Contact = withDefaults(AddressBook);
export const ExternalLink = withDefaults(ArrowSquareOut);
export const EyeOff = withDefaults(EyeSlash);
export const FileText = withDefaults(PhFileText);
export const FolderOpen = withDefaults(PhFolderOpen);
export const Info = withDefaults(PhInfo);
export const Link = withDefaults(PhLink);
export const ListChecks = withDefaults(PhListChecks);
export const LogIn = withDefaults(SignIn);
export const MessageSquareText = withDefaults(ChatCircle);
export const MessagesSquare = withDefaults(ChatCircle);
export const MoreHorizontal = withDefaults(DotsThree);
export const Paperclip = withDefaults(PhPaperclip);
export const Plus = withDefaults(PhPlus);
export const PlusCircle = withDefaults(PhPlusCircle);
export const Rocket = withDefaults(PhRocket);
export const RotateCcw = withDefaults(ArrowCounterClockwise);
export const Settings = withDefaults(Gear);
export const Sparkles = withDefaults(Sparkle);
export const SquarePen = withDefaults(PencilSimple);
export const StopCircle = withDefaults(PhStopCircle);
export const TestTube = withDefaults(PhTestTube);
export const ThumbsUp = withDefaults(PhThumbsUp);
export const Trash2 = withDefaults(Trash);
export const User = withDefaults(PhUser);
export const Wand2 = withDefaults(MagicWand);
export const X = withDefaults(PhX);
export const Zap = withDefaults(Lightning);
export const ZapOff = withDefaults(LightningSlash);

// Navigation & input bar icons.
export const ArrowUpIcon = withDefaults(PhArrowUp);
export const AttachmentIcon = withDefaults(PhPaperclip);
export const CameraIcon = withDefaults(Camera);
export const ChatBubbleLeftRightIcon = withDefaults(ChatCircle);
export const Cog6ToothIcon = (() => {
  const Wrapped = forwardRef<SVGSVGElement, IconProps>((props, ref) =>
    createElement(Buildings, { ref, size: 16, weight: "light", ...props })
  );
  Wrapped.displayName = "Cog6ToothIcon";
  return Wrapped;
})();
export const GlobeAltIcon = withDefaults(Globe);
export const PlanetIcon = withDefaults(Planet);
export const PlusIcon = withDefaults(PhPlus);
export const TextIcon = withDefaults(TextT);

// Toolbar icons.
export const BoldIcon = withDefaults(TextB);
export const CodeBlockIcon = withDefaults(CodeBlock);
export const CodeSlashIcon = withDefaults(Code);
export const HeadingIcon = withDefaults(TextH);
export const ItalicIcon = withDefaults(TextItalic);
export const ListCheckIcon = withDefaults(List);
export const ListOrdered2Icon = withDefaults(ListNumbers);
export const QuoteTextIcon = withDefaults(Quotes);

// Attachment picker icons.
export const ChevronRightIcon = withDefaults(CaretRight);
export const CloudArrowUpIcon = withDefaults(CloudArrowUp);
export const MagnifyingGlassIcon = withDefaults(MagnifyingGlass);

// Other.
export const BoltIcon = withDefaults(Lightning);
export const BookOpenIcon = withDefaults(PhBookOpen);
export const ChatBubbleBottomCenterTextIcon = withDefaults(ChatCircle);
export const ContactsRobotIcon = withLucideDefaults(LucideBot);
export const DocumentIcon = withDefaults(FilePlus);
export const HeartIcon = withDefaults(ChatCircle);
export const LightbulbIcon = withDefaults(Lightbulb);
export const MagicIcon = withDefaults(MagicWand);
export const MicIcon = withDefaults(Microphone);
export const PuzzleIcon = withDefaults(PuzzlePiece);
export const RobotIcon = withLucideDefaults(LucideBot);
export const SmilePlusIcon = withDefaults(Smiley);
export const ToolsIcon = withLucideDefaults(Shapes);

// Project icons.
export const SpaceOpenIcon = withLucideDefaults(Package);
export const SpaceClosedIcon = withLucideDefaults(Package2);
