import React, { useImperativeHandle } from 'react';
import { classNames } from '../lib/utils';
import { useState, useRef } from 'react';
import { useEffect } from 'react';
import { BackspaceIcon, CheckIcon } from '@heroicons/react/24/outline';
import { forwardRef } from 'react';
import * as ReactDOMServer from 'react-dom/server';

function TabGroup({ group, tabs }) {
  let closedTabs = false;
  group.tabs.forEach((t) => {
    if (!tabs.find((tab) => tab.id === t.id)) {
      closedTabs = true;
    }
  });
  let length = closedTabs ? 0 : group.tabs.length;

  return (
    <div
      className={classNames(
        'inline-block px-1 rounded-sm text-xs font-bold py-0.5',
        closedTabs ? 'bg-red-200' : 'bg-gray-200'
      )}
      contentEditable={false}
      data-tab-group={JSON.stringify(group)}
      closed-tabs={closedTabs ? 'true' : 'false'}
    >
      {closedTabs ? 'closed tabs' : `${length} ${length > 1 ? 'tabs' : 'tab'}`}
    </div>
  );
}

export class CmdState {
  // this.state is an array of objects of type text or tab_group.
  // `text` objects have a value.
  // `tab_group` objects have a `tabs` array.
  //
  // [
  //  { type: 'text', value: 'Hello' },
  //  { type: 'tab_group': tabs: [
  //    { id: ..., selection: false },
  //    { id: ..., selection: true },
  //  ]},
  // ]
  constructor(s) {
    this.state = s || [];
  }

  hasClosedTabs(tabs) {
    let closedTabs = false;
    this.state.forEach((item) => {
      if (item.type === 'tab_group') {
        item.tabs.forEach((t) => {
          if (!tabs.find((tab) => tab.id === t.id)) {
            closedTabs = true;
          }
        });
      }
    });
    return closedTabs;
  }

  render(tabs) {
    return (
      <>
        {this.state.map((item, i) => {
          if (item.type === 'text') {
            return item.value;
          } else if (item.type === 'tab_group') {
            return <TabGroup group={item} tabs={tabs} key={i} />;
          }
          return null;
        })}
      </>
    );
  }

  updatedFromChildNodes(childNodes) {
    let s = Array.from(childNodes)
      .map((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          let data = node.getAttribute('data-tab-group');
          if (data && data.length > 0) {
            return JSON.parse(data);
          }
        }
        if (node.nodeType === Node.TEXT_NODE) {
          return { type: 'text', value: node.textContent };
        }
        return null;
      })
      .filter((item) => item !== null);

    return new CmdState(s);
  }

  tabGroups = () => {
    return this.state
      .filter((item) => item.type === 'tab_group')
      .map((item, i) => {
        return {
          search: `TG_${i}`,
          tabs: item.tabs,
        };
      });
  };

  toQuery = () => {
    var tbIdx = 0;
    return this.state
      .map((item) => {
        if (item.type === 'text') {
          return item.value;
        } else if (item.type === 'tab_group') {
          tbIdx += 1;
          return `[TG_${tbIdx - 1}]`;
        }
        return '';
      })
      .join('')
      .trim();
  };

  toText = () => {
    return this.state
      .map((item) => {
        if (item.type === 'text') {
          return item.value;
        } else if (item.type === 'tab_group') {
          let length = item.tabs.length;
          return `(${length} ${length > 1 ? 'tabs' : 'tab'})`;
        }
        return '';
      })
      .join('')
      .trim();
  };

  json() {
    return this.state;
  }
}

function TabList({ visible, filter, tabs }, ref) {
  const [selected, setSelected] = useState({});
  const [focus, setFocus] = useState(0);
  const [ignoredSelection, setIgnoredSelection] = useState({});

  const focusRef = useRef(null);

  // filter tabs with filter
  let filteredTabs = tabs.filter((t) => {
    return (
      filter.length === 0 ||
      t.id in selected ||
      t.title.toLowerCase().includes(filter) ||
      t.url.toLowerCase().includes(filter)
    );
  });

  const selectTab = (t, i) => {
    setSelected((s) => {
      s = { ...s };
      if (!(t.id in s)) {
        s[t.id] = {
          id: t.id,
          selection: !!t.selection && !ignoredSelection[t.id],
        };
      } else {
        delete s[t.id];
      }
      return s;
    });
    setFocus(i);
  };

  useImperativeHandle(ref, () => ({
    prev: () => {
      setFocus((f) => (f > 0 ? f - 1 : 0));
    },
    next: () => {
      setFocus((f) =>
        f < filteredTabs.length - 1 ? f + 1 : filteredTabs.length - 1
      );
    },
    select: () => {
      let t = filteredTabs[focus];
      selectTab(t, focus);
    },
    reset: () => {
      setIgnoredSelection({});
      setSelected({});
      setFocus(0);
    },
    submit: () => {
      setSelected((s) => {
        s = { ...s };
        if (Object.keys(s).length === 0) {
          s[tabs[focus].id] = {
            id: tabs[focus].id,
            selection:
              !!tabs[focus].selection && !ignoredSelection[tabs[focus].id],
          };
        }
        return s;
      });
    },
    selected: () => {
      return selected;
    },
  }));

  useEffect(() => {
    if (focus > filteredTabs.length - 1) {
      setFocus(filteredTabs.length - 1);
    }
    if (focusRef.current) {
      focusRef.current.scrollIntoView({
        // behavior: 'smooth',
        block: 'nearest',
        inline: 'start',
      });
    }
  }, [focus, visible, filter, filteredTabs]);

  useEffect(() => {
    setFocus(tabs.findIndex((t) => t.active));
  }, [tabs]);

  return (
    <>
      {visible ? (
        <div className="absolute w-full top-2 bottom-24 pl-5 py-5">
          <div className="flex flex-col absolute top-0 bottom-0 left-3 right-3">
            <div className="flex-1"></div>
            <div className="flex flex-col border rounded-sm overflow-auto py-1 bg-white z-10">
              {filteredTabs.map((t, i) => (
                <div
                  className="flex w-full px-1"
                  key={t.id}
                  onMouseDown={(e) => {
                    selectTab(t, i);
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  ref={focus === i ? focusRef : null}
                >
                  <div
                    className={classNames(
                      'flex flex-col w-full cursor-pointer hover:bg-gray-200 rounded-sm',
                      focus === i ? 'bg-gray-200' : ''
                    )}
                  >
                    <div
                      className={classNames(
                        'flex flex-initial justify-center py-1 items-center '
                      )}
                    >
                      <div className="flex-initial pl-2 pr-1 py-1">
                        {!(t.id in selected) ? (
                          <div className="w-4 h-4 border border-gray-300 rounded-sm"></div>
                        ) : (
                          <div className="w-4 h-4 bg-gray-900 rounded-sm">
                            <CheckIcon className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-initial pl-1 pr-2 py-1">
                        <div
                          className="w-4 h-4 bg-contain opacity-80"
                          style={{
                            backgroundImage: `url(${t.favIconUrl})`,
                          }}
                          alt=""
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex-col w-[695px]">
                          <p className="truncate text-xs text-gray-500">
                            <span className="text-sm text-gray-900">
                              {t.title}
                            </span>
                            <span className="text-xs text-gray-500 px-1">
                              {t.domain}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-initial justify-center items-center">
                      {t.selection && !ignoredSelection[t.id] ? (
                        <div className="flex-1 flex flex-row pb-1">
                          <div className="flex-initial ml-8 text-xs">
                            <span className="bg-yellow-100 text-gray-500 rounded px-1 py-0.5">
                              selection
                              <BackspaceIcon
                                className="inline ml-0.5 mb-0.5 w-3 h-3 text-gray-500 hover:text-gray-800"
                                onMouseDown={(e) => {
                                  setIgnoredSelection((s) => {
                                    s = { ...s };
                                    s[t.id] = true;
                                    return s;
                                  });
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              />
                            </span>
                          </div>
                          <div className="flex-1 border-l-4 ml-2 border-slate-400 mr-4">
                            <p className="text-xs text-gray-500 pl-1 line-clamp-2 italic">
                              {t.selection}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
              {filteredTabs.length === 0 ? (
                <div className="flex justify-center items-center">
                  <div className="flex-col">
                    <p className="text-gray-500">No match</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

TabList = forwardRef(TabList);

export function CmdInput(
  { tabs, onSubmit, onStateUpdate, onHistoryPrev, onHistoryNext },
  ref
) {
  const [tabListVisible, setTabListVisible] = useState(false);
  const [tabListFilter, setTabListFilter] = useState('');

  const tabListRef = useRef(null);
  const contentEditableRef = useRef(null);

  useEffect(() => {
    contentEditableRef.current?.focus();
  }, []);

  useImperativeHandle(ref, () => ({
    setCmdState: (s) => {
      // Replace contentEditableRef content with s.render().
      while (contentEditableRef.current.firstChild) {
        contentEditableRef.current.removeChild(
          contentEditableRef.current.firstChild
        );
      }
      const htmlString = ReactDOMServer.renderToStaticMarkup(s.render(tabs));
      contentEditableRef.current.innerHTML = htmlString;
      for (const child of contentEditableRef.current.children) {
        if (child.getAttribute('closed-tabs') === 'true') {
          child.style.cursor = 'pointer';
          child.addEventListener('click', (e) => {
            let parent = child.parentNode;
            parent.removeChild(e.target);
          });
        }
      }
    },
  }));

  return (
    <>
      <TabList
        ref={tabListRef}
        visible={tabListVisible}
        filter={tabListFilter}
        tabs={tabs}
      />
      <div className="flex flex-row justify-center items-center w-full">
        <div className="grow pb-0 h-16 mx-3">
          <div
            className="w-full border border-gray-300 bg-gray-50 rounded-sm h-16 outline-0 focus:outline-0 resize-none px-1 py-1 whitespace-pre-wrap inline-block overflow-auto"
            contentEditable={true}
            ref={contentEditableRef}
            onPaste={(e) => {
              e.preventDefault();
              var text = e.clipboardData.getData('text/plain');
              document.execCommand('insertText', false, text);
            }}
            onKeyDown={(e) => {
              if (e.ctrlKey || e.metaKey) {
                if (e.key === 'u' || e.key === 'b' || e.key === 'i') {
                  e.preventDefault();
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSubmit();
                }
              }
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                const selection = window.getSelection();
                if (selection.rangeCount !== 0 && selection.isCollapsed) {
                  const range = window.getSelection().getRangeAt(0);
                  let node = range.endContainer;
                  let offset = range.endOffset;
                  // get index of node in the parent
                  let index = Array.prototype.indexOf.call(
                    node.parentNode.childNodes,
                    node
                  );
                  if (index === 0 && offset === 0) {
                    e.preventDefault();
                    if (e.key === 'ArrowUp') {
                      onHistoryNext();
                    }
                    if (e.key === 'ArrowDown') {
                      onHistoryPrev();
                    }
                  }
                }
              }
            }}
            onInput={(e) => {
              const selection = window.getSelection();
              if (selection.rangeCount !== 0 && selection.isCollapsed) {
                const range = window.getSelection().getRangeAt(0);
                let node = range.endContainer;
                let offset = range.endOffset;
                let lastTwo = node.textContent.slice(offset - 2, offset);

                if (lastTwo === '[[') {
                  let textNode = document.createTextNode(
                    node.textContent.slice(0, offset - 2)
                  );

                  let tabSelectNode = document.createElement('div');
                  tabSelectNode.style.display = 'inline-block';
                  tabSelectNode.setAttribute('key', 'tabselect');
                  tabSelectNode.className =
                    'bg-gray-200 px-1 rounded-sm font-bold text-xs text-gray-600 py-0.5';
                  tabSelectNode.textContent = 'tabs: ';
                  tabSelectNode.contentEditable = false;

                  let inputNode = document.createElement('input');
                  inputNode.setAttribute('type', 'text');
                  inputNode.setAttribute('placeholder', 'search');
                  inputNode.className =
                    'bg-gray-200 w-12 border-none outline-none font-normal text-gray-900 text-xs';
                  tabSelectNode.appendChild(inputNode);

                  let textNode2 = document.createTextNode(
                    node.textContent.slice(offset)
                  );

                  node.parentNode.replaceChild(textNode, node);
                  textNode.parentNode.insertBefore(
                    textNode2,
                    textNode.nextSibling
                  );
                  textNode.parentNode.insertBefore(tabSelectNode, textNode2);

                  setTabListVisible(true);
                  inputNode.focus();

                  inputNode.onblur = () => {
                    const selected = tabListRef.current?.selected();
                    setTabListVisible(false);
                    setTabListFilter('');
                    tabListRef.current?.reset();

                    if (selected && Object.keys(selected).length > 0) {
                      const htmlString = ReactDOMServer.renderToStaticMarkup(
                        <TabGroup
                          group={{
                            type: 'tab_group',
                            tabs: Object.keys(selected).map((id) => {
                              return selected[id];
                            }),
                          }}
                          tabs={tabs}
                        />
                      );
                      const wrapper = document.createElement('div');
                      wrapper.innerHTML = htmlString.trim();
                      const tabGroupNode = wrapper.firstChild;

                      // Replace tabSelectNode with tabGroupNode.
                      tabSelectNode.parentNode.replaceChild(
                        tabGroupNode,
                        tabSelectNode
                      );

                      // Prepend a space to textNode2.
                      textNode2.textContent = ` ${textNode2.textContent}`;

                      // If textNode2 is the last node add a `\n` just because ¯\_(ツ)_/¯
                      if (textNode2.nextSibling === null) {
                        textNode2.textContent = `${textNode2.textContent}\n`;
                      }

                      // Restore the cursor, taking into account the added space.
                      range.setStart(textNode2, 1);
                      range.setEnd(textNode2, 1);
                      selection.removeAllRanges();
                      selection.addRange(range);
                    } else {
                      // Remove tabSelectNode and restore cursor.
                      tabSelectNode.parentNode.removeChild(tabSelectNode);

                      range.setStart(textNode2, 0);
                      range.setEnd(textNode2, 0);
                      selection.removeAllRanges();
                      selection.addRange(range);
                    }
                    let s = new CmdState().updatedFromChildNodes(
                      e.target.childNodes
                    );
                    onStateUpdate(s);
                  };

                  inputNode.onkeydown = (e) => {
                    if (e.key === 'Escape') {
                      inputNode.blur();
                      e.preventDefault();
                    }
                    if (e.key === 'ArrowDown') {
                      tabListRef.current?.next();
                      e.preventDefault();
                    }
                    if (e.key === 'ArrowUp') {
                      tabListRef.current?.prev();
                      e.preventDefault();
                    }
                    if (e.key === ' ') {
                      tabListRef.current?.select();
                      e.preventDefault();
                    }
                    if (e.key === 'Backspace') {
                      if (inputNode.value === '') {
                        tabListRef.current?.reset();
                        inputNode.blur();
                        e.preventDefault();
                      }
                    }
                    if (e.key === 'Enter') {
                      tabListRef.current?.submit();
                      inputNode.blur();
                      e.preventDefault();
                    }
                  };

                  inputNode.oninput = (e) => {
                    setTabListFilter(e.target.value);
                  };
                }
              }

              let s = new CmdState().updatedFromChildNodes(e.target.childNodes);
              onStateUpdate(s);
            }}
            suppressContentEditableWarning={true}
          ></div>
        </div>
      </div>
    </>
  );
}

CmdInput = forwardRef(CmdInput);
