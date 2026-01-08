import "../global.css";

import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StatusBar, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { PortalHost } from "@rn-primitives/portal";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SWRConfig, swrReactNativeConfig } from "@/lib/swr";

const NAV_THEME = {
  dark: true,
  colors: {
    background: "hsl(0, 0%, 6%)",
    border: "hsl(0, 0%, 18%)",
    card: "hsl(0, 0%, 8%)",
    notification: "hsl(0, 62.8%, 55%)",
    primary: "hsl(239, 84%, 67%)",
    text: "hsl(0, 0%, 98%)",
  },
};

interface AuthGateProps {
  children: React.ReactNode;
}

function AuthGate({ children }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const inAuthGroup = segments[0] === "login";

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to home if authenticated but on login page
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="hsl(239, 84%, 67%)" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1 dark">
      <SWRConfig value={swrReactNativeConfig}>
        <AuthProvider>
          <AuthGate>
            <StatusBar barStyle="light-content" />
            <Slot />
            <PortalHost />
          </AuthGate>
        </AuthProvider>
      </SWRConfig>
    </GestureHandlerRootView>
  );
}
