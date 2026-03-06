"use client";

import dynamic from "next/dynamic";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

const MDEditor = dynamic(
  () => import("@uiw/react-md-editor").then((mod) => mod.default),
  { ssr: false }
);

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  minHeight?: number;
};

export function MarkdownEditor({
  value,
  onChange,
  className,
  placeholder: _placeholder,
  minHeight = 180,
}: MarkdownEditorProps) {
  return (
    <div className={className} data-color-mode="light">
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? "")}
        height={minHeight}
        visibleDragbar={false}
        preview="live"
      />
    </div>
  );
}
