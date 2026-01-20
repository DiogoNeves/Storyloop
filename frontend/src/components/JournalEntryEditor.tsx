import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Editor,
  commandsCtx,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
  type CmdKey,
} from "@milkdown/core";
import type { Ctx } from "@milkdown/ctx";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { Fragment, type Node as ProseNode, type Mark } from "@milkdown/prose/model";
import type { EditorView } from "@milkdown/prose/view";
import type { SerializerState } from "@milkdown/transformer";
import { clipboard } from "@milkdown/plugin-clipboard";
import { history } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import {
  commonmark,
  paragraphSchema,
  remarkPreserveEmptyLinePlugin,
  toggleEmphasisCommand,
  toggleStrongCommand,
} from "@milkdown/preset-commonmark";
import { gfm, toggleStrikethroughCommand } from "@milkdown/preset-gfm";
import { ExternalLink, Pencil } from "lucide-react";

import { useAssetUpload } from "@/hooks/useAssetUpload";
import type { ActivityItem } from "@/lib/types/entries";
import { filterActivityItems } from "@/lib/activity-search";
import { getActivityDetailPath } from "@/lib/activity-helpers";
import { findMentionCandidate } from "@/lib/mention-search";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const serializeText = (state: SerializerState, node: ProseNode) => {
  const lastIsHardBreak =
    node.childCount >= 1 && node.lastChild?.type.name === "hardbreak";
  if (!lastIsHardBreak) {
    state.next(node.content);
    return;
  }
  const contentArr: ProseNode[] = [];
  node.content.forEach((child, _offset, index) => {
    if (index === node.childCount - 1) return;
    contentArr.push(child);
  });
  state.next(Fragment.fromArray(contentArr));
};

const shouldPreserveEmptyLine = (ctx: Ctx) => {
  try {
    ctx.get(remarkPreserveEmptyLinePlugin.id);
    return true;
  } catch {
    return false;
  }
};

const safeParagraphSchema = paragraphSchema.extendSchema((schema) => (ctx) => {
  const baseSchema = schema(ctx);
  return {
    ...baseSchema,
    toMarkdown: {
      match: baseSchema.toMarkdown?.match ?? ((node) => node.type.name === "paragraph"),
      runner: (state: SerializerState, node: ProseNode) => {
        let lastNode: ProseNode | null = null;
        try {
          lastNode = ctx.get(editorViewCtx).state?.doc.lastChild ?? null;
        } catch {
          lastNode = node;
        }
        state.openNode("paragraph");
        if (
          (!node.content || node.content.size === 0) &&
          node !== lastNode &&
          shouldPreserveEmptyLine(ctx)
        ) {
          state.addNode("html", undefined, "<br />");
        } else {
          serializeText(state, node);
        }
        state.closeNode();
      },
    },
  };
});

const commonmarkWithSafeParagraph = (() => {
  const paragraphPlugins = new Set<unknown>(paragraphSchema);
  const plugins: typeof commonmark = [];
  let inserted = false;

  for (const plugin of commonmark) {
    if (paragraphPlugins.has(plugin)) {
      if (!inserted) {
        plugins.push(...safeParagraphSchema);
        inserted = true;
      }
      continue;
    }
    plugins.push(plugin);
  }

  return plugins;
})();

interface JournalEntryEditorProps {
  initialValue: string;
  resetKey: string;
  onChange: (markdown: string) => void;
  isEditable?: boolean;
  className?: string;
  activityItems?: ActivityItem[];
}

export interface JournalEntryEditorHandle {
  focus: () => void;
}

interface LinkTooltipState {
  href: string;
  text: string;
  position: { top: number; left: number };
  from: number;
  to: number;
}

interface MentionState {
  query: string;
  position: { top: number; left: number };
  anchor: { top: number; bottom: number; left: number };
  range: { from: number; to: number };
}

const JournalEntryEditorInner = forwardRef<
  JournalEntryEditorHandle,
  JournalEntryEditorProps
>(
  (
    {
      initialValue,
      resetKey,
      onChange,
      isEditable = true,
      className,
      activityItems = [],
    },
    ref,
  ) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedRef = useRef(false);
  const editorViewRef = useRef<EditorView | null>(null);
  const mentionTooltipRef = useRef<HTMLDivElement | null>(null);
  const [selectionPosition, setSelectionPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [linkTooltip, setLinkTooltip] = useState<LinkTooltipState | null>(null);
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [mentionPosition, setMentionPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editLinkText, setEditLinkText] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");

  const editorInitialValue = useMemo(() => initialValue, [initialValue]);

  useEffect(() => {
    hasInitializedRef.current = false;
  }, [resetKey]);

  const editor = useEditor(
    (root: HTMLElement): Editor =>
      Editor.make()
        .config((ctx: Ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, editorInitialValue);
          ctx.get(listenerCtx).markdownUpdated((_ctx: Ctx, markdown: string) => {
            if (!hasInitializedRef.current) {
              hasInitializedRef.current = true;
              return;
            }
            onChange(markdown);
          });
        })
        .use(commonmarkWithSafeParagraph)
        .use(gfm)
        .use(history)
        .use(clipboard)
        .use(listener),
    [editorInitialValue, onChange, resetKey],
  );

  useEffect(() => {
    const instance = editor.get();
    if (!instance) {
      return;
    }
    instance.action((ctx: Ctx) => {
      const view = ctx.get(editorViewCtx);
      editorViewRef.current = view;
      view.setProps({
        editable: () => isEditable,
      });
    });
  }, [editor, isEditable]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        const instance = editor.get();
        if (!instance) {
          return;
        }
        instance.action((ctx: Ctx) => {
          const view = ctx.get(editorViewCtx);
          view.focus();
        });
      },
    }),
    [editor],
  );

  const insertMarkdown = useMemo(
    () => (markdown: string) => {
      const instance = editor.get();
      if (!instance) {
        return;
      }
      instance.action((ctx: Ctx) => {
        const view = ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.insertText(markdown));
        view.focus();
      });
    },
    [editor],
  );

  const { uploadFiles, isUploading } = useAssetUpload({
    onUploaded: (asset) => {
      insertMarkdown(`\n\n${asset.markdown}\n\n`);
    },
  });

  const mentionSuggestions = useMemo(() => {
    if (!mentionState || mentionState.query.trim().length === 0) {
      return [];
    }
    return filterActivityItems(activityItems, mentionState.query).slice(0, 3);
  }, [activityItems, mentionState]);

  useLayoutEffect(() => {
    if (!mentionState) {
      setMentionPosition(null);
      return;
    }
    const tooltip = mentionTooltipRef.current;
    if (!tooltip) {
      setMentionPosition(mentionState.position);
      return;
    }

    const padding = 8;
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const maxLeft = viewportWidth - tooltipRect.width - padding;
    const nextLeft = Math.min(
      Math.max(mentionState.position.left, padding),
      Math.max(padding, maxLeft),
    );

    const belowTop = mentionState.position.top;
    const aboveTop =
      mentionState.anchor.top - tooltipRect.height - padding;
    const maxBottom = viewportHeight - padding;

    const nextTop =
      belowTop + tooltipRect.height > maxBottom && aboveTop >= padding
        ? aboveTop
        : belowTop;

    setMentionPosition({ top: nextTop, left: nextLeft });
  }, [mentionState, mentionSuggestions.length]);

  const insertMention = useCallback(
    (item: ActivityItem) => {
      if (!mentionState) {
        return;
      }
      const detailPath = getActivityDetailPath(item);
      if (!detailPath) {
        return;
      }
      const instance = editor.get();
      if (!instance) {
        return;
      }
      instance.action((ctx: Ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const linkMarkType = state.schema.marks.link;
        if (!linkMarkType) {
          return;
        }

        const { from, to } = mentionState.range;
        const tr = state.tr.insertText(item.title, from, to);
        const nextTo = from + item.title.length;
        tr.addMark(from, nextTo, linkMarkType.create({ href: detailPath }));
        view.dispatch(tr);
        view.focus();
      });
      setMentionState(null);
      setMentionActiveIndex(0);
    },
    [editor, mentionState],
  );

  const updateMentionFromView = useCallback(
    (view: EditorView) => {
      if (!isEditable || linkTooltip) {
        setMentionState(null);
        setMentionActiveIndex(0);
        return;
      }

      const { selection, doc } = view.state;
      if (!selection.empty) {
        setMentionState(null);
        setMentionActiveIndex(0);
        return;
      }

      const container = containerRef.current;
      if (!container) {
        setMentionState(null);
        setMentionActiveIndex(0);
        return;
      }

      const parentStart = selection.$from.start();
      const textBefore = doc.textBetween(
        parentStart,
        selection.from,
        "\n",
        "\n",
      );
      const candidate = findMentionCandidate(textBefore);
      if (!candidate) {
        setMentionState(null);
        setMentionActiveIndex(0);
        return;
      }

      const { startIndex, query } = candidate;
      const mentionFrom = parentStart + startIndex;
      const coords = view.coordsAtPos(selection.from);
      const nextPosition = {
        top: coords.bottom + 8,
        left: coords.left,
      };

      setMentionState((prev) => {
        if (
          prev &&
          prev.query === query &&
          prev.range.from === mentionFrom &&
          prev.range.to === selection.from
        ) {
          return { ...prev, position: nextPosition };
        }
        return {
          query,
          position: nextPosition,
          anchor: { top: coords.top, bottom: coords.bottom, left: coords.left },
          range: { from: mentionFrom, to: selection.from },
        };
      });

      if (!mentionState || mentionState.query !== query) {
        setMentionActiveIndex(0);
      }
    },
    [isEditable, linkTooltip, mentionState],
  );

  // Handle link clicks
  useEffect(() => {
    const instance = editor.get();
    if (!instance) {
      return;
    }

    let cleanup: (() => void) | null = null;

    instance.action((ctx: Ctx) => {
      const view = ctx.get(editorViewCtx);
      const container = containerRef.current;
      
      const handleMiddleMouseOrModifierClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const linkElement = target.closest("a");
        
        if (linkElement?.href && container) {
          // Handle cmd/ctrl+click or middle mouse button to open immediately
          if (event.metaKey || event.ctrlKey || event.button === 1) {
            event.preventDefault();
            window.open(linkElement.href, "_blank", "noopener,noreferrer");
            setLinkTooltip(null);
            return true;
          }
        }
        return false;
      };
      
      const handleClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const linkElement = target.closest("a");
        
        if (linkElement?.href && container) {
          // Handle cmd/ctrl+click or middle mouse button to open immediately
          if (handleMiddleMouseOrModifierClick(event)) {
            return;
          }
          
          // Regular click - show tooltip
          event.preventDefault();
          
          // Find the link mark position in the editor
          instance.action((ctx: Ctx) => {
            const view = ctx.get(editorViewCtx);
            const { state } = view;
            
            // Get the position of the clicked element
            const posAtDOM = view.posAtDOM(linkElement, 0);
            if (posAtDOM === null || posAtDOM < 0) {
              return;
            }
            
            // Find the link mark at this position
            const $pos = state.doc.resolve(posAtDOM);
            const linkMark = $pos.marks().find((mark: Mark) => mark.type.name === "link");
            
            if (linkMark?.attrs.href) {
              // Find mark boundaries by searching for the extent of the link mark
              let linkFrom = posAtDOM;
              let linkTo = posAtDOM;
              
              // Search backwards to find the start of the link
              let pos = posAtDOM;
              while (pos > 0) {
                const $pos = state.doc.resolve(pos - 1);
                const mark = $pos.marks().find((m: Mark) => m.type.name === "link" && m.attrs.href === linkMark.attrs.href);
                if (!mark) break;
                linkFrom = pos - 1;
                pos--;
              }
              
              // Search forwards to find the end of the link
              pos = posAtDOM;
              while (pos < state.doc.content.size) {
                const $pos = state.doc.resolve(Math.min(pos + 1, state.doc.content.size));
                const mark = $pos.marks().find((m: Mark) => m.type.name === "link" && m.attrs.href === linkMark.attrs.href);
                if (!mark) break;
                linkTo = Math.min(pos + 1, state.doc.content.size);
                pos++;
              }
              
              // Ensure we have valid positions
              if (linkFrom < 0) linkFrom = posAtDOM;
              if (linkTo <= linkFrom) linkTo = linkFrom + 1;
              
              // Get text content
              const text = state.doc.textBetween(linkFrom, linkTo);
              
              const rect = linkElement.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              
              setLinkTooltip({
                href: linkMark.attrs.href as string,
                text: text || (linkMark.attrs.href as string),
                position: {
                  top: rect.bottom - containerRect.top + container.scrollTop + 8,
                  left: rect.left - containerRect.left + container.scrollLeft + rect.width / 2,
                },
                from: linkFrom,
                to: linkTo,
              });
              setSelectionPosition(null);
            }
          });
        }
      };
      
      view.dom.addEventListener("click", handleClick);
      view.dom.addEventListener("mousedown", handleMiddleMouseOrModifierClick);
      
      cleanup = () => {
        view.dom.removeEventListener("click", handleClick);
        view.dom.removeEventListener("mousedown", handleMiddleMouseOrModifierClick);
      };
    });

    return () => {
      cleanup?.();
    };
  }, [editor]);

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!linkTooltip) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const container = containerRef.current;
      if (container && !container.contains(target)) {
        setLinkTooltip(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [linkTooltip]);

  // Handle text selection (for formatting toolbar + mentions)
  useEffect(() => {
    const handleSelectionChange = () => {
      const container = containerRef.current;
      const selection = document.getSelection();
      
      // Clear link tooltip when clicking elsewhere
      if (linkTooltip && selection?.anchorNode) {
        const target = selection.anchorNode;
        const linkElement = target instanceof HTMLElement ? target.closest("a") : null;
        if (!linkElement) {
          setLinkTooltip(null);
        }
      }
      
      if (!container || !selection || !isEditable) {
        setSelectionPosition(null);
        setMentionState(null);
        setMentionActiveIndex(0);
        return;
      }

      const anchorNode = selection.anchorNode;
      if (!anchorNode || !container.contains(anchorNode)) {
        setSelectionPosition(null);
        setMentionState(null);
        setMentionActiveIndex(0);
        return;
      }

      // Don't show formatting toolbar if clicking on a link
      const linkElement = anchorNode instanceof HTMLElement 
        ? anchorNode.closest("a")
        : anchorNode.parentElement?.closest("a");
      if (linkElement || selection.isCollapsed) {
        setSelectionPosition(null);
      } else {
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (!range) {
          setSelectionPosition(null);
        } else {
          const rect = range.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) {
            setSelectionPosition(null);
          } else {
            setSelectionPosition({
              top: rect.top + window.scrollY - 44,
              left: rect.left + window.scrollX + rect.width / 2,
            });
          }
        }
      }

      const instance = editor.get();
      if (instance) {
        instance.action((ctx: Ctx) => {
          const view = ctx.get(editorViewCtx);
          updateMentionFromView(view);
        });
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [editor, isEditable, linkTooltip, updateMentionFromView]);

  useEffect(() => {
    const instance = editor.get();
    if (!instance) {
      return;
    }

    let activeView: EditorView | null = editorViewRef.current;
    if (!activeView) {
      instance.action((ctx: Ctx) => {
        activeView = ctx.get(editorViewCtx);
        editorViewRef.current = activeView;
      });
    }

    if (!activeView) {
      return;
    }

    const view = activeView;
    const handleEditorInput = () => {
      updateMentionFromView(view);
    };

    view.dom.addEventListener("input", handleEditorInput);
    view.dom.addEventListener("compositionend", handleEditorInput);

    return () => {
      view.dom.removeEventListener("input", handleEditorInput);
      view.dom.removeEventListener("compositionend", handleEditorInput);
    };
  }, [editor, updateMentionFromView]);

  useEffect(() => {
    if (!mentionState || mentionSuggestions.length === 0) {
      setMentionActiveIndex(0);
      return;
    }

    setMentionActiveIndex((current) =>
      Math.min(current, mentionSuggestions.length - 1),
    );
  }, [mentionState, mentionSuggestions.length]);

  useEffect(() => {
    const instance = editor.get();
    if (!instance) {
      return;
    }

    instance.action((ctx: Ctx) => {
      const view = ctx.get(editorViewCtx);
      view.setProps({
        handleKeyDown: (_view, event) => {
          if (!mentionState) {
            return false;
          }

          if (event.key === "ArrowDown") {
            if (mentionSuggestions.length === 0) {
              return false;
            }
            event.preventDefault();
            setMentionActiveIndex((current) =>
              (current + 1) % mentionSuggestions.length,
            );
            return true;
          }

          if (event.key === "ArrowUp") {
            if (mentionSuggestions.length === 0) {
              return false;
            }
            event.preventDefault();
            setMentionActiveIndex((current) =>
              (current - 1 + mentionSuggestions.length) %
              mentionSuggestions.length,
            );
            return true;
          }

          if (event.key === "Enter") {
            if (mentionSuggestions.length === 0) {
              return false;
            }
            event.preventDefault();
            const selection =
              mentionSuggestions[mentionActiveIndex] ?? mentionSuggestions[0];
            if (selection) {
              insertMention(selection);
              return true;
            }
          }

          return false;
        },
      });
    });
  }, [
    editor,
    insertMention,
    mentionActiveIndex,
    mentionState,
    mentionSuggestions,
  ]);

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (!isEditable) {
      return;
    }
    if (!event.clipboardData?.files?.length) {
      return;
    }
    event.preventDefault();
    void uploadFiles(event.clipboardData.files);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isEditable) {
      return;
    }
    if (!event.dataTransfer?.files?.length) {
      return;
    }
    event.preventDefault();
    void uploadFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isEditable) {
      return;
    }
    if (event.dataTransfer?.files?.length) {
      event.preventDefault();
    }
  };

  const runCommand = (command: { key: CmdKey<unknown> }) => {
    const instance = editor.get();
    if (!instance) {
      return;
    }
    instance.action((ctx: Ctx) => {
      ctx.get(editorViewCtx).focus();
      ctx.get(commandsCtx).call(command.key);
    });
  };

  const handleOpenLink = () => {
    if (linkTooltip) {
      window.open(linkTooltip.href, "_blank", "noopener,noreferrer");
      setLinkTooltip(null);
    }
  };

  const handleEditLink = () => {
    if (linkTooltip) {
      setEditLinkText(linkTooltip.text);
      setEditLinkUrl(linkTooltip.href);
      setIsEditDialogOpen(true);
    }
  };

  const handleSaveLink = () => {
    const instance = editor.get();
    if (!instance || !linkTooltip) {
      return;
    }

    instance.action((ctx: Ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state } = view;
      const { from, to } = linkTooltip;
      
      // Get the link mark type from the schema
      const linkMarkType = state.schema.marks.link;
      if (!linkMarkType) {
        return;
      }

      const tr = state.tr;
      
      // Get current text at this position
      const currentText = state.doc.textBetween(from, to);
      
      // Remove old link mark
      tr.removeMark(from, to, linkMarkType);
      
      // Replace text if it changed
      const newTo = from + editLinkText.length;
      if (currentText !== editLinkText) {
        tr.delete(from, to);
        tr.insertText(editLinkText, from);
      }
      
      // Add new link mark with updated URL
      const newLinkMark = linkMarkType.create({ href: editLinkUrl });
      tr.addMark(from, newTo, newLinkMark);
      
      view.dispatch(tr);
      view.focus();
    });

    setIsEditDialogOpen(false);
    setLinkTooltip(null);
  };

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "journal-editor relative rounded-xl bg-background px-4 py-3",
          !isEditable && "opacity-70",
          className,
        )}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {selectionPosition ? (
          <div
            className="absolute z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover px-2 py-1 shadow-md"
            style={{
              top: selectionPosition.top,
              left: selectionPosition.left,
            }}
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => runCommand(toggleStrongCommand)}
            >
              <span className="text-xs font-bold">B</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 italic"
              onClick={() => runCommand(toggleEmphasisCommand)}
            >
              <span className="text-xs">I</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 line-through"
              onClick={() => runCommand(toggleStrikethroughCommand)}
            >
              <span className="text-xs">S</span>
            </Button>
          </div>
        ) : null}
        {linkTooltip ? (
          <div
            className="absolute z-10 flex -translate-x-1/2 flex-col items-center gap-2 rounded-lg border border-border bg-popover p-3 shadow-lg"
            style={{
              top: linkTooltip.position.top,
              left: linkTooltip.position.left,
            }}
          >
            <div className="text-xs text-muted-foreground break-all max-w-[300px]">
              {linkTooltip.href}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleOpenLink}
                className="gap-2"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </Button>
              {isEditable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleEditLink}
                  className="gap-2"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {mentionState ? (
          <div
            ref={mentionTooltipRef}
            className="fixed z-50 w-72 rounded-lg border border-border bg-popover p-2 shadow-lg"
            style={{
              top: mentionPosition?.top ?? mentionState.position.top,
              left: mentionPosition?.left ?? mentionState.position.left,
            }}
          >
            {mentionState.query.trim().length === 0 ? (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                type to search
              </div>
            ) : mentionSuggestions.length > 0 ? (
              <div className="flex flex-col gap-1" role="listbox">
                {mentionSuggestions.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center rounded-md px-2 py-1 text-left text-sm",
                      index === mentionActiveIndex
                        ? "bg-primary/10 text-foreground"
                        : "text-foreground/90 hover:bg-muted/60",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => insertMention(item)}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                No matches
              </div>
            )}
          </div>
        ) : null}
        <Milkdown />
        {isUploading ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Uploading assets…
          </p>
        ) : null}
      </div>
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Link</DialogTitle>
            <DialogDescription>
              Update the link text and URL.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-link-text">Link Text</Label>
              <Input
                id="edit-link-text"
                value={editLinkText}
                onChange={(e) => setEditLinkText(e.target.value)}
                placeholder="Link text"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-link-url">URL</Label>
              <Input
                id="edit-link-url"
                value={editLinkUrl}
                onChange={(e) => setEditLinkUrl(e.target.value)}
                placeholder="https://example.com"
                type="url"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveLink}
              disabled={!editLinkText.trim() || !editLinkUrl.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
},
);

JournalEntryEditorInner.displayName = "JournalEntryEditorInner";

export const JournalEntryEditor = forwardRef<
  JournalEntryEditorHandle,
  JournalEntryEditorProps
>((props, ref) => (
  <MilkdownProvider>
    <JournalEntryEditorInner {...props} ref={ref} />
  </MilkdownProvider>
));

JournalEntryEditor.displayName = "JournalEntryEditor";
