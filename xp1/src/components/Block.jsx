import React from 'react';
import { ClipboardIcon } from '@heroicons/react/24/outline';
import { classNames } from '../lib/utils';
import { useState, useRef } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/20/solid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CmdState } from './CmdInput';

const RENDER_TYPES = ['markdown', 'csv'];

export function cmdStateToBlocks(cmdState) {}

export function textToBlocks(raw) {
  let blocks = [];
  let block = null;
  let text = null;
  let lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.trimRight().endsWith('```') || line.trimLeft().startsWith('```')) {
      if (block) {
        if (!line.trimLeft().startsWith('```') && line.length > 3) {
          block.content += line.trimRight().slice(0, -3);
        }
        blocks.push(block);
        block = null;
      } else {
        if (text) {
          if (!line.trimLeft().startsWith('```') && line.length > 3) {
            text.content += line.trimRight().slice(0, -3);
          }
          blocks.push(text);
          text = null;
        }
        let block_type = null;
        if (line.trimLeft().startsWith('```')) {
          block_type = line.trimLeft().slice(3);
        }
        block = {
          type: 'block',
          block_type,
          content: '',
        };
      }
    } else if (block) {
      block.content += line + '\n';
    } else if (text) {
      text.content += line + '\n';
    } else {
      text = {
        type: 'text',
        content: line + '\n',
      };
    }
  }
  if (block) {
    blocks.push(block);
  }
  if (text && text.content.trim().length > 0) {
    blocks.push(text);
  }
  return blocks;
}

function csvToArray(text) {
  let p = '',
    row = [''],
    ret = [row],
    i = 0,
    r = 0,
    s = !0,
    l;
  for (l of text) {
    if ('"' === l) {
      if (s && l === p) row[i] += l;
      s = !s;
    } else if (',' === l && s) l = row[++i] = '';
    else if ('\n' === l && s) {
      if ('\r' === p) row[i] = row[i].slice(0, -1);
      row = ret[++r] = [(l = '')];
      i = 0;
    } else row[i] += l;
    p = l;
  }
  ret = ret.filter((arr) => arr.length > 1 || arr[0]);

  // Make sure ret arrays have all the same size.
  let max = 0;
  for (let i = 0; i < ret.length; i++) {
    if (ret[i].length > max) {
      max = ret[i].length;
    }
  }
  for (let i = 0; i < ret.length; i++) {
    while (ret[i].length < max) {
      ret[i].push('');
    }
  }
  return ret;
}

export function Block({ i, c, tabs }) {
  const [copy, setCopy] = useState('Copy');
  const [raw, setRaw] = useState(c.block_type === 'csv' ? false : true);

  let copyTarget = useRef(null);

  if (c.type === 'cmd_state') {
    let s = new CmdState(c.state);
    return (
      <div key={i} className="mt-1 text-gray-700 py-1">
        {s.render(tabs)}
      </div>
    );
  }
  if (c.type === 'text') {
    return (
      <div key={i} className="mt-1 text-gray-700 py-1">
        {c.content.trim()}
      </div>
    );
  }
  if (c.type === 'block') {
    return (
      <div
        key={i}
        className="flex flex-col bg-gray-700 text-gray-100 rounded-sm mt-0.5"
      >
        <div className="flex flex-row py-1 text-xs px-2">
          <div className="flex flex-initial font-bold text-indigo-300">
            {c.block_type ? c.block_type : ''}
          </div>

          {c.block_type === 'csv' ? (
            <>
              <div className="ml-3"></div>
              <div
                className={classNames(
                  'flex flex-initial cursor-pointer',
                  raw ? '' : 'text-gray-400'
                )}
                onClick={() => {
                  setRaw(true);
                }}
              >
                raw
              </div>
              <div
                className={classNames(
                  'flex flex-initial ml-1 cursor-pointer',
                  raw ? 'text-gray-400' : ''
                )}
                onClick={() => {
                  setRaw(false);
                }}
              >
                table
              </div>
            </>
          ) : null}

          {c.block_type === 'markdown' ? (
            <>
              <div className="ml-3"></div>
              <div
                className={classNames(
                  'flex flex-initial cursor-pointer',
                  raw ? '' : 'text-gray-400'
                )}
                onClick={() => {
                  setRaw(true);
                }}
              >
                raw
              </div>
              <div
                className={classNames(
                  'flex flex-initial ml-1 cursor-pointer',
                  raw ? 'text-gray-400' : ''
                )}
                onClick={() => {
                  setRaw(false);
                }}
              >
                render
              </div>
            </>
          ) : null}

          <div className="flex flex-1 items-center"></div>
          {c.block_type === 'csv' ? (
            <div
              className="flex flex-initial items-center cursor-pointer"
              onClick={() => {}}
            >
              <ArrowDownTrayIcon className="h-3 w-3" />
              <div
                className="flex ml-1"
                onClick={() => {
                  var dataStr =
                    'data:text/csv;charset=utf-8,' +
                    encodeURIComponent(c.content);
                  var downloadAnchorNode = document.createElement('a');
                  downloadAnchorNode.setAttribute('href', dataStr);
                  downloadAnchorNode.setAttribute('download', `xp1-ouput.csv`);
                  document.body.appendChild(downloadAnchorNode); // required for firefox
                  downloadAnchorNode.click();
                  downloadAnchorNode.remove();
                }}
              >
                Download
              </div>
            </div>
          ) : null}
          <div
            className="flex flex-initial items-center cursor-pointer ml-2"
            onClick={() => {
              if (
                RENDER_TYPES.includes(c.block_type) &&
                !raw &&
                copyTarget.current
              ) {
                const copy = copyTarget.current.cloneNode(true);
                const blob = new Blob([copy.outerHTML], {
                  type: 'text/html',
                });
                navigator.clipboard.write([
                  new ClipboardItem({ 'text/html': blob }),
                ]);
              } else {
                navigator.clipboard.writeText(c.content);
              }
              setCopy('Copied!');
              setTimeout(() => {
                setCopy('Copy');
              }, 750);
            }}
          >
            <ClipboardIcon className="h-3 w-3" />
            <div className="flex ml-1">{copy}</div>
          </div>
        </div>
        <div className="flex flex-row bg-gray-800 text-gray-50 px-2 py-2 rounded-b-md">
          {c.block_type === 'csv' && !raw ? (
            <div className="flex flex-1">
              <table ref={copyTarget} className="border border-gray-500">
                <tbody>
                  {csvToArray(c.content).map((l, i) => {
                    return (
                      <tr
                        key={i}
                        className={classNames(
                          i !== 0 ? 'border-t border-gray-500' : ''
                        )}
                      >
                        {l.map((c, j) => {
                          return (
                            <td
                              key={j}
                              className={classNames(
                                j !== 0 ? 'border-l border-gray-500' : '',
                                'px-1 py-0.5'
                              )}
                            >
                              {c}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : c.block_type === 'markdown' && !raw ? (
            <div className="flex flex-1">
              <div
                className={classNames(
                  'prose prose-invert prose-sm',
                  'prose-headings:my-0 prose-p:my-0 prose-tabe:my-0 space-y-0 prose-blockquote:my-0',
                  'prose-ol:my-0 prose-ul:my-0 prose-li:my-0 prose-ul:space-y-0'
                )}
                ref={copyTarget}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {c.content}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex flex-1">{c.content}</div>
          )}
        </div>
      </div>
    );
  }
}
