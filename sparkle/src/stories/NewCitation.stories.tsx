import type { Meta } from "@storybook/react";
import React from "react";

import {
  DocumentIcon,
  DriveLogo,
  FaviconIcon,
  FolderIcon,
  ImageIcon,
  NewCitation,
  NewCitationGrid,
  NotionLogo,
  SlackLogo,
  TableIcon,
} from "../index_with_tw_base";

// FaviconIcon wrappers (take websiteUrl); pass as visual for links.
const LinkedInIcon = ({ className }: { className?: string }) => (
  <FaviconIcon
    websiteUrl="https://www.linkedin.com"
    size="sm"
    className={className}
  />
);
const GitHubIcon = ({ className }: { className?: string }) => (
  <FaviconIcon
    websiteUrl="https://github.com"
    size="sm"
    className={className}
  />
);
const StackOverflowIcon = ({ className }: { className?: string }) => (
  <FaviconIcon
    websiteUrl="https://stackoverflow.com"
    size="sm"
    className={className}
  />
);
const WikipediaIcon = ({ className }: { className?: string }) => (
  <FaviconIcon
    websiteUrl="https://www.wikipedia.org"
    size="sm"
    className={className}
  />
);

const meta = {
  title: "NewConversation/NewCitation",
  component: NewCitation,
} satisfies Meta<typeof NewCitation>;

export default meta;

export const NewCitationsExample = () => (
  <div className="s-flex s-flex-col s-gap-8">
    Default citations
    <NewCitationGrid>
      <NewCitation
        visual={SlackLogo}
        label="NewCitation w/ tooltip"
        tooltip="@ed at 16:32 — This is the latest version of the design spec"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        visual={SlackLogo}
        label="Slack thread"
        tooltip="#product-design — Weekly sync notes from March 4"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        visual={TableIcon}
        label="extract_financa.csv"
        tooltip="Google Sheets — Q4 2025 financial extract, 1,204 rows"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        visual={LinkedInIcon}
        label="Linkedin, Edouard Wautier"
        tooltip="linkedin.com — Edouard Wautier, Designer at Dust"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        visual={GitHubIcon}
        label="GitHub Repository"
        tooltip="github.com/dust-tt/dust — Main monorepo, last commit 2h ago"
        onClick={() => alert("Card clicked")}
      />
    </NewCitationGrid>
    Multiple visuals (md)
    <NewCitationGrid>
      <NewCitation
        visual={[DriveLogo, FolderIcon]}
        label="Q4 Reports"
        tooltip="Google Drive — Shared folder with 12 files, updated Jan 15"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        visual={[NotionLogo, TableIcon]}
        label="Product Roadmap DB"
        tooltip="Notion — Product roadmap database, 48 items across 6 sprints"
        onClick={() => alert("Card clicked")}
      />
    </NewCitationGrid>
    Multiple visuals (sm with DoubleIcon)
    <NewCitationGrid>
      <NewCitation
        size="sm"
        visual={[DriveLogo, FolderIcon]}
        label="Design Assets"
        tooltip="Google Drive — Design assets folder, 34 files"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        size="sm"
        visual={[NotionLogo, TableIcon]}
        label="Sprint Backlog"
        tooltip="Notion — Current sprint backlog, 23 tasks remaining"
        onClick={() => alert("Card clicked")}
      />
    </NewCitationGrid>
    Dismissable citations
    <NewCitationGrid>
      <NewCitation
        visual={SlackLogo}
        label="Slack thread"
        tooltip="#engineering — Deployment checklist discussion from yesterday"
        onClose={() => alert("Close clicked")}
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        visual={TableIcon}
        label="extract_financa.csv"
        tooltip="Google Sheets — Revenue breakdown by region, 890 rows"
        onClose={() => alert("Close clicked")}
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        visual={LinkedInIcon}
        label="Linkedin, Edouard Wautier"
        tooltip="linkedin.com — Profile page, last updated 3 days ago"
        onClose={() => alert("Close clicked")}
        onClick={() => alert("Card clicked")}
      />
    </NewCitationGrid>
    SM citations
    <NewCitationGrid>
      <NewCitation
        size="sm"
        visual={SlackLogo}
        label="Slack thread"
        tooltip="#general — Team standup notes from this morning"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        size="sm"
        visual={NotionLogo}
        label="Notion page"
        tooltip="Notion — API documentation draft, 2,400 words"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        size="sm"
        visual={DocumentIcon}
        label="Document.pdf"
        tooltip="Uploaded file — Technical architecture overview, 14 pages"
        onClose={() => alert("Close clicked")}
        onClick={() => alert("Card clicked")}
      />
    </NewCitationGrid>
    LG citations
    <NewCitationGrid>
      <NewCitation
        size="lg"
        visual={SlackLogo}
        label="Slack thread"
        tooltip="#product — Feature request discussion, 47 replies"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        size="lg"
        visual={NotionLogo}
        label="Notion page"
        tooltip="Notion — Quarterly OKRs, last edited by Sarah 1h ago"
        onClose={() => alert("Close clicked")}
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        size="lg"
        visual={DocumentIcon}
        label="Document.pdf"
        tooltip="Uploaded file — Brand guidelines v3, 28 pages"
        onClick={() => alert("Card clicked")}
      />
    </NewCitationGrid>
    LG image citations (with background image)
    <NewCitationGrid>
      <NewCitation
        size="lg"
        visual={ImageIcon}
        label="product-mockup.png"
        tooltip="Uploaded image — Product mockup, 1920x1080, 2.4 MB"
        imgSrc="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
      />
      <NewCitation
        size="lg"
        visual={ImageIcon}
        label="dashboard-screenshot.jpg"
        tooltip="Uploaded image — Dashboard screenshot, 1440x900, 1.1 MB"
        imgSrc="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
        onClose={() => alert("Close clicked")}
      />
      <NewCitation
        size="lg"
        visual={ImageIcon}
        label="wireframe-v2.png"
        tooltip="Uploading — wireframe-v2.png, 680 KB"
        isLoading={true}
      />
    </NewCitationGrid>
    Dynamic grid
    <NewCitationGrid>
      <NewCitation
        visual={SlackLogo}
        label="Hello"
        tooltip="#random — Hello world message from bot"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        visual={NotionLogo}
        label="Hello"
        tooltip="Notion — Hello page, onboarding template"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        visual={DocumentIcon}
        label="Hello"
        tooltip="Uploaded file — hello.txt, 12 bytes"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        visual={StackOverflowIcon}
        label="Stack Overflow Answer"
        tooltip="stackoverflow.com — How to center a div in CSS, 2.3k upvotes"
        onClick={() => alert("Card clicked")}
      />
      <NewCitation
        visual={WikipediaIcon}
        label="Wikipedia Article"
        tooltip="wikipedia.org — Large language model, last edited Feb 2026"
        onClick={() => alert("Card clicked")}
      />
    </NewCitationGrid>
  </div>
);
