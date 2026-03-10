import type { SkillWithVersionType } from "@app/types/assistant/skill_configuration";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface SkillVersionComparisonContextType {
  compareVersion: SkillWithVersionType | null;
  enterDiffMode: (version: SkillWithVersionType) => void;
  exitDiffMode: () => void;
}

const SkillVersionComparisonContext =
  createContext<SkillVersionComparisonContextType | null>(null);

interface SkillVersionComparisonProviderProps {
  children: React.ReactNode;
}

export function SkillVersionComparisonProvider({
  children,
}: SkillVersionComparisonProviderProps) {
  const [compareVersion, setCompareVersion] =
    useState<SkillWithVersionType | null>(null);

  const enterDiffMode = useCallback((version: SkillWithVersionType) => {
    setCompareVersion(version);
  }, []);

  const exitDiffMode = useCallback(() => {
    setCompareVersion(null);
  }, []);

  const value = useMemo(
    () => ({ compareVersion, enterDiffMode, exitDiffMode }),
    [compareVersion, enterDiffMode, exitDiffMode]
  );

  return (
    <SkillVersionComparisonContext.Provider value={value}>
      {children}
    </SkillVersionComparisonContext.Provider>
  );
}

export function useSkillVersionComparisonContext(): SkillVersionComparisonContextType {
  const context = useContext(SkillVersionComparisonContext);
  if (!context) {
    throw new Error(
      "useSkillVersionComparisonContext must be used within a SkillVersionComparisonProvider"
    );
  }
  return context;
}
