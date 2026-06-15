import type { ComponentType, SVGProps } from "react";

import Ai21Logo from "./Ai21";
import AmplitudeLogo from "./Amplitude";
import AnthropicLogo from "./Anthropic";
import ApifyLogo from "./Apify";
import AsanaLogo from "./Asana";
import AshbyLogo from "./Ashby";
import AttioLogo from "./Attio";
import BigQueryLogo from "./BigQuery";
import CanvaLogo from "./Canva";
import ChromeLogo from "./Chrome";
import ClariLogo from "./Clari";
import ClaudeLogo from "./Claude";
import CohereLogo from "./Cohere";
import ConfluenceLogo from "./Confluence";
import ContentsquareLogo from "./Contentsquare";
import CostoryLogo from "./Costory";
import DatadogLogo from "./Datadog";
import DeepseekLogo from "./Deepseek";
import DiscordLogo from "./Discord";
import DocLogo from "./Doc";
import DriveLogo from "./Drive";
import FathomLogo from "./Fathom";
import FigmaLogo from "./Figma";
import FirefoxLogo from "./Firefox";
import FireworksLogo from "./Fireworks";
import FrameLogo from "./Frame";
import FreshdeskLogo from "./Freshdesk";
import FreshserviceLogo from "./Freshservice";
import FrontLogo from "./Front";
import GammaLogo from "./Gamma";
import GcalLogo from "./Gcal";
import GeminiLogo from "./Gemini";
import GithubLogo from "./Github";
import GithubMonoLogo from "./GithubMono";
import GithubWhiteLogo from "./GithubWhite";
import GitlabLogo from "./Gitlab";
import GmailLogo from "./Gmail";
import GongLogo from "./Gong";
import GoogleLogo from "./Google";
import GoogleDocLogo from "./GoogleDoc";
import GooglePdfLogo from "./GooglePdf";
import GoogleSlideLogo from "./GoogleSlide";
import GoogleSpreadsheetLogo from "./GoogleSpreadsheet";
import GranolaLogo from "./Granola";
import GrokLogo from "./Grok";
import GuruLogo from "./Guru";
import HexLogo from "./Hex";
import HubspotLogo from "./Hubspot";
import HuggingFaceLogo from "./HuggingFace";
import ImageLogo from "./Image";
import IntercomLogo from "./Intercom";
import JiraLogo from "./Jira";
import LinearLogo from "./Linear";
import LinearWhiteLogo from "./LinearWhite";
import LinkedinLogo from "./Linkedin";
import LumaLogo from "./Luma";
import MetaLogo from "./Meta";
import MicrosoftLogo from "./Microsoft";
import MicrosoftExcelLogo from "./MicrosoftExcel";
import MicrosoftOutlookLogo from "./MicrosoftOutlook";
import MicrosoftPowerpointLogo from "./MicrosoftPowerpoint";
import MicrosoftTeamsLogo from "./MicrosoftTeams";
import MicrosoftWordLogo from "./MicrosoftWord";
import MiroLogo from "./Miro";
import MistralLogo from "./Mistral";
import MondayLogo from "./Monday";
import NaptaLogo from "./Napta";
import NetSuiteLogo from "./NetSuite";
import NotionLogo from "./Notion";
import OfficeLogo from "./Office";
import OpenaiLogo from "./Openai";
import OutlookLogo from "./Outlook";
import PdfLogo from "./Pdf";
import PowerBiLogo from "./PowerBi";
import PraizLogo from "./Praiz";
import ProductboardLogo from "./Productboard";
import ReplicateLogo from "./Replicate";
import SalesforceLogo from "./Salesforce";
import SalesloftLogo from "./Salesloft";
import SemrushLogo from "./Semrush";
import SlabLogo from "./Slab";
import SlackLogo from "./Slack";
import SlideLogo from "./Slide";
import SnowflakeLogo from "./Snowflake";
import StatuspageLogo from "./Statuspage";
import StripeLogo from "./Stripe";
import SupabaseLogo from "./Supabase";
import TableLogo from "./Table";
import TogetheraiLogo from "./Togetherai";
import UkgLogo from "./Ukg";
import ValTownLogo from "./ValTown";
import VantaLogo from "./Vanta";
import VideoLogo from "./Video";
import ZapierLogo from "./Zapier";
import ZendeskLogo from "./Zendesk";
import ZendeskWhiteLogo from "./ZendeskWhite";

type LogoComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Single source of truth for the platform logos exposed by Sparkle. Keyed by
// the same component name used in `./index` (e.g. "GammaLogo"). Consumers that
// need to resolve a logo from a string name (wire-format payloads, dynamic
// rendering) should use `getPlatformLogo` rather than maintaining their own
// allowlists, which inevitably drift between apps.
export const PLATFORM_LOGOS = {
  Ai21Logo,
  AmplitudeLogo,
  AnthropicLogo,
  ApifyLogo,
  AsanaLogo,
  AshbyLogo,
  AttioLogo,
  BigQueryLogo,
  CanvaLogo,
  ChromeLogo,
  ClariLogo,
  ClaudeLogo,
  CohereLogo,
  ConfluenceLogo,
  ContentsquareLogo,
  CostoryLogo,
  DatadogLogo,
  DeepseekLogo,
  DiscordLogo,
  DocLogo,
  DriveLogo,
  FathomLogo,
  FigmaLogo,
  FirefoxLogo,
  FireworksLogo,
  FrameLogo,
  FreshdeskLogo,
  FreshserviceLogo,
  FrontLogo,
  GammaLogo,
  GcalLogo,
  GeminiLogo,
  GithubLogo,
  GithubMonoLogo,
  GithubWhiteLogo,
  GitlabLogo,
  GmailLogo,
  GongLogo,
  GoogleLogo,
  GoogleDocLogo,
  GooglePdfLogo,
  GoogleSlideLogo,
  GoogleSpreadsheetLogo,
  GranolaLogo,
  GrokLogo,
  GuruLogo,
  HexLogo,
  HubspotLogo,
  HuggingFaceLogo,
  ImageLogo,
  IntercomLogo,
  JiraLogo,
  LinearLogo,
  LinearWhiteLogo,
  LinkedinLogo,
  LumaLogo,
  MetaLogo,
  MicrosoftLogo,
  MicrosoftExcelLogo,
  MicrosoftOutlookLogo,
  MicrosoftPowerpointLogo,
  MicrosoftTeamsLogo,
  MicrosoftWordLogo,
  MiroLogo,
  MistralLogo,
  MondayLogo,
  NaptaLogo,
  NetSuiteLogo,
  NotionLogo,
  OfficeLogo,
  OpenaiLogo,
  OutlookLogo,
  PdfLogo,
  PowerBiLogo,
  PraizLogo,
  ProductboardLogo,
  ReplicateLogo,
  SalesforceLogo,
  SalesloftLogo,
  SemrushLogo,
  SlabLogo,
  SlackLogo,
  SlideLogo,
  SnowflakeLogo,
  StatuspageLogo,
  StripeLogo,
  SupabaseLogo,
  TableLogo,
  TogetheraiLogo,
  UkgLogo,
  ValTownLogo,
  VantaLogo,
  VideoLogo,
  ZapierLogo,
  ZendeskLogo,
  ZendeskWhiteLogo,
} as const satisfies Record<string, LogoComponent>;

export type PlatformLogoName = keyof typeof PLATFORM_LOGOS;

export function isPlatformLogoName(name: string): name is PlatformLogoName {
  return Object.prototype.hasOwnProperty.call(PLATFORM_LOGOS, name);
}

export function getPlatformLogo(
  name: string,
  fallback: LogoComponent
): LogoComponent {
  if (isPlatformLogoName(name)) {
    return PLATFORM_LOGOS[name];
  }
  return fallback;
}
