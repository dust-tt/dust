/**
 * Lucide icon wrappers for conversation views.
 * Sets strokeWidth={1.5} for a lighter feel.
 */
import type { LucideProps } from "lucide-react";
import * as L from "lucide-react";
import type { ComponentType } from "react";
import { createElement, forwardRef } from "react";

function withStroke(Icon: ComponentType<LucideProps>): ComponentType<LucideProps> {
  const Wrapped = forwardRef<SVGSVGElement, LucideProps>((props, ref) =>
    createElement(Icon, { ref, strokeWidth: 2.0, size: 16, ...props })
  );
  Wrapped.displayName = Icon.displayName ?? Icon.name;
  return Wrapped;
}

// Conversation view icons.
export const ArrowDown = withStroke(L.ArrowDown);
export const ArrowLeft = withStroke(L.ArrowLeft);
export const ArrowRight = withStroke(L.ArrowRight);
export const ArrowUp = withStroke(L.ArrowUp);
export const BookOpen = withStroke(L.BookOpen);
export const Bot = withStroke(L.Bot);
export const BotMessageSquare = withStroke(L.BotMessageSquare);
export const Braces = withStroke(L.Braces);
export const Check = withStroke(L.Check);
export const CheckCheck = withStroke(L.CheckCheck);
export const ChevronRight = withStroke(L.ChevronRight);
export const CircleAlert = withStroke(L.CircleAlert);
export const CircleCheck = withStroke(L.CircleCheck);
export const Clipboard = withStroke(L.Clipboard);
export const ClipboardCheck = withStroke(L.ClipboardCheck);
export const Contact = withStroke(L.Contact);
export const ExternalLink = withStroke(L.ExternalLink);
export const EyeOff = withStroke(L.EyeOff);
export const FileText = withStroke(L.FileText);
export const FolderOpen = withStroke(L.FolderOpen);
export const Info = withStroke(L.Info);
export const Link = withStroke(L.Link);
export const ListChecks = withStroke(L.ListChecks);
export const LogIn = withStroke(L.LogIn);
export const MessageSquareText = withStroke(L.MessageCircle);
export const MessagesSquare = withStroke(L.MessageCircle);
export const MoreHorizontal = withStroke(L.MoreHorizontal);
export const Paperclip = withStroke(L.Paperclip);
export const Plus = withStroke(L.Plus);
export const PlusCircle = withStroke(L.PlusCircle);
export const Rocket = withStroke(L.Rocket);
export const RotateCcw = withStroke(L.RotateCcw);
export const Settings = withStroke(L.Settings);
export const Sparkles = withStroke(L.Sparkles);
export const SquarePen = withStroke(L.SquarePen);
export const StopCircle = withStroke(L.StopCircle);
export const TestTube = withStroke(L.TestTube);
export const ThumbsUp = withStroke(L.ThumbsUp);
export const Trash2 = withStroke(L.Trash2);
export const User = withStroke(L.User);
export const Wand2 = withStroke(L.Wand2);
export const X = withStroke(L.X);
export const Zap = withStroke(L.Zap);
export const ZapOff = withStroke(L.ZapOff);

// Navigation & input bar icons.
export const ArrowUpIcon = withStroke(L.ArrowUp);
export const AttachmentIcon = withStroke(L.Paperclip);
export const CameraIcon = withStroke(L.Camera);
export const ChatBubbleLeftRightIcon = withStroke(L.MessageCircle);
export const Cog6ToothIcon = withStroke(L.Settings);
export const GlobeAltIcon = withStroke(L.Globe);
export const PlanetIcon = withStroke(L.Globe);
export const PlusIcon = withStroke(L.Plus);
export const TextIcon = withStroke(L.Type);

// Toolbar icons.
export const BoldIcon = withStroke(L.Bold);
export const CodeBlockIcon = withStroke(L.CodeSquare);
export const CodeSlashIcon = withStroke(L.Code);
export const HeadingIcon = withStroke(L.Heading);
export const ItalicIcon = withStroke(L.Italic);
export const ListCheckIcon = withStroke(L.List);
export const ListOrdered2Icon = withStroke(L.ListOrdered);
export const QuoteTextIcon = withStroke(L.Quote);

// Attachment picker icons.
export const ChevronRightIcon = withStroke(L.ChevronRight);
export const CloudArrowUpIcon = withStroke(L.CloudUpload);
export const MagnifyingGlassIcon = withStroke(L.Search);

// Other.
export const BoltIcon = withStroke(L.Zap);
export const BookOpenIcon = withStroke(L.BookOpen);
export const ChatBubbleBottomCenterTextIcon = withStroke(L.MessageCircle);
export const ContactsRobotIcon = withStroke(L.Bot);
export const DocumentIcon = withStroke(L.FilePlus);
export const HeartIcon = withStroke(L.MessageCircleQuestion);
export const LightbulbIcon = withStroke(L.Lightbulb);
export const MagicIcon = withStroke(L.Wand2);
export const MicIcon = withStroke(L.Mic);
export const PuzzleIcon = withStroke(L.Shapes);
export const RobotIcon = withStroke(L.Bot);
export const SmilePlusIcon = withStroke(L.SmilePlus);
export const ToolsIcon = withStroke(L.Shapes);
