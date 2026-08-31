import type { SettingsSection } from "@app/components/UserSettingsPopover";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface UserSettingsContextType {
  isOpen: boolean;
  section: SettingsSection;
  open: (section?: SettingsSection) => void;
  close: () => void;
}

const UserSettingsContext = createContext<UserSettingsContextType | null>(null);

interface UserSettingsProviderProps {
  children: ReactNode;
}

export function UserSettingsProvider({ children }: UserSettingsProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>("personal");

  const open = useCallback((nextSection: SettingsSection = "personal") => {
    setSection(nextSection);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({ isOpen, section, open, close }),
    [isOpen, section, open, close]
  );

  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  );
}

// UserMenu also renders on workspace-less pages (/no-workspace, /invite-choose)
// which sit outside AppRootLayout, and therefore outside this provider. There the
// dialog is never rendered and its "Personal Settings" entry is hidden, so opening
// is a no-op rather than an error.
const NO_PROVIDER_FALLBACK: UserSettingsContextType = {
  isOpen: false,
  section: "personal",
  open: () => {},
  close: () => {},
};

export function useUserSettings() {
  return useContext(UserSettingsContext) ?? NO_PROVIDER_FALLBACK;
}
