import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import type { StoredUser } from "@/lib/services/auth";
import { MobileAuthService } from "@/lib/services/auth";
import { storageService } from "@/lib/services/storage";

type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: StoredUser | null;
  error: string | null;
};

type AuthContextType = AuthState & {
  login: (forcedConnection?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

const authService = new MobileAuthService(storageService);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    error: null,
  });

  const checkAuthState = useCallback(async () => {
    const user = await authService.getStoredUser();
    const tokens = await authService.getStoredTokens();

    if (user && tokens) {
      // Check if token is expired and try to refresh
      if (tokens.expiresAt < Date.now()) {
        const refreshResult = await authService.refreshToken();
        if (!refreshResult.isOk) {
          setState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            error: null,
          });
          return;
        }
      }

      setState({
        isLoading: false,
        isAuthenticated: true,
        user,
        error: null,
      });
    } else {
      setState({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        error: null,
      });
    }
  }, []);

  useEffect(() => {
    void checkAuthState();
  }, [checkAuthState]);

  const login = useCallback(async (forcedConnection?: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const result = await authService.login({ forcedConnection });

    if (result.isOk) {
      setState({
        isLoading: false,
        isAuthenticated: true,
        user: result.value.user,
        error: null,
      });
    } else {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: result.error.message || "Login failed",
      }));
    }
  }, []);

  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    await authService.logout();
    setState({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      error: null,
    });
  }, []);

  const refreshAuth = useCallback(async () => {
    await checkAuthState();
  }, [checkAuthState]);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    const updatedUser = await authService.switchWorkspace(workspaceId);
    if (updatedUser) {
      setState((prev) => ({ ...prev, user: updatedUser }));
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        refreshAuth,
        switchWorkspace,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
