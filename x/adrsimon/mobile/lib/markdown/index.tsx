/**
 * DustMarkdown - Markdown renderer with Dust directive support.
 *
 * Uses react-native-remark with custom renderers to support:
 * - :mention[name]{sId=xxx} - Agent mentions (inline @name in highlight color)
 * - :mention_user[name]{sId=xxx} - User mentions (inline @name in highlight color)
 * - :cite[ref] - Document citations (numbered circles)
 * - ![alt](fil_xxx) - Inline images from Dust files
 */

import type { Image as ImageNode, InlineCode } from "mdast";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Modal,
  Pressable,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Markdown as RNMarkdown } from "react-native-remark";

import { colors } from "@/lib/colors";
import { MobileAuthService } from "@/lib/services/auth";
import { storageService } from "@/lib/services/storage";
import type { CitationType } from "@/lib/types/conversations";

const authService = new MobileAuthService(storageService);

// Image extensions supported (like extension)
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

// Calculate image size based on screen width
const screenWidth = Dimensions.get("window").width;
const IMAGE_PADDING = 16 * 2; // px-4 on both sides
const INLINE_IMAGE_WIDTH = (screenWidth - IMAGE_PADDING) * 0.66;

// Token prefixes for directive encoding
const MENTION_TOKEN = "@mention:";
const USER_MENTION_TOKEN = "@usermention:";
const CITE_TOKEN = "@cite:";

// Regex patterns
const AGENT_MENTION_REGEX = /:mention\[([^\]]+)\]\{sId=([^}]+?)\}/g;
const USER_MENTION_REGEX = /:mention_user\[([^\]]+)\]\{sId=([^}]+?)\}/g;
const CITATION_REGEX = /:cite\[([^\]]+)\]/g;

/**
 * Pre-processes markdown to convert directives into inline code tokens
 * that we can intercept with customRenderers.
 */
function preprocessDirectives(markdown: string): string {
  return markdown
    .replace(AGENT_MENTION_REGEX, (_, name, sId) => {
      return `\`${MENTION_TOKEN}${name}:${sId}\``;
    })
    .replace(USER_MENTION_REGEX, (_, name, sId) => {
      return `\`${USER_MENTION_TOKEN}${name}:${sId}\``;
    })
    .replace(CITATION_REGEX, (_, refs) => {
      return `\`${CITE_TOKEN}${refs}\``;
    });
}

// Helper to convert blob to base64
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Context for citations data and image fetching
interface MarkdownContextType {
  citations: Record<string, CitationType>;
  citationCounter: React.MutableRefObject<Map<string, number>>;
  onCitationPress?: (ref: string, citation: CitationType) => void;
  onMentionPress?: (sId: string, type: "agent" | "user") => void;
  isDark: boolean;
  dustDomain?: string;
  workspaceId?: string;
}

const MarkdownContext = createContext<MarkdownContextType>({
  citations: {},
  citationCounter: { current: new Map() },
  isDark: false,
});

// Mention inline text (like extension - just @name in highlight color)
function MentionText({
  name,
  sId,
  type,
}: {
  name: string;
  sId: string;
  type: "agent" | "user";
}) {
  const { onMentionPress, isDark } = useContext(MarkdownContext);

  // Highlight color like extension: text-highlight / text-highlight-night
  const textColor = isDark ? "#60a5fa" : "#2563eb"; // blue-400 / blue-600

  return (
    <Text
      onPress={() => onMentionPress?.(sId, type)}
      style={{
        color: textColor,
        fontWeight: "500",
      }}
    >
      @{name}
    </Text>
  );
}

// Citation marker - numbered circle like extension
function CitationMarker({ refs }: { refs: string }) {
  const { citations, citationCounter, onCitationPress, isDark } =
    useContext(MarkdownContext);

  const refList = refs.split(",").map((r) => r.trim());

  // Get or assign counter for each ref (like extension's getCiteDirective)
  const counters = refList.map((ref) => {
    if (!citationCounter.current.has(ref)) {
      citationCounter.current.set(ref, citationCounter.current.size + 1);
    }
    return citationCounter.current.get(ref)!;
  });

  const handlePress = (ref: string) => {
    const citation = citations[ref];
    if (citation) {
      onCitationPress?.(ref, citation);
    }
  };

  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {refList.map((ref, i) => (
        <Pressable key={`${ref}-${i}`} onPress={() => handlePress(ref)}>
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: isDark ? "#3b82f6" : "#2563eb", // primary-600
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: isDark ? "#dbeafe" : "#dbeafe", // primary-200
                fontSize: 10,
                fontWeight: "600",
              }}
            >
              {counters[i]}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

// Custom inline code renderer that handles directive tokens
function CustomInlineCodeRenderer({ node }: { node: InlineCode }) {
  const value = node.value;
  const { isDark } = useContext(MarkdownContext);

  // Check for mention token
  if (value.startsWith(MENTION_TOKEN)) {
    const parts = value.slice(MENTION_TOKEN.length).split(":");
    const name = parts[0] || "";
    const sId = parts.slice(1).join(":");
    return <MentionText name={name} sId={sId} type="agent" />;
  }

  // Check for user mention token
  if (value.startsWith(USER_MENTION_TOKEN)) {
    const parts = value.slice(USER_MENTION_TOKEN.length).split(":");
    const name = parts[0] || "";
    const sId = parts.slice(1).join(":");
    return <MentionText name={name} sId={sId} type="user" />;
  }

  // Check for citation token
  if (value.startsWith(CITE_TOKEN)) {
    const refs = value.slice(CITE_TOKEN.length);
    return <CitationMarker refs={refs} />;
  }

  // Default inline code rendering
  return (
    <Text
      style={{
        backgroundColor: isDark ? "#27272a" : "#f4f4f5",
        color: isDark ? "#f472b6" : "#db2777",
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        fontSize: 13,
        fontFamily: "monospace",
      }}
    >
      {value}
    </Text>
  );
}

// Inline image component for Dust file images
function InlineImage({
  fileId,
  alt,
  contentType,
}: {
  fileId: string;
  alt: string;
  contentType?: string;
}) {
  const { dustDomain, workspaceId, isDark } = useContext(MarkdownContext);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [base64Uri, setBase64Uri] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (!dustDomain || !workspaceId) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchImage = async () => {
      try {
        const accessToken = await authService.getAccessToken();
        if (!accessToken || !isMounted) {
          setHasError(true);
          setIsLoading(false);
          return;
        }

        const imageUrl = `${dustDomain}/api/v1/w/${workspaceId}/files/${fileId}?action=view&version=processed`;

        const response = await fetch(imageUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!isMounted) return;

        if (!response.ok) {
          setHasError(true);
          setIsLoading(false);
          return;
        }

        const blob = await response.blob();
        const base64 = await blobToBase64(blob);

        if (!isMounted) return;

        const mimeType = contentType || "image/png";
        setBase64Uri(`data:${mimeType};base64,${base64}`);
        setIsLoading(false);
      } catch (error) {
        if (isMounted) {
          console.error("Failed to load image:", error);
          setHasError(true);
          setIsLoading(false);
        }
      }
    };

    void fetchImage();

    return () => {
      isMounted = false;
    };
  }, [fileId, dustDomain, workspaceId, contentType]);

  const modalScreenWidth = Dimensions.get("window").width;
  const modalScreenHeight = Dimensions.get("window").height;

  return (
    <View style={{ marginVertical: 8 }}>
      <Pressable onPress={() => base64Uri && setModalVisible(true)}>
        <View
          style={{
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: isDark ? "#27272a" : "#f4f4f5",
          }}
        >
          {isLoading && (
            <View
              style={{
                width: INLINE_IMAGE_WIDTH,
                height: INLINE_IMAGE_WIDTH,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator size="small" color={colors.gray[400]} />
            </View>
          )}
          {hasError && !isLoading && (
            <View
              style={{
                width: INLINE_IMAGE_WIDTH,
                height: 100,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isDark ? "#4c1d1d" : "#fef2f2",
              }}
            >
              <Ionicons
                name="image-outline"
                size={24}
                color={colors.rose[400]}
              />
              <Text
                style={{ color: colors.rose[500], fontSize: 12, marginTop: 4 }}
              >
                Failed to load image
              </Text>
            </View>
          )}
          {base64Uri && !hasError && (
            <Image
              source={{ uri: base64Uri }}
              style={{ width: INLINE_IMAGE_WIDTH, height: INLINE_IMAGE_WIDTH }}
              resizeMode="cover"
            />
          )}
        </View>
      </Pressable>
      {alt && (
        <Text
          style={{
            color: isDark ? "#a1a1aa" : "#71717a",
            fontSize: 12,
            marginTop: 4,
          }}
          numberOfLines={1}
        >
          {alt}
        </Text>
      )}

      {/* Full-screen modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.9)",
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={() => setModalVisible(false)}
        >
          <View
            style={{ position: "absolute", top: 48, right: 16, zIndex: 10 }}
          >
            <Pressable
              onPress={() => setModalVisible(false)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "rgba(255,255,255,0.2)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
          </View>
          {alt && (
            <View
              style={{ position: "absolute", top: 56, left: 16, right: 64 }}
            >
              <Text
                style={{ color: "white", fontSize: 16, fontWeight: "500" }}
                numberOfLines={2}
              >
                {alt}
              </Text>
            </View>
          )}
          <Pressable onPress={(e) => e.stopPropagation()}>
            {base64Uri && (
              <Image
                source={{ uri: base64Uri }}
                style={{
                  width: modalScreenWidth - 32,
                  height: modalScreenHeight * 0.7,
                }}
                resizeMode="contain"
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Custom image renderer - renders Dust file images inline
function CustomImageRenderer({ node }: { node: ImageNode }) {
  const { isDark } = useContext(MarkdownContext);
  const url = node.url || "";
  const alt = node.alt || "";

  // Extract file ID from URL (like extension does)
  const matches = url.match(/\bfil_[A-Za-z0-9]{10,}\b/g);
  const fileId = matches && matches.length === 1 ? matches[0] : null;

  // Check if alt text indicates an image file (like extension)
  const isImageFile = alt
    ? IMAGE_EXTENSIONS.some((ext) => alt.toLowerCase().endsWith(ext))
    : false;

  // Render Dust file images
  if (fileId && isImageFile) {
    return <InlineImage fileId={fileId} alt={alt} />;
  }

  // For non-file URLs or non-image files, show a link
  if (url && !fileId) {
    return (
      <Pressable onPress={() => Linking.openURL(url)}>
        <Text
          style={{
            color: isDark ? "#60a5fa" : "#2563eb",
            textDecorationLine: "underline",
          }}
        >
          🖼️ {alt || "Image"}
        </Text>
      </Pressable>
    );
  }

  // Skip rendering for file IDs that aren't images (e.g., PDFs)
  return null;
}

export interface DustMarkdownProps {
  children: string;
  citations?: Record<string, CitationType>;
  onCitationPress?: (ref: string, citation: CitationType) => void;
  onMentionPress?: (sId: string, type: "agent" | "user") => void;
  dustDomain?: string;
  workspaceId?: string;
}

/**
 * Markdown component with Dust directive support.
 */
export function DustMarkdown({
  children,
  citations = {},
  onCitationPress,
  onMentionPress,
  dustDomain,
  workspaceId,
}: DustMarkdownProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // Citation counter ref (persists across renders, resets per component instance)
  const citationCounter = useRef(new Map<string, number>());

  // Pre-process directives into tokens
  const processedContent = useMemo(() => {
    // Reset counter when content changes
    citationCounter.current.clear();
    return preprocessDirectives(children);
  }, [children]);

  // Default citation press handler
  const handleCitationPress = useMemo(
    () =>
      onCitationPress ||
      ((ref: string, citation: CitationType) => {
        if (citation.href) {
          Linking.openURL(citation.href);
        }
      }),
    [onCitationPress]
  );

  // Custom renderers
  const customRenderers = useMemo(
    () => ({
      InlineCodeRenderer: CustomInlineCodeRenderer,
      ImageRenderer: CustomImageRenderer,
    }),
    []
  );

  return (
    <MarkdownContext.Provider
      value={{
        citations,
        citationCounter,
        onCitationPress: handleCitationPress,
        onMentionPress,
        isDark,
        dustDomain,
        workspaceId,
      }}
    >
      <RNMarkdown
        markdown={processedContent}
        customRenderers={customRenderers}
        onLinkPress={(url) => Linking.openURL(url)}
      />
    </MarkdownContext.Provider>
  );
}

// Re-export utilities
export {
  extractCitationsFromActions,
  stripDirectivesToPlainText,
} from "./preprocessor";
