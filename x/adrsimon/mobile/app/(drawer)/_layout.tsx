import { Ionicons } from "@expo/vector-icons";
import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { DrawerContentScrollView } from "@react-navigation/drawer";
import { Drawer } from "expo-router/drawer";
import { Pressable, View } from "react-native";

import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { SparkleAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/lib/colors";

interface NavItemProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  isActive: boolean;
  onPress: () => void;
}

function NavItem({ label, icon, isActive, onPress }: NavItemProps) {
  return (
    <Pressable
      className={`flex-row items-center gap-3 py-2.5 px-3 mx-2 rounded-xl ${
        isActive ? "bg-blue-500/10" : "active:bg-gray-100 dark:active:bg-gray-800"
      }`}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={20}
        color={isActive ? colors.blue[500] : colors.gray[500]}
      />
      <Text
        variant={isActive ? "label-base" : "copy-base"}
        className={isActive ? "text-blue-500" : "text-muted-foreground"}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const { user, logout, switchWorkspace } = useAuth();

  const handleSwitchWorkspace = (workspaceId: string) => {
    void switchWorkspace(workspaceId);
  };

  const handleLogout = () => {
    void logout();
  };

  return (
    <View className="flex-1 bg-background">
      <DrawerContentScrollView {...props} contentContainerStyle={{ flex: 1 }}>
        {/* User profile section */}
        <View className="px-4 pt-12 pb-6">
          {user && (
            <View className="flex-row items-center gap-3">
              <SparkleAvatar
                size="md"
                name={user.fullName || user.email}
                imageUrl={user.image || undefined}
              />
              <View className="flex-1">
                <Text variant="label-base" numberOfLines={1}>
                  {user.fullName || user.email}
                </Text>
                <WorkspaceSwitcher
                  workspaces={user.workspaces}
                  selectedWorkspaceId={user.selectedWorkspace}
                  onSelect={handleSwitchWorkspace}
                />
              </View>
            </View>
          )}
        </View>

        {/* Separator */}
        <View className="h-px bg-gray-100 dark:bg-gray-800 mx-4 mb-2" />

        {/* Navigation */}
        <View className="py-2">
          <NavItem
            label="Home"
            icon="home-outline"
            isActive={props.state.index === 0}
            onPress={() => props.navigation.navigate("index")}
          />
          <NavItem
            label="Conversations"
            icon="chatbubbles-outline"
            isActive={props.state.index === 1}
            onPress={() => props.navigation.navigate("conversations")}
          />
        </View>
      </DrawerContentScrollView>

      {/* Footer with sign out */}
      <View className="p-4 pb-8">
        <Button
          variant="ghost"
          size="sm"
          onPress={handleLogout}
          className="w-full justify-start"
        >
          <Ionicons name="log-out-outline" size={18} color={colors.rose[500]} />
          <Text className="text-rose-500">Sign out</Text>
        </Button>
      </View>
    </View>
  );
}

export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.gray[950] },
        headerTintColor: colors.gray[50],
        drawerStyle: { backgroundColor: colors.gray[950] },
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Drawer.Screen name="index" options={{ title: "Home" }} />
      <Drawer.Screen
        name="conversations"
        options={{
          title: "Conversations",
          swipeEnabled: false,
        }}
      />
    </Drawer>
  );
}
