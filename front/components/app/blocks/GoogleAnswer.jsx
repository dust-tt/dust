import Block from "./Block";
import { classNames, shallowBlockClone } from "../../../lib/utils";

export default function GoogleAnswer({
  user,
  app,
  block,
  status,
  running,
  readOnly,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
}) {
  const handleQuestionChange = (question) => {
    let b = shallowBlockClone(block);
    b.spec.question = question;
    onBlockUpdate(b);
  };
  return (
    <Block
      user={user}
      app={app}
      block={block}
      status={status}
      running={running}
      readOnly={readOnly}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
    >
      <div className="flex flex-col mx-4 w-full">
        <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
          <div className="flex flex-initial">Question for Google:</div>
          <div className="flex flex-initial font-normal">
            <input
              type="text"
              className={classNames(
                "block flex-1 rounded-md px-1 font-normal text-xl py-1 w-8",
                readOnly
                  ? "border-white ring-0 focus:ring-0 focus:border-white"
                  : "border-white focus:border-gray-300 focus:ring-0"
              )}
              readOnly={readOnly}
              value={block.spec.question}
              onChange={(e) => handleQuestionChange(e.target.value)}
            />
          </div>
          <div className="text-sm text-slate-400">
            Return values of this block look like &#123; "question": "How tall
            is the Empire State Building?", "answer": "1,454 feet" &#125;. If
            Google does not provide an answer to the question, then answer will
            be null.
          </div>
        </div>
      </div>
    </Block>
  );
}
