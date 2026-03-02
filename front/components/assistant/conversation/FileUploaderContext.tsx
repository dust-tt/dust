import type React from "react";
import { createContext, useContext, useMemo, useState } from "react";

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

  const value = useMemo(
    () => ({ droppedFiles, setDroppedFiles }),
    [droppedFiles]
  );

  return (
    <FileDropContext.Provider value={value}>
      {children}
    </FileDropContext.Provider>
  );
};
