import React from 'react';
import { useRef } from 'react';
import { useState, useEffect } from 'react';
import { SSE } from '../lib/see';
import { UserCircleIcon } from '@heroicons/react/20/solid';
import { classNames } from '../lib/utils';
import { Logo } from './Logo';
import { VARS } from 'variables';
import { scriptForURL } from '../lib/extractors';
import { textToBlocks, Block } from './Block';
import { CmdInput, CmdState } from './CmdInput';

const getTextFromTab = async (tab) => {
  if (!tab.url.startsWith('http')) {
    return '';
  }
  let res = await chrome.scripting.executeScript({
    injectImmediately: true,
    target: {
      tabId: tab.id,
      allFrames: false,
    },
    func: scriptForURL(tab.url),
  });
  return res[0].result;
};

const processTab = async (t, tabs) => {
  const tab = tabs.find((tt) => tt.id === t.id);
  if (tab) {
    if (t.selection && tab.selection) {
      t.text = tab.selection;
    } else {
      t.text = await getTextFromTab(tab);
    }
    t.text = t.text.replace(/[ \t]+/g, ' ');
    t.title = tab.title;
    t.url = tab.url;
  } else {
    t.not_found = true;
  }
};

export function ChatView({ user }) {
  let chatRef = useRef(null);
  let cmdInputRef = useRef(null);

  const [tabs, setTabs] = useState([]);

  const [os, setOs] = useState('linux');
  const [usage, setUsage] = useState(null);

  const [cmdStateLast, setCmdStateLast] = useState(new CmdState([]));
  const [cmdStateHistory, setCmdStateHistory] = useState([]);
  const [cmdStateIndex, setCmdStateIndex] = useState(-1);

  const [log, setLog] = useState([
    // {
    //   from: 'USER',
    //   text: 'Text',
    //   content: [
    //     {
    //       type: 'cmd_state',
    //       state: [
    //         { type: 'text', value: 'Hello World ' },
    //         { type: 'tab_group', tabs: [] },
    //         { type: 'text', value: ' World ' },
    //       ],
    //     },
    //   ],
    // },
    // {
    //   from: 'XP1',
    //   text: 'Hello World',
    //   content: textToBlocks('```csv\nhello,world\nfoo,bar\nfoo,bar,acme\n```'),
    // },
    // {
    //   from: 'XP1',
    //   text: 'Hello World',
    //   content: textToBlocks('```markdown\n# test\n\nHello world\n## foo\n\n Fun part is `this`\ntable:\n| foo | bar |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n\n### quotes: \n > Foo\n> Bar\n- test\n- foo\n- bar\n```'),
    // },
  ]);
  const [last, setLast] = useState(null);
  const [status, setStatus] = useState('ready');

  useEffect(() => {
    chrome.tabs &&
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
        setTabs(tabs);
        tabs.forEach((t) => {
          let u = new URL(t.url);
          if (u.protocol.startsWith('http')) {
            t.domain = u.hostname;
          } else {
            t.domain = u.protocol;
          }

          if (t.url.startsWith('http')) {
            chrome.scripting
              .executeScript({
                injectImmediately: true,
                target: {
                  tabId: t.id,
                  allFrames: false,
                },
                func: () => {
                  return window.getSelection().toString().trim();
                },
              })
              .then((res) => {
                if (res && res.length > 0 && res[0].result) {
                  t.selection = res[0].result;
                } else {
                  t.selection = null;
                }
              });
          } else {
            t.selection = null;
          }
        });
      });

    chrome.storage.local.get(['cmdStateLast']).then((res) => {
      if (res.cmdStateLast) {
        setCmdStateLast(new CmdState(res.cmdStateLast));
        cmdInputRef.current?.setCmdState(new CmdState(res.cmdStateLast));
      }
    });

    chrome.storage.local.get(['cmdStateHistory']).then((res) => {
      if (res.cmdStateHistory && Array.isArray(res.cmdStateHistory)) {
        setCmdStateHistory(res.cmdStateHistory.map((s) => new CmdState(s)));
      }
    });

    chrome.storage.local.get(['log']).then((res) => {
      if (res.log) {
        // If last interaction is more than 5mn ago, clear it.
        // console.log('LOG', res.log);
        if (Date.now() - res.log.lastUpdated > 1000 * 60 * 5) {
          chrome.storage.local.set({
            log: { lastUpdated: Date.now(), data: [] },
          });
        } else {
          setLog(res.log.data);
        }
      }
    });

    chrome.runtime.getPlatformInfo((info) => {
      setOs(info.os);
    });

    (async () => {
      var usageRes = await fetch(
        `${VARS.server}/api/xp1/${VARS.api_version}/usage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            secret: user.secret,
          }),
        }
      );
      if (usageRes.ok) {
        let u = await usageRes.json();
        setUsage(`$${((u.usage.total * 0.02) / 1000).toFixed(2)}`);
      }
    })();
  }, [user.secret]);

  useEffect(() => {
    chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [log, last]);

  const handleCmdStateSubmit = async (s) => {
    if (s.hasClosedTabs(tabs)) {
      return;
    }

    let tabGroups = s.tabGroups();

    // If the tabGroups is empty, we go up the history to find the last command state with a
    // non-empty tabGroups.
    for (let i = log.length - 1; i >= 0 && tabGroups.length === 0; i--) {
      let c = log[i].content;
      for (let j = c.length - 1; j >= 0 && tabGroups.length === 0; j--) {
        if (c[j].type === 'cmd_state') {
          let s = new CmdState(c[j].state);
          let tg = s.tabGroups();
          if (tg.length > 0) {
            tabGroups = tg;
            break;
          }
        }
      }
    }

    let l = [...log];
    l.push({
      from: 'USER',
      text: s.toQuery(),
      content: [{ type: 'cmd_state', state: s.json() }],
    });
    setLog(l);
    chrome.storage.local.set({
      log: { lastUpdated: Date.now(), data: l },
    });

    setCmdStateLast(new CmdState([]));
    setCmdStateIndex(-1);
    chrome.storage.local.set({ cmdStateLast: [] });
    cmdInputRef.current?.setCmdState(new CmdState([]));

    let h = [...cmdStateHistory];
    h.splice(0, 0, s);
    h = h.slice(0, 128);
    setCmdStateHistory(h);
    chrome.storage.local.set({ cmdStateHistory: h.map((h) => h.json()) });

    await Promise.all(
      tabGroups.map((g) => {
        return Promise.all(
          g.tabs.map((t) => {
            return (async () => {
              await processTab(t, tabs);
            })();
          })
        );
      })
    );

    tabGroups.forEach((g) => {
      g.tabs = g.tabs
        .map((t) => {
          if (t.not_found) {
            return null;
          } else {
            return t;
          }
        })
        .filter((t) => t);
    });

    let history = log
      .map((l) => {
        return `[${l.from}]: ${l.text}`;
      })
      .join('\n');
    if (history.length > 0) {
      history = '\n' + history;
    }

    let input = {
      query: s.toQuery(),
      history: history,
      tab_groups: tabGroups,
    };

    console.log('XP1_QUERY_INPUT', input);

    var source = new SSE(`${VARS.server}/api/xp1/${VARS.api_version}/query`, {
      headers: {
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({
        secret: user.secret,
        input,
      }),
    });

    let text = '';
    setLast({
      from: 'XP1',
      text,
      content: textToBlocks(text),
    });
    setStatus('loading');

    let runId = null;
    let errored = false;

    source.onmessage = (e) => {
      let event = null;
      try {
        event = JSON.parse(e.data);
      } catch {
        console.log('ERROR parsing message', e);
        l.push({
          from: 'XP1',
          text: 'An error occured. Please try again. Run ID: ' + runId,
          content: textToBlocks(
            'An error occured. Please try again. Run ID:\n```run\n' +
              runId +
              '\n```'
          ),
        });
        setLog(l);
        chrome.storage.local.set({
          log: { lastUpdated: Date.now(), data: l },
        });
        setLast(null);
        setStatus('ready');
        errored = true;
        return;
      }
      if (event.type === 'run_status') {
        runId = event.content.run_id;
      }
      if (event.type === 'tokens') {
        text += event.content.tokens.text;
        setLast({
          from: 'XP1',
          text,
          content: textToBlocks(text),
        });
      }
      if (event.type === 'run_status' && event.content.status === 'errored') {
        l.push({
          from: 'XP1',
          text: 'An error occured. Please try again. Run ID: ' + runId,
          content: textToBlocks(
            'An error occured. Please try again. Run ID:\n```run\n' +
              runId +
              '\n```'
          ),
        });
        setLog(l);
        chrome.storage.local.set({
          log: { lastUpdated: Date.now(), data: l },
        });
        setLast(null);
        setStatus('ready');
        errored = true;
      }
      if (event.type === 'final') {
        if (!errored) {
          l.push({
            from: 'XP1',
            text,
            content: textToBlocks(text),
          });
          setLog(l);
          chrome.storage.local.set({
            log: { lastUpdated: Date.now(), data: l },
          });
          setLast(null);
          setStatus('ready');
        }
      }
    };
    source.stream();
  };

  return (
    <div className="absolute bg-white w-full h-screen overflow-hidden text-sm">
      <div className="flex flex-col justify-center h-screen w-full font-sans pt-1">
        <div
          ref={chatRef}
          className="grow overflow-auto ml-2 mr-3 mb-2 whitespace-pre-wrap space-y-2 pt-2 pl-1"
        >
          {log.length === 0 && last === null ? (
            <div className="flex w-full mt-36">
              <div className="flex flex-col mx-auto">
                <div className="flex flex-row items-center mx-auto pr-2">
                  <div className="flex">
                    <Logo animated={true} />
                  </div>
                  <div className="flex ml-2 font-bold text-base text-gray-800">
                    DUST
                  </div>
                </div>
                <div className="flex flex-col mt-2 items-center">
                  <p className="text-gray-500 text-sm">
                    Awaiting instructions...
                  </p>
                  <p className="text-gray-400 mt-16 text-xs">
                    <span className="font-mono bg-gray-100 px-1 py-1 rounded-sm">
                      [[
                    </span>{' '}
                    to search/select tabs and include their content in the
                    context of the assistant.
                    <br />
                    <span className="font-mono bg-gray-100 px-1 py-1 rounded-sm">
                      {'↑↓'}
                    </span>{' '}
                    to cycle through your history of commands.
                    <br />
                    <span className="font-mono bg-gray-100 px-1 py-1 rounded-sm">
                      {'/reset'}
                    </span>{' '}
                    to clear the chat history (auto-reset after 5mn)
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {log.map((l, i) => {
                return (
                  <div key={i} className="flex flex-row items-start text-sm">
                    <div
                      className={classNames(
                        'flex flex-initial min-w-8 w-8 h-8 pl-2 mr-1 mt-0.5 rounded-md',
                        l.from === 'XP1' ? 'bg-gray-100' : 'bg-gray-100'
                      )}
                    >
                      {l.from === 'XP1' ? (
                        <div className="flex pt-0.5 pl-[1px]">
                          <Logo></Logo>
                        </div>
                      ) : (
                        <div className="flex pt-1">
                          <UserCircleIcon
                            className="h-5 w-5 text-gray-400 -ml-0.5 mt-0.5"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col ml-2 text-gray-700">
                      {l.content.map((c, i) => {
                        return <Block key={i} c={c} i={i} tabs={tabs} />;
                      })}
                    </div>
                  </div>
                );
              })}
              {last !== null ? (
                <div className="flex flex-row items-start text-sm">
                  <div className="flex flex-initial min-w-8 w-8 h-8 pl-2 mr-1 mt-0.5 bg-gray-100 rounded-md">
                    {last.from === 'XP1' ? (
                      <div className="flex pt-0.5 pl-[1px]">
                        <Logo animated={true}></Logo>
                      </div>
                    ) : (
                      <div className="flex pt-1">
                        <UserCircleIcon
                          className="h-5 w-5 text-gray-400 -ml-0.5 mt-0.5"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col ml-2 text-gray-700">
                    {last.content.map((c, i) => {
                      return <Block key={i} c={c} i={i} tabs={tabs} />;
                    })}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex-none w-full">
          <CmdInput
            ref={cmdInputRef}
            tabs={tabs}
            onSubmit={() => {
              if (status === 'ready') {
                if (cmdStateIndex !== -1) {
                  handleCmdStateSubmit(cmdStateHistory[cmdStateIndex]);
                } else {
                  handleCmdStateSubmit(cmdStateLast);
                }
              }
            }}
            onStateUpdate={(s) => {
              setCmdStateLast(s);
              setCmdStateIndex(-1);
              chrome.storage.local.set({ cmdStateLast: s.json() });
            }}
            onHistoryPrev={() => {
              if (cmdStateIndex > -1) {
                const newIdx = cmdStateIndex - 1;
                setCmdStateIndex(newIdx);
                if (newIdx === -1) {
                  cmdInputRef.current?.setCmdState(cmdStateLast);
                } else {
                  cmdInputRef.current?.setCmdState(cmdStateHistory[newIdx]);
                }
              }
            }}
            onHistoryNext={() => {
              if (cmdStateIndex < cmdStateHistory.length - 1) {
                const newIdx = cmdStateIndex + 1;
                setCmdStateIndex(newIdx);
                cmdInputRef.current?.setCmdState(cmdStateHistory[newIdx]);
              }
            }}
          />
        </div>

        <div className="flex flex-row w-full text-xs text-right my-1">
          <div className="flex flex-initial text-gray-300 ml-3">
            Usage (this period):
            <span className="font-bold text-gray-400 ml-1">{usage}</span>
          </div>
          <div className="flex flex-1"></div>
          <div className="flex flex-initial text-gray-300 mr-3">
            <span className="font-bold text-gray-400 mr-1">
              {os === 'mac' ? '⌘' : 'ctrl'}+⏎
            </span>
            to Run
          </div>
        </div>
      </div>
    </div>
  );
}
