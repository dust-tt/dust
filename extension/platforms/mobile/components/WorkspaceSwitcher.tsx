import { useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import type { ExtensionWorkspaceType } from "@/lib/services/auth";

interface WorkspaceSwitcherProps {
  workspaces: ExtensionWorkspaceType[];
  selectedWorkspaceId: string | null;
  onSelect: (workspaceId: string) => void;
}

export function WorkspaceSwitcher({
  workspaces,
  selectedWorkspaceId,
  onSelect,
}: WorkspaceSwitcherProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const selectedWorkspace = workspaces.find(
    (w) => w.sId === selectedWorkspaceId
  );

  const handleSelect = (workspaceId: string) => {
    onSelect(workspaceId);
    setModalVisible(false);
  };

  if (workspaces.length <= 1) {
    return (
      <Text className="text-sm text-muted-foreground">
        {selectedWorkspace?.name ?? "No workspace"}
      </Text>
    );
  }

  return (
    <>
      <Pressable
        className="flex-row items-center gap-1 py-0.5"
        onPress={() => setModalVisible(true)}
      >
        <Text className="text-sm text-muted-foreground">
          {selectedWorkspace?.name ?? "Select workspace"}
        </Text>
        <Ionicons name="chevron-down" size={14} color="hsl(0, 0%, 63.9%)" />
      </Pressable>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/60 justify-end"
          onPress={() => setModalVisible(false)}
        >
          <View className="bg-card rounded-t-2xl max-h-[60%] pb-[34px]">
            <View className="flex-row justify-between items-center p-4">
              <Text className="text-lg font-semibold">Switch workspace</Text>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color="hsl(0, 0%, 63.9%)" />
              </Pressable>
            </View>

            <Separator />

            <FlatList
              data={workspaces}
              keyExtractor={(item) => item.sId}
              renderItem={({ item }) => (
                <Pressable
                  className={`flex-row justify-between items-center py-4 px-4 ${
                    item.sId === selectedWorkspaceId
                      ? "bg-accent"
                      : "active:bg-accent/50"
                  }`}
                  onPress={() => handleSelect(item.sId)}
                >
                  <Text
                    className={`text-base ${
                      item.sId === selectedWorkspaceId
                        ? "text-primary font-semibold"
                        : "text-foreground"
                    }`}
                  >
                    {item.name}
                  </Text>
                  {item.sId === selectedWorkspaceId && (
                    <Ionicons name="checkmark" size={20} color="hsl(239, 84%, 67%)" />
                  )}
                </Pressable>
              )}
              ItemSeparatorComponent={() => <Separator />}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
