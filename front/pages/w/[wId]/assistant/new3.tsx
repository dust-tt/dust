// components/InputBar.js
import { Transition } from "@headlessui/react";
import { useState } from "react";

const InputBar = ({ position }) => {
  return (
    <Transition
      show={true}
      enter="transition-transform duration-500"
      enterFrom="transform translate-y-full"
      enterTo="transform translate-y-0"
      leave="transition-transform duration-500"
      leaveFrom="transform translate-y-0"
      leaveTo="transform translate-y-full"
      className={`absolute flex w-full justify-center ${
        position === "middle"
          ? "top-1/2 -translate-y-1/2 transform"
          : "bottom-0"
      }`}
    >
      <div className="w-1/2 p-4">
        <input
          type="text"
          placeholder="Ask a question or get some @help"
          className="w-full rounded border p-2"
        />
      </div>
    </Transition>
  );
};

export const NewConversation = ({ inputBarPosition }) => {
  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center">
      <div className="flex flex-col items-center justify-center">
        <h1 className="mb-4 text-2xl font-bold">Start a conversation</h1>
        <p>Ask a question or get some help.</p>
      </div>
      <InputBar position={inputBarPosition} />
    </div>
  );
};

export const ExistingConversation = ({ inputBarPosition }) => {
  return (
    <div className="relative h-screen w-full">
      <div className="p-4">
        <h1 className="mb-4 text-2xl font-bold">Flavien David</h1>
        <div className="mb-4 rounded bg-gray-100 p-4">
          <p>test</p>
          <div className="mt-2 flex space-x-2">
            <button className="rounded bg-blue-500 p-2 text-white">
              @dust
            </button>
            <button className="rounded bg-blue-500 p-2 text-white">
              GPT-4
            </button>
            <button className="rounded bg-blue-500 p-2 text-white">
              @Summary
            </button>
            <button className="rounded bg-gray-300 p-2 text-black">
              Select another
            </button>
          </div>
        </div>
      </div>
      <InputBar position={inputBarPosition} />
    </div>
  );
};

export const ConversationContainer = () => {
  const [isExistingConversation, setIsExistingConversation] = useState(false);
  const [inputBarPosition, setInputBarPosition] = useState("middle");

  const toggleConversationView = () => {
    setIsExistingConversation((prev) => !prev);
    setInputBarPosition((prev) => (prev === "middle" ? "bottom" : "middle"));
  };

  return (
    <div className="relative h-screen w-full">
      <button
        onClick={toggleConversationView}
        className="absolute right-0 top-0 mr-4 mt-4 rounded bg-blue-500 p-2 text-white"
      >
        Toggle Conversation View
      </button>
      {isExistingConversation ? (
        <ExistingConversation inputBarPosition={inputBarPosition} />
      ) : (
        <NewConversation inputBarPosition={inputBarPosition} />
      )}
    </div>
  );
};
