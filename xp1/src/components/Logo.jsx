import React from 'react';
import { classNames } from '../lib/utils';

export function Logo({ animated, green, orange }) {
  return (
    <div
      className={classNames(
        'flex flex-row items-center',
        animated ? 'animate-pulse' : ''
      )}
    >
      <div className="flex rotate-[30deg]">
        <div
          className={classNames(
            'w-[5px] h-3 rounded-xl',
            green ? 'bg-green-600' : orange ? 'bg-orange-600' : 'bg-gray-400'
          )}
        ></div>
        <div className="bg-transparent w-[2px] h-2"></div>
        <div
          className={classNames(
            'w-[5px] h-4 rounded-xl',
            green ? 'bg-green-600' : orange ? 'bg-orange-600' : 'bg-gray-400'
          )}
        ></div>
      </div>
    </div>
  );
}
