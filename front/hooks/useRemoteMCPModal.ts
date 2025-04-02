import { useState } from "react";

/**
 * Hook to manage RemoteMCPModal state
 */
export const useRemoteMCPModal = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const openModal = () => {
    setIsModalOpen(true);
  };

  const openEditModal = (serverId: string) => {
    setSelectedServerId(serverId);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedServerId(null);
    setIsEditMode(false);
  };

  return {
    isModalOpen,
    selectedServerId,
    setSelectedServerId,
    isEditMode,
    openModal,
    openEditModal,
    closeModal,
  };
}; 