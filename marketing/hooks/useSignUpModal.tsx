import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

interface SignUpModalContextType {
  isOpen: boolean;
  openSignUpModal: () => void;
  closeSignUpModal: () => void;
}

const SignUpModalContext = createContext<SignUpModalContextType | null>(null);

interface SignUpModalProviderProps {
  children: ReactNode;
}

export function SignUpModalProvider({ children }: SignUpModalProviderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const openSignUpModal = useCallback(() => setIsOpen(true), []);
  const closeSignUpModal = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, openSignUpModal, closeSignUpModal }),
    [isOpen, openSignUpModal, closeSignUpModal]
  );

  return (
    <SignUpModalContext.Provider value={value}>
      {children}
    </SignUpModalContext.Provider>
  );
}

export function useSignUpModal(): SignUpModalContextType {
  const ctx = useContext(SignUpModalContext);
  if (!ctx) {
    throw new Error("useSignUpModal must be used within SignUpModalProvider");
  }
  return ctx;
}
