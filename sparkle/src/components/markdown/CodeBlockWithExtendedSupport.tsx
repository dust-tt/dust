import { Button } from "@sparkle/components/Button";
import { CodeBlock } from "@sparkle/components/markdown/CodeBlock";
import {
  ContentBlockWrapper,
  type GetContentToDownloadFunction,
} from "@sparkle/components/markdown/ContentBlockWrapper";
import { MarkdownContentContext } from "@sparkle/components/markdown/MarkdownContentContext";
import {
  type JsonValueType,
  PrettyJsonViewer,
} from "@sparkle/components/markdown/PrettyJsonViewer";
import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { Stars02, Terminal } from "@sparkle/icons/v2-stroke";
import { cssColorToHex } from "@sparkle/lib/colors";
import { cn } from "@sparkle/lib/utils";
import React, { memo, useContext, useEffect, useRef, useState } from "react";
import colors from "tailwindcss/colors";

const {
  amber,
  blue,
  gray,
  green,
  indigo,
  purple,
  red,
  rose,
  sky,
  violet,
  yellow,
} = colors;

const PRETTY_JSON_PREFERENCE_KEY = "pretty-json-preference";

// Persist user's JSON display preference (raw vs pretty) in localStorage.
// Only affects newly rendered JSON blocks, not existing ones on the page.
const getPrettyJsonPreference = () => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const prettyJsonPreference = localStorage.getItem(
      PRETTY_JSON_PREFERENCE_KEY
    );
    // Default to Pretty view when preference is not yet set.
    if (prettyJsonPreference === null) {
      return true;
    }
    return prettyJsonPreference === "true";
  } catch {
    // If localStorage is unavailable, default to Pretty view.
    return true;
  }
};

const setPrettyJsonPreference = (value: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(PRETTY_JSON_PREFERENCE_KEY, String(value));
  } catch {
    // do nothing
  }
};

const getMermaidPalette = () => ({
  gray: {
    50: cssColorToHex(gray[50]), // background, labelBoxBkgColor, groupBkgColor, edgeLabelBackground
    100: cssColorToHex(gray[100]), // primaryColor
    200: cssColorToHex(gray[200]), // tertiaryBorderColor, clusterBorder, labelBoxBorderColor, groupBorderColor, pieOuterStrokeColor
    400: cssColorToHex(gray[400]), // lineColor, signalColor
    600: cssColorToHex(gray[600]), // tertiaryTextColor, sequenceNumberColor
    700: cssColorToHex(gray[700]), // signalTextColor, labelTextColor, loopTextColor, messageTextColor, groupTextColor, pieSectionTextColor
    800: cssColorToHex(gray[800]), // textColor, titleColor, nodeTextColor, pieTitleTextColor, pieLegendTextColor
  },
  sky: {
    100: cssColorToHex(sky[100]), // primaryColor, nodeBorder, actorBkg, activationBkgColor
    200: cssColorToHex(sky[200]), // actorBorder, activationBorderColor
    300: cssColorToHex(sky[300]), // actorLineColor, pie1
    800: cssColorToHex(sky[800]), // primaryTextColor, nodeTextColor, actorTextColor, defaultLinkColor
  },
  green: {
    100: cssColorToHex(green[100]), // secondaryColor
    200: cssColorToHex(green[200]), // secondaryBorderColor
    300: cssColorToHex(green[300]), // pie3
    800: cssColorToHex(green[800]), // secondaryTextColor
  },
  amber: {
    50: cssColorToHex(amber[50]), // noteBkgColor
    200: cssColorToHex(amber[200]), // noteBorderColor
    300: cssColorToHex(amber[300]), // pie4
  },
  red: {
    100: cssColorToHex(red[100]), // errorBkgColor
    300: cssColorToHex(red[300]), // pie8
    800: cssColorToHex(red[800]), // errorTextColor
  },
  blue: {
    300: cssColorToHex(blue[300]), // pie2
  },
  purple: {
    400: cssColorToHex(purple[400]), // pie5
  },
  yellow: {
    300: cssColorToHex(yellow[300]), // pie7
  },
  rose: {
    300: cssColorToHex(rose[300]), // pie10
  },
  violet: {
    300: cssColorToHex(violet[300]), // pie11
  },
  indigo: {
    300: cssColorToHex(indigo[300]), // pie12
  },
});

const mermaidStyles = `
  /* Base diagram styles */
  .mermaid {
    background: ${gray[100]};
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
    fill: ${gray["100"]};
    stroke: ${gray["200"]};
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
  const graphId = `mermaid-${React.useId().replaceAll(":", "")}`;

  useEffect(() => {
    let cancelled = false;

    const renderMermaid = async () => {
      if (!graphRef.current) {
        return;
      }

      const palette = getMermaidPalette();
      const mermaid = (await import("mermaid")).default;

      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          fontFamily: "Geist",
          fontSize: "14px",
          textColor: palette.gray[800],
          primaryColor: palette.sky[100],
          primaryTextColor: palette.sky[800],
          primaryBorderColor: palette.sky[100],
          lineColor: palette.gray[400],
          secondaryColor: palette.green[100],
          secondaryBorderColor: palette.green[200],
          secondaryTextColor: palette.green[800],
          tertiaryColor: "#FFF",
          tertiaryBorderColor: palette.gray[200],
          tertiaryTextColor: palette.gray[600],
          noteBkgColor: palette.amber[50],
          noteTextColor: palette.gray[800],
          errorBkgColor: palette.red[100],
          errorTextColor: palette.red[800],
          // Flowchart specific
          nodeBorder: palette.sky[100],
          clusterBkg: "#FFF",
          clusterBorder: palette.gray[200],
          defaultLinkColor: palette.sky[800],
          titleColor: palette.gray[800],
          edgeLabelBackground: palette.gray[50],
          nodeTextColor: palette.sky[800],
          // Sequence Diagram Variables
          // Actor styling
          actorBkg: palette.sky[100], // Light blue background for actors
          actorBorder: palette.sky[200], // Subtle blue border
          actorTextColor: palette.sky[800], // Dark blue text
          actorLineColor: palette.sky[300], // Subtle grey lines

          // Signal styling
          signalColor: palette.gray["400"], // Medium grey for signals/arrows
          signalTextColor: palette.gray["700"], // Darker grey for signal labels

          // Label box styling
          labelBoxBkgColor: palette.gray["50"], // Very light grey background
          labelBoxBorderColor: palette.gray["200"], // Light grey border
          labelTextColor: palette.gray["700"], // Dark grey text

          // Loop styling
          loopTextColor: palette.gray["700"], // Dark grey for loop text

          // Activation styling (the vertical bars)
          activationBorderColor: palette.sky["200"], // Light blue border
          activationBkgColor: palette.sky[100], // Very light blue background

          // Sequence numbers
          sequenceNumberColor: palette.gray["600"], // Medium grey for numbers

          // Additional sequence-specific colors
          messageBkgColor: "#FFFFFF", // White background for messages
          messageTextColor: palette.gray["700"], // Dark grey for message text
          noteBorderColor: palette.amber["200"], // Light amber for note borders

          // Group styling
          groupBkgColor: palette.gray["50"], // Very light grey for groups
          groupBorderColor: palette.gray["200"], // Light grey for group borders
          groupTextColor: palette.gray["700"], // Dark grey for group text
          // Pie Chart Colors - Using a gradient approach
          pie1: palette.sky["300"],
          pie2: palette.blue["300"],
          pie3: palette.green["300"],
          pie4: palette.amber["300"],
          pie5: palette.purple["400"],
          pie7: palette.yellow["300"],
          pie8: palette.red["300"],
          pie9: palette.green["300"],
          pie10: palette.rose["300"],
          pie11: palette.violet["300"],
          pie12: palette.indigo["300"],

          // Pie Chart Text Styling
          pieTitleTextSize: "16px",
          pieTitleTextColor: palette.gray["800"],
          pieSectionTextSize: "14px",
          pieSectionTextColor: palette.gray["700"],
          pieLegendTextSize: "14px",
          pieLegendTextColor: palette.gray["800"],

          // Pie Chart Stroke Styling
          pieStrokeColor: "#FFFFFF", // White borders between sections
          pieStrokeWidth: "1px",
          pieOuterStrokeWidth: "1px",
          pieOuterStrokeColor: palette.gray["200"],
          pieOpacity: "0.9", // Slight transparency
        },
        flowchart: {
          curve: "basis",
          padding: 20,
          htmlLabels: true,
          useMaxWidth: true,
        },
      });

      const { bindFunctions, svg } = await mermaid.render(graphId, chart);
      if (cancelled || !graphRef.current) {
        return;
      }
      graphRef.current.innerHTML = svg;
      bindFunctions?.(graphRef.current);
    };

    void renderMermaid();
    return () => {
      cancelled = true;
    };
  }, [chart, graphId]);

  return (
    <>
      <style>{mermaidStyles}</style>
      <div
        ref={graphRef}
        className={cn(
          "mermaid",
          "w-full",
          "rounded-2xl transition-all duration-200"
        )}
      />
    </>
  );
};

interface StyledMermaidGraphProps {
  children?: React.ReactNode;
  className?: string;
}

/**
 * Renders its string children as a Mermaid diagram with the Dust theme,
 * without the code/diagram toggle of CodeBlockWithExtendedSupport. Used when
 * a chart should always display as a diagram.
 * @summary Standalone themed Mermaid diagram.
 */
export function StyledMermaidGraph({
  children,
  className,
}: StyledMermaidGraphProps) {
  const validChildrenContent = String(children).trim();

  return (
    <div className={cn("relative", className)}>
      <MermaidGraph chart={validChildrenContent} />
    </div>
  );
}

interface CodeBlockWithExtendedSupportProps {
  children?: React.ReactNode;
  /** CSS class carrying the `language-<lang>` token used to detect mermaid/json/csv handling. */
  className?: string;
  /** When true, delegates directly to an inline CodeBlock with no extras. */
  inline?: boolean;
  /** hast node from react-markdown; its position is used to skip re-renders during streaming. */
  node?: MarkdownNode;
}

/**
 * Renders fenced code blocks inside Markdown output, extending CodeBlock with
 * copy/download actions and language-aware views: valid Mermaid code gets a
 * rendered diagram toggle, and valid JSON gets a raw/pretty toggle (persisted
 * in localStorage) backed by PrettyJsonViewer.
 * @summary Fenced-code renderer with Mermaid and JSON views.
 */
export const CodeBlockWithExtendedSupport = memo(
  ({ children, className, inline }: CodeBlockWithExtendedSupportProps) => {
    const validChildrenContent = String(children).trim();
    const [showMermaid, setShowMermaid] = useState<boolean>(false);
    const [isValidMermaid, setIsValidMermaid] = useState<boolean>(false);
    const [showPrettyJson, setShowPrettyJson] = useState<boolean>(false);
    const [parsedJson, setParsedJson] = useState<JsonValueType | null>(null);
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

    // Check for valid Mermaid and JSON.
    useEffect(() => {
      if (isStreaming || !validChildrenContent) {
        return;
      }
      if (language === "mermaid") {
        const checkValidMermaid = async () => {
          try {
            const mermaid = (await import("mermaid")).default;
            await mermaid.parse(validChildrenContent);
            setIsValidMermaid(true);
            setShowMermaid(true);
          } catch (_e) {
            setIsValidMermaid(false);
            setShowMermaid(false);
          }
        };
        void checkValidMermaid();
      }
      if (language === "json") {
        try {
          const parsed = JSON.parse(validChildrenContent);
          setParsedJson(parsed);
          const prettyJsonPreference = getPrettyJsonPreference();
          setShowPrettyJson(prettyJsonPreference);
        } catch (_e) {
          setParsedJson(null);
          setShowPrettyJson(false);
        }
      }
    }, [isStreaming, language, validChildrenContent]);

    if (inline) {
      return (
        <CodeBlock className={className} inline={inline}>
          {children}
        </CodeBlock>
      );
    }

    if (isValidMermaid) {
      return (
        <ContentBlockWrapper
          content={validChildrenContent}
          getContentToDownload={getContentToDownload}
          actions={
            <Button
              className="font-sans"
              size="xs"
              variant={"outline"}
              label={showMermaid ? "Markdown" : "Mermaid"}
              icon={showMermaid ? Terminal : Stars02}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                e.stopPropagation();
                setShowMermaid(!showMermaid);
              }}
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
    }

    if (parsedJson !== null) {
      return (
        <ContentBlockWrapper
          content={validChildrenContent}
          getContentToDownload={getContentToDownload}
          actions={
            <Button
              className="font-sans"
              size="xs"
              variant={"outline"}
              label={showPrettyJson ? "Raw JSON" : "Pretty JSON"}
              icon={showPrettyJson ? Terminal : Stars02}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                e.stopPropagation();
                const newValue = !showPrettyJson;
                setShowPrettyJson(newValue);
                setPrettyJsonPreference(newValue);
              }}
              tooltip={
                showPrettyJson ? "Switch to Raw JSON" : "Switch to Pretty View"
              }
            />
          }
          displayActions="hover"
          buttonDisplay="inside"
        >
          {showPrettyJson ? (
            <PrettyJsonViewer data={parsedJson} />
          ) : (
            <CodeBlock className={className} inline={inline} wrapLongLines>
              {children}
            </CodeBlock>
          )}
        </ContentBlockWrapper>
      );
    }

    return (
      <ContentBlockWrapper
        content={validChildrenContent}
        getContentToDownload={getContentToDownload}
        buttonDisplay="inside"
        displayActions="hover"
      >
        <CodeBlock className={className} inline={inline}>
          {children}
        </CodeBlock>
      </ContentBlockWrapper>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) &&
    prev.className === next.className &&
    prev.inline === next.inline
);
CodeBlockWithExtendedSupport.displayName = "CodeBlockWithExtendedSupport";
