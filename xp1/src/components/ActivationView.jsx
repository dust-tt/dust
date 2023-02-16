import React from 'react';
import { useState } from 'react';
import { Logo } from './Logo';
import { getUser, setSecret } from '../lib/user';

export function ActivationView({ onActivate }) {
  const [activationKey, setActivationKey] = useState('');
  const [error, setError] = useState(null);

  const onSubmit = async () => {
    let user = await getUser(activationKey);
    console.log('USER', user);
    if (user.status !== 'ready') {
      setError('Invalid activation key');
    } else {
      await setSecret(activationKey);
      onActivate();
    }
  };

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
          <input
            type="text"
            placeholder="Activation key"
            value={activationKey}
            onChange={(e) => {
              setActivationKey(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSubmit();
              }
            }}
            className="bg-gray-800 text-gray-100 p-2 rounded-md w-96 focus:outline focus:outline-gray-900"
          />
        </div>
        <div className="flex h-28 mt-4 text-gray-500">
          Visit
          <div
            className="text-sky-600 mx-0.5 cursor-pointer"
            onClick={() => {
              chrome.tabs.create({ url: 'https://xp1.dust.tt/' });
            }}
          >
            xp1.dust.tt
          </div>
          to get your activation key.
        </div>

        <div className="flex mt-4 text-red-500 h-4">{error ? error : ' '}</div>
        <div className="flex flex-1"></div>
      </div>
    </div>
  );
}
