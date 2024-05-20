import React, { useState, useEffect } from "react";

interface MultiInputProps {
  initialValues: string;
  onValuesChange: (value: string) => void;
}

export function MultiInput({ initialValues, onValuesChange }: MultiInputProps) {
  const [inputValue, setInputValue] = useState<string>(initialValues);

  useEffect(() => {
    // Ensure onValuesChange is called with the initial value
    onValuesChange(inputValue);
  }, []);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleSave = () => {
    onValuesChange(inputValue);
  };

  const handleClear = () => {
    setInputValue("");
    onValuesChange("");
  };

  return (
    <div className="s-flex s-flex-col s-gap-1 s-text-sm">
      <p>White listed channel patterns:</p>
      <div className="s-flex s-flex-row s-gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="Regex pattern to follow"
          className="multi-input s-gap-1 flex-grow rounded-lg border p-4"
        />
        <button
          onClick={handleSave}
          className="save-button rounded-lg bg-green-600 p-4 text-white"
        >
          Save
        </button>
        <button
          onClick={handleClear}
          className="clear-button rounded-lg bg-gray-500 p-4 text-white"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
