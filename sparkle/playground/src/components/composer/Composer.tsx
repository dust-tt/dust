// Playground copy of front's home-page composer:
//   components/assistant/conversation/input_bar/{InputBar,InputBarContainer,InputBarButtons,
//   InputBarAttachments,inputBarPillStyles}.tsx
//   components/editor/input_bar/{useCustomEditor,SkillNodeComponent,ToolNodeComponent,
//   KnowledgeNodeComponent}.tsx
//   components/editor/extensions/input_bar/InputBarSlashSuggestionExtension.tsx
// With capabilities enabled (the home page default) the "+" opens the "/" menu, which carries
// Attach, Upload file, Pick model, Spaces and every skill / tool.

import {
  ArrowUp,
  AttachmentChip,
  Button,
  Chip,
  cn,
  File02,
  Icon,
  Image01,
  Plus,
  PuzzlePiece01,
  Robot,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Table,
  VoicePicker,
} from "@dust-tt/sparkle";
import type { VoicePickerStatus } from "@dust-tt/sparkle";
import type { Editor, Range } from "@tiptap/core";
import { Extension, mergeAttributes, Node as TiptapNode } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
} from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { exitSuggestion, Suggestion } from "@tiptap/suggestion";
import type { SuggestionProps } from "@tiptap/suggestion";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ComposerAgent,
  ComposerSkill,
  ComposerTool,
} from "../../data/composer";
import {
  COMPOSER_AGENTS,
  COMPOSER_SPACES,
  getComposerModel,
  getSpaceIcon,
} from "../../data/composer";
import type { ModelSelection } from "./ComposerModelPicker";
import { ComposerModelPicker } from "./ComposerModelPicker";
import {
  AgentAvatar,
  ComposerAgentPicker,
  ComposerSpacesPicker,
} from "./ComposerPickers";
import type { AttachSelection, SubMenuFrame } from "./ComposerSlashMenu";
import {
  ATTACH_CONTEXT_QUERY_PLACEHOLDER,
  ComposerSlashMenu,
  getSubMenuIdForCommand,
  getToolIcon,
  RUN_COMMAND_SLASH_COMMAND_ACTION,
  SELECT_SKILL_SLASH_COMMAND_ACTION,
  SELECT_SPACES_SLASH_COMMAND_ACTION,
  SELECT_TOOL_SLASH_COMMAND_ACTION,
  SkillAvatar,
} from "./ComposerSlashMenu";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "./SlashCommandDropdown";

// inputBarPillStyles.ts
const INPUT_BAR_PILL_SURFACE_CLASSNAME =
  "border-[0.5px] border-border-dark bg-background dark:bg-stone-725 " +
  "shadow-[inset_2px_-2px_7px_0px_rgba(0,0,0,0.02),0px_0.5px_0.5px_0px_rgba(0,0,0,0.04)]";
const INPUT_BAR_PILL_HOVER_CLASSNAME =
  "hover:bg-primary-100 dark:hover:bg-[oklch(0.393_0.013_76.451)]";

// front/styles/theme-extras.css --color-input-bar-background
const INPUT_BAR_BACKGROUND_CLASSNAME =
  "bg-[oklch(98.8%_0_89.876)] dark:bg-[oklch(29.4%_0.008_84.593)]";

export const INPUT_BAR_DEFAULT_PLACEHOLDER = "Get work done";

// ---------------------------------------------------------------------------
// Inline nodes (skill / tool / knowledge / file reference)
// ---------------------------------------------------------------------------

const SkillChipIcon = ({ className }: { className?: string }) => (
  <PuzzlePiece01 className={cn("text-highlight", className)} />
);

function SkillNodeView({ node, deleteNode }: NodeViewProps) {
  return (
    <NodeViewWrapper as="span" className="inline-flex align-middle">
      <Chip
        label={node.attrs.skillName ?? "Skill"}
        icon={SkillChipIcon}
        color="primary"
        onRemove={deleteNode}
        size="xs"
      />
    </NodeViewWrapper>
  );
}

function AttachmentChipNodeView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper as="span" className="inline-flex align-middle">
      <AttachmentChip label={node.attrs.label} color="primary" />
    </NodeViewWrapper>
  );
}

function makeInlineNode(
  name: string,
  attrs: string[],
  view: ComponentType<NodeViewProps>
) {
  return TiptapNode.create({
    name,
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
      return Object.fromEntries(attrs.map((a) => [a, { default: null }]));
    },
    parseHTML() {
      return [{ tag: `span[data-type="${name}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["span", mergeAttributes(HTMLAttributes, { "data-type": name })];
    },
    renderText({ node }) {
      return `:${name}[${node.attrs.label ?? node.attrs.skillName ?? ""}]`;
    },
    addNodeView() {
      return ReactNodeViewRenderer(view as never, { as: "span" });
    },
  });
}

const SkillNode = makeInlineNode(
  "skill",
  ["skillId", "skillName"],
  SkillNodeView
);
const ToolNode = makeInlineNode(
  "tool",
  ["toolId", "label"],
  AttachmentChipNodeView
);
const KnowledgeNode = makeInlineNode(
  "knowledge",
  ["nodeId", "label"],
  AttachmentChipNodeView
);
const FilePreviewNode = makeInlineNode(
  "filePreview",
  ["path", "label"],
  AttachmentChipNodeView
);

// ---------------------------------------------------------------------------
// "/" suggestion extension (InputBarSlashSuggestionExtension)
// ---------------------------------------------------------------------------

const slashPluginKey = new PluginKey("composerSlashSuggestion");

interface SlashHandlers {
  onStart: (props: SuggestionProps<SlashCommand>) => void;
  onUpdate: (props: SuggestionProps<SlashCommand>) => void;
  onExit: () => void;
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SlashStorage {
  dismissedTriggerStart: number | null;
  inSubMenu: boolean;
  queryPlaceholder: string | null;
  // Option B: the query lives in the menu's search field, so it is hidden inline. When the menu
  // was opened from "+", the "/" itself is hidden too.
  hideQuery: boolean;
  hideTrigger: boolean;
  // Option D: ghost text after a typed "/" (any level) while its query is empty.
  inlinePlaceholder: string | null;
}

function isAllowedSlashQuery(state: EditorState, range: Range) {
  const text = state.doc.textBetween(range.from, range.to, undefined, "￼");
  if (!text.startsWith("/")) {
    return false;
  }
  return !text.slice(1).startsWith(" ");
}

// The suggestion plugin only activates a "/" preceded by a space or at the start of a text
// block, so a leading space is added when needed.
function getSlashTriggerText(state: EditorState): string {
  const { nodeBefore } = state.selection.$from;
  const needsLeadingSpace =
    nodeBefore !== null &&
    (!nodeBefore.isText || !(nodeBefore.text ?? "").endsWith(" "));
  return needsLeadingSpace ? " /" : "/";
}

function createSlashExtension(handlersRef: { current: SlashHandlers | null }) {
  return Extension.create<Record<string, never>, SlashStorage>({
    name: "composerSlash",
    addStorage() {
      return {
        dismissedTriggerStart: null,
        inSubMenu: false,
        queryPlaceholder: null,
        hideQuery: false,
        hideTrigger: false,
        inlinePlaceholder: null,
      };
    },
    addProseMirrorPlugins() {
      const storage = this.storage;
      return [
        Suggestion<SlashCommand>({
          editor: this.editor,
          char: "/",
          pluginKey: slashPluginKey,
          allowSpaces: true,
          startOfLine: false,
          allow: ({ state, range }) =>
            storage.dismissedTriggerStart !== range.from &&
            // Inside a sub-menu the text after "/" is its query, so a leading space is allowed.
            (storage.inSubMenu || isAllowedSlashQuery(state, range)),
          items: () => [],
          render: () => ({
            onStart: (props) => handlersRef.current?.onStart(props),
            onUpdate: (props) => handlersRef.current?.onUpdate(props),
            onExit: () => handlersRef.current?.onExit(),
            onKeyDown: ({ event }) =>
              handlersRef.current?.onKeyDown(event) ?? false,
          }),
        }),
        // A dismissed "/" stays dismissed until it is deleted; then a new "/" typed at the
        // same position opens the menu again.
        new Plugin({
          key: new PluginKey("composerSlashCleanup"),
          appendTransaction: (_trs, _old, state) => {
            const pos = storage.dismissedTriggerStart;
            if (pos === null) {
              return null;
            }
            const size = state.doc.content.size;
            const isSlash =
              pos >= 1 &&
              pos < size &&
              state.doc.textBetween(pos, pos + 1, undefined, "￼") === "/";
            if (!isSlash) {
              storage.dismissedTriggerStart = null;
            }
            return null;
          },
        }),
        // Option B: collapse the trigger text (kept in the doc so the suggestion stays anchored).
        new Plugin({
          key: new PluginKey("composerSlashHideQuery"),
          props: {
            decorations: ((state: EditorState) => {
              const suggestion = slashPluginKey.getState(state);
              if (!suggestion?.active || !storage.hideQuery) {
                return null;
              }
              const from = storage.hideTrigger
                ? suggestion.range.from
                : suggestion.range.from + 1;
              if (suggestion.range.to <= from) {
                return null;
              }
              return DecorationSet.create(state.doc as never, [
                Decoration.inline(from, suggestion.range.to, {
                  style: "font-size: 0; letter-spacing: 0;",
                }),
              ]);
            }) as never,
          },
        }),
        // Ghost text shown after the "/" while the Attach sub-menu has an empty query.
        new Plugin({
          key: new PluginKey("composerSlashQueryPlaceholder"),
          props: {
            // Cast: the playground resolves two copies of prosemirror-view.
            decorations: ((state: EditorState) => {
              const suggestion = slashPluginKey.getState(state);
              if (
                !suggestion?.active ||
                suggestion.query ||
                storage.hideQuery ||
                !(storage.queryPlaceholder ?? storage.inlinePlaceholder)
              ) {
                return null;
              }
              const text =
                storage.queryPlaceholder ?? storage.inlinePlaceholder ?? "";
              return DecorationSet.create(state.doc as never, [
                Decoration.widget(
                  suggestion.range.to,
                  () => {
                    const span = document.createElement("span");
                    span.className =
                      "pointer-events-none select-none text-faint dark:text-stone-400";
                    span.contentEditable = "false";
                    span.textContent = text;
                    return span;
                  },
                  { side: 1 }
                ),
              ]);
            }) as never,
          },
        }),
      ];
    },
  });
}

function getSlashStorage(editor: Editor): SlashStorage {
  return (editor.storage as unknown as Record<string, SlashStorage>)
    .composerSlash;
}

// ---------------------------------------------------------------------------
// Attachments row (InputBarAttachments, chip variant)
// ---------------------------------------------------------------------------

interface UploadedFile {
  id: string;
  name: string;
  contentType: string;
  progress: number;
}

function getUploadIcon(contentType: string): ComponentType {
  if (contentType.startsWith("image/")) {
    return Image01;
  }
  if (contentType.includes("csv") || contentType.includes("sheet")) {
    return Table;
  }
  return File02;
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

export interface ComposerSubmission {
  text: string;
  agent: ComposerAgent | null;
  model: ModelSelection;
  files: string[];
  spaceIds: string[];
}

interface ComposerProps {
  // Home page: false (menus open below). In a conversation: true (menus open above,
  // "/ Compact" is offered).
  inConversation?: boolean;
  placeholder?: string;
  onSubmit?: (submission: ComposerSubmission) => void;
  // "inline" (front): the query is typed after "/" in the editor.
  // "searchbar" (options B, C): the "/" menu has a search field at the top; "+" focuses it.
  // "plus" (option D): only a menu opened from "+" has the search field; a typed "/" keeps
  // the query inline after it, like front.
  slashSearch?: "inline" | "searchbar" | "plus";
  // "rows" (front): sub-menus start with a "Back" row, Attach adds a breadcrumb row.
  // "compact" (option C): one "‹ title / trail" line; Spaces opens as a sub-menu.
  slashNav?: "rows" | "compact";
}

function getAgentDefaultModel(agent: ComposerAgent | null): ModelSelection {
  const model = agent?.model ? getComposerModel(agent.model.modelId) : null;
  if (agent?.model && model) {
    return { kind: "model", model, effort: agent.model.effort };
  }
  return { kind: "tier", tierId: "standard" };
}

export function Composer({
  inConversation = false,
  placeholder = INPUT_BAR_DEFAULT_PLACEHOLDER,
  onSubmit,
  slashSearch = "inline",
  slashNav = "rows",
}: ComposerProps) {
  const useCompactNav = slashNav === "compact";
  const searchbarForTypedSlash = slashSearch === "searchbar";
  const searchbarForPlus = slashSearch !== "inline";
  // Option B: whether the menu's search field (rather than the editor) has focus, and whether
  // the menu was opened from "+" (then closing it removes the "/" it inserted).
  const searchFocusedRef = useRef(false);
  const openedFromPlusRef = useRef(false);
  const plusButtonRef = useRef<HTMLSpanElement>(null);
  // Whether the current "/" session shows the search field in the menu.
  const sessionUsesSearchbar = () =>
    openedFromPlusRef.current ? searchbarForPlus : searchbarForTypedSlash;
  // Not memoized on purpose: a new function each render makes the menu re-measure the button,
  // which moves when chips (e.g. selected Spaces) are added above it.
  const getPlusButtonRect = () =>
    plusButtonRef.current?.getBoundingClientRect() ?? null;
  const side = inConversation ? "top" : "bottom";
  const buttonSize = "xs" as const;

  // --- Agent & model ------------------------------------------------------
  const [selectedAgent, setSelectedAgent] = useState<ComposerAgent | null>(
    COMPOSER_AGENTS[0]
  );
  const agentDefault = useMemo(
    () => getAgentDefaultModel(selectedAgent),
    [selectedAgent]
  );
  const [modelSelection, setModelSelection] =
    useState<ModelSelection>(agentDefault);
  // Switching agent discards any model override.
  useEffect(() => {
    setModelSelection(agentDefault);
  }, [agentDefault]);

  // --- Spaces ---------------------------------------------------------------
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([]);
  const [showSpacesPicker, setShowSpacesPicker] = useState(false);
  const inputBarButtonsRef = useRef<HTMLDivElement>(null);
  const selectableSpaces = COMPOSER_SPACES.filter((s) => s.kind !== "global");
  const selectedSpaces = selectableSpaces.filter((s) =>
    selectedSpaceIds.includes(s.sId)
  );

  // --- Files ----------------------------------------------------------------
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFiles = useCallback((list: FileList | null) => {
    if (!list) {
      return;
    }
    const added = Array.from(list).map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      name: f.name,
      contentType: f.type || "text/plain",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...added]);
    // Simulated upload progress.
    for (const file of added) {
      let progress = 0;
      const timer = setInterval(() => {
        progress = Math.min(100, progress + 20 + Math.random() * 25);
        setFiles((prev) =>
          prev.map((f) => (f.id === file.id ? { ...f, progress } : f))
        );
        if (progress >= 100) {
          clearInterval(timer);
        }
      }, 220);
    }
  }, []);

  // --- Capability details sheet ---------------------------------------------
  const [detailsItem, setDetailsItem] = useState<
    | { kind: "skill"; skill: ComposerSkill }
    | { kind: "tool"; tool: ComposerTool }
    | null
  >(null);

  // --- Voice ----------------------------------------------------------------
  const [voiceStatus, setVoiceStatus] = useState<VoicePickerStatus>("idle");
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceElapsed, setVoiceElapsed] = useState(0);

  // --- Notice (e.g. Compact) ---------------------------------------------
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) {
      return;
    }
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  // --- Slash menu state -----------------------------------------------------
  const [slash, setSlash] = useState<{
    query: string;
    range: Range;
    clientRect: (() => DOMRect | null) | null;
  } | null>(null);
  const slashRef = useRef(slash);
  slashRef.current = slash;
  const [stackFrame, setStackFrame] = useState<SubMenuFrame | null>(null);
  const menuRef = useRef<SlashCommandDropdownRef>(null);
  const handlersRef = useRef<SlashHandlers | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const slashExtension = useMemo(() => createSlashExtension(handlersRef), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name !== "paragraph" ? "" : placeholder,
        emptyNodeClass:
          "first:before:text-faint dark:first:before:text-stone-400 first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:absolute",
      }),
      SkillNode,
      ToolNode,
      KnowledgeNode,
      FilePreviewNode,
      slashExtension,
    ],
    autofocus: "end",
    editorProps: {
      attributes: { class: "outline-hidden" },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey && !slashRef.current) {
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => setIsEmpty(editor.isEmpty),
    onFocus: () => {
      searchFocusedRef.current = false;
    },
  });
  editorRef.current = editor;

  // Option D: a typed "/" has no search field, so it shows "Type to search" inline.
  useEffect(() => {
    if (editor) {
      getSlashStorage(editor).inlinePlaceholder =
        slashSearch === "plus" ? ATTACH_CONTEXT_QUERY_PLACEHOLDER : null;
    }
  }, [editor, slashSearch]);

  const closeSlash = useCallback(() => {
    const ed = editorRef.current;
    const current = slashRef.current;
    if (!ed) {
      return;
    }
    const storage = getSlashStorage(ed);
    storage.inSubMenu = false;
    storage.queryPlaceholder = null;
    setStackFrame(null);
    if (sessionUsesSearchbar() && openedFromPlusRef.current && current) {
      // Closing a menu opened from "+" cancels it: remove the hidden "/query".
      ed.chain().focus().deleteRange(current.range).run();
      return;
    }
    if (current) {
      storage.dismissedTriggerStart = current.range.from;
    }
    const refocusEditor = sessionUsesSearchbar();
    exitSuggestion(ed.view, slashPluginKey);
    if (refocusEditor) {
      ed.commands.focus();
    }
  }, [searchbarForPlus, searchbarForTypedSlash]);

  const refreshEditor = (ed: Editor) =>
    ed.view.dispatch(ed.state.tr.setMeta("slashMenuNavigation", true));

  // Deletes the text typed after "/" (the sub-menu starts with an empty query).
  const clearQueryAfterSlash = (ed: Editor, range: Range) => {
    if (range.to > range.from + 1) {
      // Keep focus in the menu's search field when that is where the user is typing.
      const chain = searchFocusedRef.current ? ed.chain() : ed.chain().focus();
      chain.deleteRange({ from: range.from + 1, to: range.to }).run();
    }
  };

  const enterSubMenu = useCallback(
    (frame: SubMenuFrame) => {
      const ed = editorRef.current;
      const current = slashRef.current;
      if (!ed || !current) {
        return;
      }
      const storage = getSlashStorage(ed);
      storage.inSubMenu = true;
      storage.queryPlaceholder =
        frame.subMenuId === "attach-context" && !sessionUsesSearchbar()
          ? ATTACH_CONTEXT_QUERY_PLACEHOLDER
          : null;
      setStackFrame(frame);
      clearQueryAfterSlash(ed, current.range);
      refreshEditor(ed);
    },
    [searchbarForPlus, searchbarForTypedSlash]
  );

  const popSubMenu = useCallback(() => {
    const ed = editorRef.current;
    const current = slashRef.current;
    if (!ed || !current) {
      return;
    }
    const storage = getSlashStorage(ed);
    storage.inSubMenu = false;
    storage.queryPlaceholder = null;
    setStackFrame(null);
    clearQueryAfterSlash(ed, current.range);
    refreshEditor(ed);
  }, []);

  // Removes "/query" and runs `fn` on a focused chain.
  const replaceSlashWith = useCallback((insert: (ed: Editor) => void) => {
    const ed = editorRef.current;
    const current = slashRef.current;
    if (!ed || !current) {
      return;
    }
    const storage = getSlashStorage(ed);
    storage.inSubMenu = false;
    storage.queryPlaceholder = null;
    storage.dismissedTriggerStart = null;
    setStackFrame(null);
    ed.chain().focus().deleteRange(current.range).run();
    insert(ed);
  }, []);

  handlersRef.current = {
    onStart: (props) => {
      const ed = editorRef.current;
      if (ed && !openedFromPlusRef.current) {
        getSlashStorage(ed).hideQuery = searchbarForTypedSlash;
      }
      setSlash({
        query: props.query,
        range: props.range,
        clientRect: props.clientRect ?? null,
      });
    },
    onUpdate: (props) =>
      setSlash({
        query: props.query,
        range: props.range,
        clientRect: props.clientRect ?? null,
      }),
    onExit: () => {
      const ed = editorRef.current;
      const last = slashRef.current;
      // Options B-D: the query typed in the menu's search field is never message text. When
      // the menu closes without a pick (click in the composer, Esc…), drop it; a "+" session
      // also drops its "/". A pick already replaced "/query", so the check below skips it.
      if (ed && last && sessionUsesSearchbar()) {
        const { range, query } = last;
        const fromPlus = openedFromPlusRef.current;
        queueMicrotask(() => {
          if (ed.isDestroyed || range.to > ed.state.doc.content.size) {
            return;
          }
          const text = ed.state.doc.textBetween(
            range.from,
            range.to,
            undefined,
            "\ufffc"
          );
          if (text !== `/${query}`) {
            return;
          }
          const from = fromPlus ? range.from : range.from + 1;
          if (range.to > from) {
            ed.chain().deleteRange({ from, to: range.to }).run();
          }
        });
      }
      if (ed) {
        const storage = getSlashStorage(ed);
        storage.inSubMenu = false;
        storage.queryPlaceholder = null;
        storage.hideTrigger = false;
        // Next session starts inline until "+" says otherwise.
        storage.hideQuery = false;
      }
      openedFromPlusRef.current = false;
      searchFocusedRef.current = false;
      setStackFrame(null);
      setSlash(null);
    },
    onKeyDown: (event) => {
      const handled = menuRef.current?.onKeyDown({ event }) ?? false;
      if (handled) {
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeSlash();
        return true;
      }
      return false;
    },
  };

  const handleCommand = (item: SlashCommand) => {
    const subMenuId = getSubMenuIdForCommand(item, {
      spacesSubMenu: useCompactNav,
    });
    if (subMenuId) {
      enterSubMenu({ subMenuId, label: item.label });
      return;
    }

    switch (item.action) {
      case SELECT_SKILL_SLASH_COMMAND_ACTION: {
        const { skill } = item.data as { skill: ComposerSkill };
        replaceSlashWith((ed) =>
          ed
            .chain()
            .focus()
            .insertContent([
              {
                type: "skill",
                attrs: { skillId: skill.sId, skillName: skill.name },
              },
              { type: "text", text: " " },
            ])
            .run()
        );
        return;
      }
      case SELECT_TOOL_SLASH_COMMAND_ACTION: {
        const { tool } = item.data as { tool: ComposerTool };
        replaceSlashWith((ed) =>
          ed
            .chain()
            .focus()
            .insertContent([
              { type: "tool", attrs: { toolId: tool.sId, label: tool.name } },
              { type: "text", text: " " },
            ])
            .run()
        );
        return;
      }
      case RUN_COMMAND_SLASH_COMMAND_ACTION: {
        const { command } = item.data as { command: "upload-file" | "compact" };
        replaceSlashWith(() => {
          if (command === "upload-file") {
            fileInputRef.current?.click();
          } else {
            setNotice("Compacting conversation…");
          }
        });
        return;
      }
      case SELECT_SPACES_SLASH_COMMAND_ACTION:
        replaceSlashWith(() => setShowSpacesPicker(true));
        return;
    }
  };

  const handleAttach = useCallback(
    (selection: AttachSelection) => {
      replaceSlashWith((ed) => {
        const content =
          selection.kind === "file"
            ? {
                type: "filePreview",
                attrs: {
                  path: selection.file.path,
                  label: selection.file.label,
                },
              }
            : {
                type: "knowledge",
                attrs: {
                  nodeId:
                    selection.kind === "knowledge"
                      ? selection.node.internalId
                      : selection.dataSource.sId,
                  label: selection.label,
                },
              };
        ed.chain()
          .focus()
          .insertContent([content, { type: "text", text: " " }])
          .run();
      });
    },
    [replaceSlashWith]
  );

  const handlePickModel = useCallback(
    (selection: ModelSelection) => {
      replaceSlashWith(() => setModelSelection(selection));
    },
    [replaceSlashWith]
  );

  const handleDetails = (item: SlashCommand) => {
    replaceSlashWith(() => {
      if (item.action === SELECT_SKILL_SLASH_COMMAND_ACTION) {
        setDetailsItem({
          kind: "skill",
          skill: (item.data as { skill: ComposerSkill }).skill,
        });
      } else if (item.action === SELECT_TOOL_SLASH_COMMAND_ACTION) {
        setDetailsItem({
          kind: "tool",
          tool: (item.data as { tool: ComposerTool }).tool,
        });
      }
    });
  };

  // "+" → editorService.openSlashCommand(): insert "/" at the cursor.
  const openSlashCommand = () => {
    if (!editor) {
      return;
    }
    const storage = getSlashStorage(editor);
    storage.dismissedTriggerStart = null;
    storage.hideQuery = searchbarForPlus;
    // Set before inserting: the insert starts the "/" session synchronously.
    openedFromPlusRef.current = true;
    editor
      .chain()
      .focus()
      .insertContent(getSlashTriggerText(editor.state))
      .run();
    // After the insert, whose editor focus would reset it.
    searchFocusedRef.current = searchbarForPlus;
  };

  // Option B: the search field edits the text after "/" without taking focus from itself.
  const setSlashQuery = (value: string) => {
    const ed = editorRef.current;
    const current = slashRef.current;
    if (!ed || !current) {
      return;
    }
    const from = current.range.from + 1;
    const chain = ed.chain();
    if (value.length > 0) {
      chain.insertContentAt(
        { from, to: current.range.to },
        { type: "text", text: value }
      );
    } else if (current.range.to > from) {
      chain.deleteRange({ from, to: current.range.to });
    }
    chain.setTextSelection(from + value.length).run();
  };

  const isUploading = files.some((f) => f.progress < 100);
  const isSubmitDisabled = (isEmpty && files.length === 0) || isUploading;

  const submit = () => {
    if (!editor || isSubmitDisabled) {
      return;
    }
    onSubmit?.({
      text: editor.getText({ blockSeparator: "\n" }),
      agent: selectedAgent,
      model: modelSelection,
      files: files.map((f) => f.name),
      spaceIds: selectedSpaceIds,
    });
    editor.commands.clearContent(true);
    setFiles([]);
    setIsEmpty(true);
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // Simulated voice capture.
  useEffect(() => {
    if (voiceStatus !== "recording") {
      return;
    }
    const levelTimer = setInterval(() => setVoiceLevel(Math.random()), 120);
    const clock = setInterval(() => setVoiceElapsed((s) => s + 1), 1000);
    return () => {
      clearInterval(levelTimer);
      clearInterval(clock);
    };
  }, [voiceStatus]);

  const stopRecording = () => {
    setVoiceStatus("transcribing");
    setTimeout(() => {
      editor
        ?.chain()
        .focus("end")
        .insertContent(
          "Summarize what changed in the Q4 launch plan this week."
        )
        .run();
      setVoiceStatus("idle");
      setVoiceElapsed(0);
      setVoiceLevel(0);
    }, 1200);
  };

  const isRecording = voiceStatus === "recording";
  const isVoiceActive = voiceStatus !== "idle";

  const agentButton = (
    <ComposerAgentPicker
      agents={COMPOSER_AGENTS}
      side={side}
      selectedAgentId={selectedAgent?.sId}
      onItemClick={setSelectedAgent}
      onDeselect={() => setSelectedAgent(null)}
      onAgentDetailsClick={(agent) =>
        setNotice(`Agent details: @${agent.name}`)
      }
      pickerButton={
        selectedAgent ? (
          <div
            role="button"
            tabIndex={0}
            aria-label={`Selected agent: ${selectedAgent.name}`}
            className={cn(
              "inline-flex box-border items-center rounded-full heading-xs px-2 gap-1.5 text-primary-900 transition-colors duration-200 dark:text-primary-900-night",
              "h-6",
              INPUT_BAR_PILL_SURFACE_CLASSNAME,
              "cursor-pointer",
              INPUT_BAR_PILL_HOVER_CLASSNAME
            )}
          >
            <AgentAvatar agent={selectedAgent} size="3xs" />
            <span className="grow truncate notranslate">
              {selectedAgent.name}
            </span>
          </div>
        ) : (
          <Button
            variant="ghost-secondary"
            size={buttonSize}
            icon={Robot}
            label="Agent"
            isRounded
            className={cn(
              INPUT_BAR_PILL_SURFACE_CLASSNAME,
              INPUT_BAR_PILL_HOVER_CLASSNAME
            )}
          />
        )
      }
    />
  );

  return (
    <div className="flex w-full flex-col">
      <div
        className={cn(
          "relative flex flex-col items-stretch gap-0 md:flex-row",
          "transition-[background-color,padding,border-color,box-shadow,opacity] duration-300 ease-out",
          "w-full flex-1 self-stretch",
          "rounded-squircle-40 w-full overflow-hidden",
          "border",
          INPUT_BAR_BACKGROUND_CLASSNAME,
          "has-[.tiptap:focus]:bg-stone-25 dark:has-[.tiptap:focus]:bg-[oklch(0.310_0.007_75)]",
          "max-md:border-border max-md:has-[.tiptap:focus]:border-border-dark max-md:dark:has-[.tiptap:focus]:border-stone-750",
          "transition-colors duration-100 ease-emphasized motion-reduce:transition-none",
          "md:border-white/90",
          "md:transition-[background-color,box-shadow] md:duration-150 md:ease-emphasized md:motion-reduce:transition-none",
          "md:shadow-[0px_-1px_1px_-0.5px_rgba(0,0,0,0.05),0px_0px_0px_1.5px_rgba(0,0,0,0.04),0px_1px_1px_-0.5px_rgba(0,0,0,0.07),0px_6px_6px_-3px_rgba(0,0,0,0.06)]",
          "md:has-[.tiptap:focus]:shadow-[0px_-1px_1px_-0.5px_rgba(0,0,0,0.05),0px_0px_0px_1.5px_rgba(0,0,0,0.07),0px_1px_1px_-0.5px_rgba(0,0,0,0.07),0px_6px_6px_-3px_rgba(0,0,0,0.06)]",
          "md:dark:border-transparent",
          "md:dark:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.02),inset_0px_0px_0px_1px_rgba(255,255,255,0.04),0px_0px_0px_1.5px_rgba(0,0,0,0.14),0px_1px_1px_-0.5px_rgba(0,0,0,0.18),0px_3px_3px_-1.5px_rgba(0,0,0,0.18),0px_6px_6px_-3px_rgba(0,0,0,0.18)]",
          "md:dark:has-[.tiptap:focus]:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.035),inset_0px_0px_0px_1px_rgba(255,255,255,0.055),0px_0px_0px_1.5px_rgba(0,0,0,0.14),0px_1px_1px_-0.5px_rgba(0,0,0,0.18),0px_3px_3px_-1.5px_rgba(0,0,0,0.18),0px_6px_6px_-3px_rgba(0,0,0,0.18)]"
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px hidden rounded-[inherit] [corner-shape:inherit] shadow-[inset_0px_-3px_29px_2px_rgba(0,0,0,0.01)] md:block md:dark:hidden"
        />
        <div className="relative flex w-full flex-1 flex-col">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-separator px-3 pb-3 pt-3">
              {files.map((file) => (
                <AttachmentChip
                  key={file.id}
                  label={file.name}
                  color="primary"
                  size="xs"
                  icon={{ visual: getUploadIcon(file.contentType) }}
                  isBusy={file.progress < 100}
                  onRemove={() =>
                    setFiles((prev) => prev.filter((f) => f.id !== file.id))
                  }
                />
              ))}
            </div>
          )}
          <div
            id="InputBarContainer"
            className="relative flex flex-1 cursor-text flex-row transition-opacity duration-200 md:pt-0"
            onClick={(e) => {
              if (
                !(e.target instanceof Node) ||
                !e.currentTarget.contains(e.target)
              ) {
                return;
              }
              if (
                !(
                  e.target instanceof HTMLElement && e.target.closest(".tiptap")
                )
              ) {
                editor?.commands.focus("end");
              }
            }}
          >
            <div className="flex w-0 flex-grow flex-col">
              <div className="relative">
                <EditorContent
                  editor={editor}
                  className={cn(
                    "inline-block w-full",
                    "border-0 outline-hidden ring-0 focus:border-0 focus:outline-hidden focus:ring-0",
                    "whitespace-pre-wrap font-normal text-base",
                    "px-3 md:pl-4 pt-3 md:pt-3.5",
                    "scrollbar-hide",
                    "overflow-y-auto overscroll-contain",
                    "max-h-[40vh] min-h-11",
                    "text-foreground dark:text-foreground-night"
                  )}
                />
              </div>
              <div className="mt-auto flex w-full flex-col pt-2 pb-3">
                <div className="mb-1 flex flex-wrap items-center px-3">
                  {selectedSpaces.map((space) => (
                    <Chip
                      key={space.sId}
                      size="xs"
                      label={space.name}
                      icon={getSpaceIcon(space)}
                      className="m-0.5 bg-background text-foreground dark:bg-background-night dark:text-foreground-night"
                      onRemove={() =>
                        setSelectedSpaceIds((ids) =>
                          ids.filter((id) => id !== space.sId)
                        )
                      }
                    />
                  ))}
                </div>
                <div className="flex min-h-7 w-full items-center">
                  <div className="flex w-full items-center px-3">
                    {!isRecording && (
                      <div
                        ref={inputBarButtonsRef}
                        className="flex items-center gap-1.5"
                      >
                        <ComposerSpacesPicker
                          anchorRef={inputBarButtonsRef}
                          open={showSpacesPicker}
                          onOpenChange={setShowSpacesPicker}
                          selectedSpaceIds={selectedSpaceIds}
                          onSelectedSpaceIdsChange={setSelectedSpaceIds}
                          spaces={selectableSpaces}
                        />
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          style={{ display: "none" }}
                          onChange={(e) => {
                            addFiles(e.target.files);
                            e.target.value = "";
                            editor?.commands.focus("end");
                          }}
                        />
                        {agentButton}
                        <span ref={plusButtonRef} className="inline-flex">
                          <Button
                            variant="ghost-secondary"
                            icon={Plus}
                            size={buttonSize}
                            isRounded
                            tooltip="More"
                            className={cn(
                              INPUT_BAR_PILL_SURFACE_CLASSNAME,
                              INPUT_BAR_PILL_HOVER_CLASSNAME
                            )}
                            onClick={openSlashCommand}
                          />
                        </span>
                      </div>
                    )}
                    <div className="grow" />
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center gap-2">
                        <ComposerModelPicker
                          value={modelSelection}
                          agentDefault={agentDefault}
                          onChange={setModelSelection}
                          buttonSize={buttonSize}
                          side={side}
                        />
                      </div>
                      <VoicePicker
                        status={voiceStatus}
                        level={voiceLevel}
                        elapsedSeconds={voiceElapsed}
                        onRecordStart={() => setVoiceStatus("recording")}
                        onRecordStop={stopRecording}
                        size={buttonSize}
                        showStopLabel
                        buttonProps={{ className: "rounded-full" }}
                      />
                      {!isVoiceActive && (
                        <Button
                          size={buttonSize}
                          aria-label="Send message"
                          icon={ArrowUp}
                          variant="highlight"
                          disabled={isSubmitDisabled}
                          className="rounded-full"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            submit();
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {slash && (
        <ComposerSlashMenu
          ref={menuRef}
          clientRect={
            // Option B: a menu opened from "+" sits next to the button; a typed "/" keeps the
            // menu at the caret.
            searchbarForPlus && openedFromPlusRef.current
              ? getPlusButtonRect
              : slash.clientRect
          }
          query={slash.query}
          stackFrame={stackFrame}
          hasConversation={inConversation}
          onCommand={handleCommand}
          onBack={popSubMenu}
          onClose={closeSlash}
          onDetails={handleDetails}
          onAttach={handleAttach}
          onPickModel={handlePickModel}
          compactNav={useCompactNav}
          spacesSubMenu={
            useCompactNav
              ? {
                  spaces: selectableSpaces,
                  selectedSpaceIds,
                  onToggleSpace: (spaceId) =>
                    setSelectedSpaceIds((ids) =>
                      ids.includes(spaceId)
                        ? ids.filter((id) => id !== spaceId)
                        : [...ids, spaceId]
                    ),
                }
              : undefined
          }
          searchbar={
            sessionUsesSearchbar()
              ? {
                  autoFocus: searchFocusedRef.current,
                  onQueryChange: setSlashQuery,
                  onKeyDown: (event) =>
                    handlersRef.current?.onKeyDown(event) ?? false,
                  onFocus: () => {
                    searchFocusedRef.current = true;
                  },
                }
              : undefined
          }
        />
      )}

      {notice && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-primary-950 px-3 py-2 text-sm text-white shadow-lg dark:bg-primary-50-night">
          {notice}
        </div>
      )}

      <Sheet
        open={detailsItem !== null}
        onOpenChange={(open) => !open && setDetailsItem(null)}
      >
        <SheetContent size="lg" side="right">
          <SheetHeader>
            <SheetTitle>
              <div className="flex items-center gap-3">
                {detailsItem?.kind === "skill" ? (
                  <SkillAvatar skill={detailsItem.skill} />
                ) : detailsItem?.kind === "tool" ? (
                  <Icon visual={getToolIcon(detailsItem.tool)} size="md" />
                ) : null}
                {detailsItem?.kind === "skill"
                  ? detailsItem.skill.name
                  : detailsItem?.tool.name}
              </div>
            </SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <p className="text-sm text-muted-foreground">
              {detailsItem?.kind === "skill"
                ? detailsItem.skill.userFacingDescription
                : detailsItem?.tool.description}
            </p>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}
