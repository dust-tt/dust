import dynamic from "next/dynamic";
import "@uiw/react-textarea-code-editor/dist.css";

const UiwCodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

export default function CodeEditor({
  allowEnter = true,
  onKeyDown,
  ...restOfProps
}) {
  const handleKeyDown = (e) => {
    if (!allowEnter && (e.code === "Enter" || e.code === "NumpadEnter")) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    return onKeyDown?.(e);
  };

  return <UiwCodeEditor onKeyDown={handleKeyDown} {...restOfProps} />;
}
