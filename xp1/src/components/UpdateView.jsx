import React from 'react';
import { Logo } from './Logo';

export function UpdateView({ update }) {
  console.log('UPDATE', update);
  return (
    <div className="absolute bg-gray-700 text-gray-100 w-full h-screen overflow-hidden text-sm">
      <div className="flex flex-col h-full items-center">
        <div className="flex flex-1"></div>
        <div className="flex h-16 flex-row items-center">
          <div className="flex">
            <Logo animated />
          </div>
          <div className="flex ml-2 font-bold">XP1</div>
        </div>
        <div className="flex">
          Update to version {update.version} is required.
        </div>
        <div className="flex h-32 mt-4 text-gray-500">
          Visit
          <div
            className="text-sky-600 mx-0.5 cursor-pointer"
            onClick={() => {
              chrome.tabs.create({ url: update.update_url });
            }}
          >
            {update.update_url}
          </div>
          to update.
        </div>
        <div className="flex flex-1"></div>
      </div>
    </div>
  );
}
