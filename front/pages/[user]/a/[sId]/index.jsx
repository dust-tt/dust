import AppLayout from "../../../../components/app/AppLayout";
import MainTab from "../../../../components/app/MainTab";
import { ActionButton } from "../../../../components/Button";
import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../api/auth/[...nextauth]";
import { PlayCircleIcon } from "@heroicons/react/20/solid";
import { useSession } from "next-auth/react";
import NewBlock from "../../../../components/app/NewBlock";
import {
  addBlock,
  deleteBlock,
  moveBlockDown,
  moveBlockUp,
} from "../../../../lib/specification";
import { useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import Root from "../../../../components/app/blocks/Root";
import Data from "../../../../components/app/blocks/Data";
import LLM from "../../../../components/app/blocks/LLM";
import Code from "../../../../components/app/blocks/Code";
import { Map, Reduce } from "../../../../components/app/blocks/MapReduce";
import { updateConfig } from "../../../../lib/config";
import Config from "../../../../components/app/Config";

const { URL } = process.env;
let saveTimeout = null;

export default function App({ app }) {
  const { data: session } = useSession();

  const [spec, setSpec] = useState(JSON.parse(app.savedSpecification || `[]`));
  const [config, setConfig] = useState(
    updateConfig(JSON.parse(app.savedConfig || `{}`), spec)
  );

  const saveState = async (spec, config) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    saveTimeout = setTimeout(async () => {
      const [specRes] = await Promise.all([
        fetch(`/api/apps/${app.sId}/state`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            specification: JSON.stringify(spec),
            config: JSON.stringify(config),
          }),
        }),
      ]);
      console.log("STATE SAVED", spec, config);
    }, 1000);
  };

  const handleNewBlock = (blockType) => {
    let s = addBlock(spec, blockType);
    let c = updateConfig(config, s);
    setSpec(s);
    setConfig(c);
    saveState(s, c);
  };

  const handleDeleteBlock = (idx) => {
    let s = deleteBlock(spec, idx);
    let c = updateConfig(config, s);
    setSpec(s);
    setConfig(c);
    saveState(s, c);
  };

  const handleMoveBlockUp = (idx) => {
    let s = moveBlockUp(spec, idx);
    let c = updateConfig(config, s);
    setSpec(s);
    setConfig(c);
    saveState(s, c);
  };

  const handleMoveBlockDown = (idx) => {
    let s = moveBlockDown(spec, idx);
    let c = updateConfig(config, s);
    setSpec(s);
    setConfig(c);
    saveState(s, c);
  };

  const handleSetBlock = (idx, block) => {
    let s = spec.map((b) => b);

    // Sync map/reduce names
    if (block.type == "map" && block.name != s[idx].name) {
      for (var i = idx; i < s.length; i++) {
        if (s[i].type == "reduce" && s[i].name == s[idx].name) {
          s[i].name = block.name;
          break;
        }
      }
    }
    if (block.type == "reduce" && block.name != s[idx].name) {
      for (var i = idx; i >= 0; i--) {
        if (s[i].type == "map" && s[i].name == s[idx].name) {
          s[i].name = block.name;
          break;
        }
      }
    }

    s[idx] = block;

    let c = updateConfig(config, s);

    setSpec(s);
    setConfig(c);
    saveState(s, c);
  };

  const handleSetConfig = (c) => {
    setConfig(c);
    saveState(spec, c);
  };

  return (
    <AppLayout app={{ sId: app.sId, name: app.name }}>
      <div className="flex flex-col">
        <div className="flex flex-initial mt-2">
          <MainTab
            app={{ sId: app.sId, name: app.name }}
            current_tab="Specification"
          />
        </div>
        <div className="flex flex-1">
          <div className="flex flex-col mx-4 w-full">
            <div className="flex flex-row my-4 space-x-2">
              <div className="flex">
                <NewBlock
                  disabled={false}
                  onClick={handleNewBlock}
                  spec={spec}
                />
              </div>
              <div className="flex">
                <ActionButton disabled={true}>
                  <PlayCircleIcon className="-ml-1 mr-1 h-5 w-5 mt-0.5" />
                  Run
                </ActionButton>
              </div>
            </div>

            {/* This is a hack to force loading the component before we render the LLM blocks.
                Otherwise the autoresize does not work on init?
                TODO(spolu): investigate
            */}
            <TextareaAutosize className="hidden" value="foo" />

            <div className="flex flex-col space-y-2">
              <Config
                app={app}
                config={config}
                onConfigUpdate={handleSetConfig}
              />

              {spec.map((block, idx) => {
                switch (block.type) {
                  case "root":
                    return (
                      <Root
                        key={idx}
                        block={block}
                        app={app}
                        readOnly={false}
                        onBlockUpdate={(block) => handleSetBlock(idx, block)}
                        onBlockDelete={() => handleDeleteBlock(idx)}
                        onBlockUp={() => handleMoveBlockUp(idx)}
                        onBlockDown={() => handleMoveBlockDown(idx)}
                      />
                    );
                    break;

                  case "data":
                    return (
                      <Data
                        key={idx}
                        block={block}
                        app={app}
                        readOnly={false}
                        onBlockUpdate={(block) => handleSetBlock(idx, block)}
                        onBlockDelete={() => handleDeleteBlock(idx)}
                        onBlockUp={() => handleMoveBlockUp(idx)}
                        onBlockDown={() => handleMoveBlockDown(idx)}
                      />
                    );
                    break;

                  case "llm":
                    return (
                      <LLM
                        key={idx}
                        block={block}
                        app={app}
                        readOnly={false}
                        onBlockUpdate={(block) => handleSetBlock(idx, block)}
                        onBlockDelete={() => handleDeleteBlock(idx)}
                        onBlockUp={() => handleMoveBlockUp(idx)}
                        onBlockDown={() => handleMoveBlockDown(idx)}
                      />
                    );
                    break;

                  case "code":
                    return (
                      <Code
                        key={idx}
                        block={block}
                        app={app}
                        readOnly={false}
                        onBlockUpdate={(block) => handleSetBlock(idx, block)}
                        onBlockDelete={() => handleDeleteBlock(idx)}
                        onBlockUp={() => handleMoveBlockUp(idx)}
                        onBlockDown={() => handleMoveBlockDown(idx)}
                      />
                    );
                    break;

                  case "map":
                    return (
                      <Map
                        key={idx}
                        block={block}
                        app={app}
                        readOnly={false}
                        onBlockUpdate={(block) => handleSetBlock(idx, block)}
                        onBlockDelete={() => handleDeleteBlock(idx)}
                        onBlockUp={() => handleMoveBlockUp(idx)}
                        onBlockDown={() => handleMoveBlockDown(idx)}
                      />
                    );
                    break;

                  case "reduce":
                    return (
                      <Reduce
                        key={idx}
                        block={block}
                        app={app}
                        readOnly={false}
                        onBlockUpdate={(block) => handleSetBlock(idx, block)}
                        onBlockDelete={() => handleDeleteBlock(idx)}
                        onBlockUp={() => handleMoveBlockUp(idx)}
                        onBlockDown={() => handleMoveBlockDown(idx)}
                      />
                    );
                    break;

                  default:
                    return (
                      <div key={idx} className="flex flex-row px-4">
                        {block.type}
                      </div>
                    );
                    break;
                }
              })}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export async function getServerSideProps(context) {
  const session = await unstable_getServerSession(
    context.req,
    context.res,
    authOptions
  );

  // TODO(spolu): allow public viewing of apps

  if (!session) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  if (context.query.user != session.user.username) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  const [appRes] = await Promise.all([
    fetch(`${URL}/api/apps/${context.query.sId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: context.req.headers.cookie,
      },
    }),
  ]);

  const [app] = await Promise.all([appRes.json()]);

  return {
    props: { session, app: app.app },
  };
}
