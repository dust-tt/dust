import mermaid from "mermaid";
import React, { useContext, useEffect, useRef, useState } from "react";
import {
  amber,
  blue,
  emerald,
  green,
  indigo,
  pink,
  purple,
  red,
  rose,
  sky,
  slate,
  violet,
  yellow,
} from "tailwindcss/colors";

import {
  Button,
  ContentBlockWrapper,
  GetContentToDownloadFunction,
} from "@sparkle/components";
import { CodeBlock } from "@sparkle/components/markdown/CodeBlock";
import { MarkdownContentContext } from "@sparkle/components/markdown/MarkdownContentContext";
import { CommandLineIcon, SparklesIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

// Helper function to ensure we get hex values
const toHex = (color: string) => {
  if (color.startsWith("#")) {
    return color;
  }
  // For handling rgb/rgba values if they exist
  if (color.startsWith("rgb")) {
    const matches = color.match(/\d+/g);
    if (matches && matches.length >= 3) {
      const [r, g, b] = matches.map(Number);
      return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return color;
};

const palette = {
  slate: {
    50: toHex(slate[50]), // background, labelBoxBkgColor, groupBkgColor, edgeLabelBackground
    100: toHex(slate[100]), // primaryColor
    200: toHex(slate[200]), // tertiaryBorderColor, clusterBorder, labelBoxBorderColor, groupBorderColor, pieOuterStrokeColor
    400: toHex(slate[400]), // lineColor, signalColor
    600: toHex(slate[600]), // tertiaryTextColor, sequenceNumberColor
    700: toHex(slate[700]), // signalTextColor, labelTextColor, loopTextColor, messageTextColor, groupTextColor, pieSectionTextColor
    800: toHex(slate[800]), // textColor, titleColor, nodeTextColor, pieTitleTextColor, pieLegendTextColor
  },
  sky: {
    100: toHex(sky[100]), // primaryColor, nodeBorder, actorBkg, activationBkgColor
    200: toHex(sky[200]), // actorBorder, activationBorderColor
    300: toHex(sky[300]), // actorLineColor, pie1
    800: toHex(sky[800]), // primaryTextColor, nodeTextColor, actorTextColor, defaultLinkColor
  },
  emerald: {
    100: toHex(emerald[100]), // secondaryColor
    200: toHex(emerald[200]), // secondaryBorderColor
    300: toHex(emerald[300]), // pie3
    800: toHex(emerald[800]), // secondaryTextColor
  },
  amber: {
    50: toHex(amber[50]), // noteBkgColor
    200: toHex(amber[200]), // noteBorderColor
    300: toHex(amber[300]), // pie4
  },
  red: {
    100: toHex(red[100]), // errorBkgColor
    300: toHex(red[300]), // pie8
    800: toHex(red[800]), // errorTextColor
  },
  blue: {
    300: toHex(blue[300]), // pie2
  },
  purple: {
    400: toHex(purple[400]), // pie5
  },
  pink: {
    300: toHex(pink[300]), // pie6
  },
  yellow: {
    300: toHex(yellow[300]), // pie7
  },
  green: {
    300: toHex(green[300]), // pie9
  },
  rose: {
    300: toHex(rose[300]), // pie10
  },
  violet: {
    300: toHex(violet[300]), // pie11
  },
  indigo: {
    300: toHex(indigo[300]), // pie12
  },
} as const;

const mermaidStyles = `
  /* Base diagram styles */
  .mermaid {
    background: ${palette.slate[50]};
    cursor: default;
  }
    
  .mermaid text,
  .mermaid .nodeLabel,
  .mermaid .edgeLabel,
  .mermaid .label {
    cursor: text;

  /* Cluster styles */
  .mermaid .cluster rect {
    rx: 8px;
    ry: 8px;
    stroke-width: 1px;
    fill: ${palette.slate["50"]};
    stroke: ${palette.slate["200"]};
  }

  /* Section styles */
  .mermaid .section {
    rx: 8px;
    ry: 8px;
  }

  /* Node styles */
  .mermaid .node rect,
  .mermaid .node circle,
  .mermaid .node ellipse,
  .mermaid .node polygon,
  .mermaid .node path {
    stroke-width: 1px;
    rx: 8px;
    ry: 8px;
  }
`;

const MermaidGraph: React.FC<{ chart: string }> = ({ chart }) => {
  const graphRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (graphRef.current) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          fontFamily: "darkmode-off-cc",
          fontSize: "14px",
          textColor: palette.slate[800],
          primaryColor: palette.sky[100],
          primaryTextColor: palette.sky[800],
          primaryBorderColor: palette.sky[100],
          lineColor: palette.slate[400],
          secondaryColor: palette.emerald[100],
          secondaryBorderColor: palette.emerald[200],
          secondaryTextColor: palette.emerald[800],
          tertiaryColor: "#FFF",
          tertiaryBorderColor: palette.slate[200],
          tertiaryTextColor: palette.slate[600],
          noteBkgColor: palette.amber[50],
          noteTextColor: palette.slate[800],
          errorBkgColor: palette.red[100],
          errorTextColor: palette.red[800],
          // Flowchart specific
          nodeBorder: palette.sky[100],
          clusterBkg: "#FFF",
          clusterBorder: palette.slate[200],
          defaultLinkColor: palette.sky[800],
          titleColor: palette.slate[800],
          edgeLabelBackground: palette.slate[50],
          nodeTextColor: palette.sky[800],
          // Sequence Diagram Variables
          // Actor styling
          actorBkg: palette.sky[100], // Light blue background for actors
          actorBorder: palette.sky[200], // Subtle blue border
          actorTextColor: palette.sky[800], // Dark blue text
          actorLineColor: palette.sky[300], // Subtle grey lines

          // Signal styling
          signalColor: palette.slate["400"], // Medium grey for signals/arrows
          signalTextColor: palette.slate["700"], // Darker grey for signal labels

          // Label box styling
          labelBoxBkgColor: palette.slate["50"], // Very light grey background
          labelBoxBorderColor: palette.slate["200"], // Light grey border
          labelTextColor: palette.slate["700"], // Dark grey text

          // Loop styling
          loopTextColor: palette.slate["700"], // Dark grey for loop text

          // Activation styling (the vertical bars)
          activationBorderColor: palette.sky["200"], // Light blue border
          activationBkgColor: palette.sky[100], // Very light blue background

          // Sequence numbers
          sequenceNumberColor: palette.slate["600"], // Medium grey for numbers

          // Additional sequence-specific colors
          messageBkgColor: "#FFFFFF", // White background for messages
          messageTextColor: palette.slate["700"], // Dark grey for message text
          noteBorderColor: palette.amber["200"], // Light amber for note borders

          // Group styling
          groupBkgColor: palette.slate["50"], // Very light grey for groups
          groupBorderColor: palette.slate["200"], // Light grey for group borders
          groupTextColor: palette.slate["700"], // Dark grey for group text
          // Pie Chart Colors - Using a gradient approach
          pie1: palette.sky["300"], // Primary blue
          pie2: palette.blue["300"], // Lighter blue
          pie3: palette.emerald["300"], // Primary green
          pie4: palette.amber["300"], // Lighter green
          pie5: palette.purple["400"], // Primary amber
          pie6: palette.pink["300"], // Lighter amber
          pie7: palette.yellow["300"], // Primary grey
          pie8: palette.red["300"], // Lighter grey
          pie9: palette.green["300"], // Very light blue
          pie10: palette.rose["300"], // Very light green
          pie11: palette.violet["300"], // Very light amber
          pie12: palette.indigo["300"], // Very light grey

          // Pie Chart Text Styling
          pieTitleTextSize: "16px",
          pieTitleTextColor: palette.slate["800"],
          pieSectionTextSize: "14px",
          pieSectionTextColor: palette.slate["700"],
          pieLegendTextSize: "14px",
          pieLegendTextColor: palette.slate["800"],

          // Pie Chart Stroke Styling
          pieStrokeColor: "#FFFFFF", // White borders between sections
          pieStrokeWidth: "1px",
          pieOuterStrokeWidth: "1px",
          pieOuterStrokeColor: palette.slate["200"],
          pieOpacity: "0.9", // Slight transparency
        },
        flowchart: {
          curve: "basis",
          padding: 20,
          htmlLabels: true,
          useMaxWidth: true,
        },
      });

      graphRef.current.innerHTML = chart;
      void mermaid.init(undefined, graphRef.current);
    }
  }, [chart]);

  return (
    <>
      <style>{mermaidStyles}</style>
      <div
        ref={graphRef}
        className={cn(
          "mermaid",
          "s-w-full",
          "s-rounded-2xl s-transition-all s-duration-200"
        )}
      />
    </>
  );
};

export function StyledMermaidGraph({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const validChildrenContent = String(children).trim();

  return (
    <div className={cn("s-relative", className)}>
      <MermaidGraph chart={validChildrenContent} />
    </div>
  );
}

export function CodeBlockWithExtendedSupport({
  children,
  className,
  inline,
}: {
  children?: React.ReactNode;
  className?: string;
  inline?: boolean;
}) {
  const validChildrenContent = String(children).trim();
  const [showMermaid, setShowMermaid] = useState<boolean>(false);
  const [isValidMermaid, setIsValidMermaid] = useState<boolean>(false);
  const { isStreaming } = useContext(MarkdownContentContext);

  // Detect language from className
  const language = className?.split("-")[1];

  // Only create getContentToDownload when we actually want to enable downloads
  const getContentToDownload: GetContentToDownloadFunction | undefined =
    !inline &&
    validChildrenContent &&
    (language === "csv" || language === "json")
      ? async () => ({
          content: validChildrenContent,
          filename: `dust_output_${Date.now()}`,
          type: language === "csv" ? "text/csv" : "application/json",
        })
      : undefined;

  useEffect(() => {
    if (isStreaming || !validChildrenContent || isValidMermaid || showMermaid) {
      return;
    }

    const checkValidMermaid = async () => {
      try {
        await mermaid.parse(validChildrenContent);
        setIsValidMermaid(true);
        setShowMermaid(true);
      } catch (e) {
        setIsValidMermaid(false);
        setShowMermaid(false);
      }
    };

    void checkValidMermaid();
  }, [
    isStreaming,
    isValidMermaid,
    showMermaid,
    setIsValidMermaid,
    setShowMermaid,
    validChildrenContent,
  ]);

  if (inline) {
    return (
      <CodeBlock className={className} inline={inline}>
        {children}
      </CodeBlock>
    );
  } else if (!inline && isValidMermaid) {
    return (
      <ContentBlockWrapper
        content={validChildrenContent}
        getContentToDownload={getContentToDownload}
        actions={
          <Button
            size="xs"
            variant={"outline"}
            label={showMermaid ? "Markdown" : "Mermaid"}
            icon={showMermaid ? CommandLineIcon : SparklesIcon}
            onClick={() => setShowMermaid(!showMermaid)}
            tooltip={showMermaid ? "Switch to Markdown" : "Switch to Mermaid"}
          />
        }
      >
        {showMermaid ? (
          <MermaidGraph chart={validChildrenContent} />
        ) : (
          <CodeBlock className={className} inline={inline}>
            {children}
          </CodeBlock>
        )}
      </ContentBlockWrapper>
    );
  } else {
    return (
      <ContentBlockWrapper
        content={validChildrenContent}
        getContentToDownload={getContentToDownload}
      >
        <CodeBlock className={className} inline={inline}>
          {children}
        </CodeBlock>
      </ContentBlockWrapper>
    );
  }
}
