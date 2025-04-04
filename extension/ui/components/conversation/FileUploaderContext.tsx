import React, { createContext, useContext, useState } from "react";

interface FileDropContextType {
  droppedFiles: File[];
  setDroppedFiles: React.Dispatch<React.SetStateAction<File[]>>;
}

const defaultContextValue: FileDropContextType = {
  droppedFiles: [],
  setDroppedFiles: () => {
    throw new Error("setDroppedFiles was called outside of FileDropProvider");
  },
};

// Create a context for file drops.
const FileDropContext = createContext<FileDropContextType>(defaultContextValue);

export const useFileDrop = () => useContext(FileDropContext);

interface FileDropProviderProps {
  children: React.ReactNode;
}

export const FileDropProvider = ({ children }: FileDropProviderProps) => {
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

  return (
    <FileDropContext.Provider value={{ droppedFiles, setDroppedFiles }}>
      {children}
    </FileDropContext.Provider>
  );
};
