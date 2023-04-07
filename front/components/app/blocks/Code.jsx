import Block from "./Block";
import dynamic from "next/dynamic";
import "@uiw/react-textarea-code-editor/dist.css";
import { classNames, shallowBlockClone } from "@app/lib/utils";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

export default function Code({
  owner,
  app,
  spec,
  run,
  block,
  status,
  running,
  readOnly,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
  onBlockNew,
}) {
  const handleCodeChange = (code) => {
    let b = shallowBlockClone(block);
    b.spec.code = code;
    onBlockUpdate(b);
  };

  return (
    <Block
      owner={owner}
      app={app}
      spec={spec}
      run={run}
      block={block}
      status={status}
      running={running}
      readOnly={readOnly}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
    >
      <div className="mx-4 flex w-full flex-col">
        <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
          <div className="flex flex-initial items-center">code :</div>
          <div className="flex w-full font-normal">
            <div className="w-full leading-4">
              <div
                className={classNames(
                  "border bg-slate-100",
                  false ? "border-red-500" : "border-slate-100"
                )}
                style={{
                  minHeight: "80px",
                }}
              >
                <CodeEditor
                  readOnly={readOnly}
                  value={block.spec.code}
                  language="js"
                  placeholder=""
                  onChange={(e) => handleCodeChange(e.target.value)}
                  padding={15}
                  minHeight={78}
                  className="bg-slate-100"
                  style={{
                    fontSize: 12,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                    backgroundColor: "rgb(241 245 249)",
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
