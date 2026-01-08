import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginScreen() {
  const { login, isLoading, error } = useAuth();

  const handleLogin = () => {
    void login();
  };

  return (
    <View className="flex-1 bg-background justify-center items-center px-6">
      {/* Logo */}
      <View className="w-20 h-20 rounded-2xl bg-blue-500 items-center justify-center mb-8">
        <Ionicons name="sparkles" size={40} color="white" />
      </View>

      {/* Title */}
      <Text variant="heading-4xl" className="text-center mb-2">
        Dust
      </Text>
      <Text
        variant="copy-base"
        className="text-muted-foreground text-center mb-10"
      >
        Your AI assistant
      </Text>

      {/* Error message */}
      {error && (
        <View className="mb-4 px-4 py-3 bg-rose-100 dark:bg-rose-900/30 rounded-xl w-full max-w-xs">
          <Text className="text-rose-600 dark:text-rose-400 text-center text-sm">
            {error}
          </Text>
        </View>
      )}

      {/* Sign in button */}
      <Button
        variant="highlight"
        size="md"
        onPress={handleLogin}
        disabled={isLoading}
        className="w-full max-w-xs"
      >
        {isLoading ? (
          <Spinner size="sm" variant="light" />
        ) : (
          <Text>Sign in</Text>
        )}
      </Button>
    </View>
  );
}
