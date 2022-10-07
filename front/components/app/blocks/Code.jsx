import Block from "./Block";
import dynamic from "next/dynamic";
import "@uiw/react-textarea-code-editor/dist.css";
import { classNames, shallowBlockClone } from "../../../lib/utils";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

export default function Code({
  block,
  readOnly,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
}) {
  const handleCodeChange = (code) => {
    let b = shallowBlockClone(block);
    b.spec.code = code;
    onBlockUpdate(b);
  };

  return (
    <Block
      block={block}
      readOnly={readOnly}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
    >
      <div className="flex flex-col mx-4 w-full">
        <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
          <div className="flex flex-initial items-center">code :</div>
          <div className="flex w-full font-normal">
            <div className="w-full leading-4">
              <div
                className={classNames(
                  "border bg-gray-100",
                  false ? "border-red-500" : "border-gray-300"
                )}
                style={{
                  minHeight: "80px",
                }}
              >
                <CodeEditor
                  value={block.spec.code}
                  language="js"
                  placeholder=""
                  onChange={(e) => handleCodeChange(e.target.value)}
                  padding={15}
                  minHeight={78}
                  style={{
                    fontSize: 12,
                    backgroundColor: "#f5f5f5",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Block>
  );
}
