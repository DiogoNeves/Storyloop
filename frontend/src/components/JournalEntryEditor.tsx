import {
  forwardRef,
  useEffect,
  useImperativeHandle,
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
import { clipboard } from "@milkdown/plugin-clipboard";
import { history } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { toggleEmphasisCommand, toggleStrongCommand } from "@milkdown/preset-commonmark";
import { gfm, toggleStrikethroughCommand } from "@milkdown/preset-gfm";

import { useAssetUpload } from "@/hooks/useAssetUpload";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface JournalEntryEditorProps {
  initialValue: string;
  resetKey: string;
  onChange: (markdown: string) => void;
  isEditable?: boolean;
  className?: string;
}

export interface JournalEntryEditorHandle {
  focus: () => void;
}

const JournalEntryEditorInner = forwardRef<
  JournalEntryEditorHandle,
  JournalEntryEditorProps
>(
  ({ initialValue, resetKey, onChange, isEditable = true, className }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedRef = useRef(false);
  const [selectionPosition, setSelectionPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

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

  useEffect(() => {
    const handleSelectionChange = () => {
      const container = containerRef.current;
      const selection = document.getSelection();
      if (!container || !selection || selection.isCollapsed || !isEditable) {
        setSelectionPosition(null);
        return;
      }

      const anchorNode = selection.anchorNode;
      if (!anchorNode || !container.contains(anchorNode)) {
        setSelectionPosition(null);
        return;
      }

      const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (!range) {
        setSelectionPosition(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setSelectionPosition(null);
        return;
      }
      setSelectionPosition({
        top: rect.top + window.scrollY - 44,
        left: rect.left + window.scrollX + rect.width / 2,
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [isEditable]);

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

  return (
    <div
      ref={containerRef}
      className={cn(
        "journal-editor relative rounded-xl border border-border bg-background px-4 py-3 shadow-sm",
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
      <Milkdown />
      {isUploading ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Uploading assets…
        </p>
      ) : null}
    </div>
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
