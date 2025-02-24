// src/components/FolderSettings.tsx

import { ActionPanel, Action, List, showToast, Toast, Icon, Color } from "@raycast/api";
import { useEffect, useState, useCallback } from "react";
import { TelegramClient } from "telegram";
import { Api } from "telegram/tl";
import { DialogFilter } from "../types";
import { sanitizeText } from "../utils/telegramUtils";

interface FolderSettingsProps {
  client: TelegramClient;
  currentFolderId?: number;
  onFolderSelect: (folderId?: number) => Promise<void>;
}

interface TelegramFolder {
  id: number;
  title: string;
  emoticon?: string;
  includePeers?: any[];
  excludePeers?: any[];
  pinnedPeers?: any[];
}

export function FolderSettings({ client, currentFolderId, onFolderSelect }: FolderSettingsProps) {
  const [folders, setFolders] = useState<TelegramFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadFolders = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Get all dialog filters (folders)
      const result = await client.invoke(new Api.messages.GetDialogFilters());
      
      if (!result || !result.filters) {
        throw new Error("Failed to load folders");
      }

      // Map the API response to our simpler model
      const mappedFolders = result.filters.map((filter: any) => {
        try {
          const folder: TelegramFolder = {
            id: filter.id || 0,
            title: typeof filter.title === 'string' ? sanitizeText(filter.title) : 
                   filter.title?.text ? sanitizeText(filter.title.text) : "Unnamed Folder",
            emoticon: filter.emoticon ? sanitizeText(filter.emoticon) : "",
            includePeers: filter.include_peers || [],
            excludePeers: filter.exclude_peers || [],
            pinnedPeers: filter.pinned_peers || []
          };
          return folder;
        } catch (e) {
          console.error("Error processing folder:", e);
          return {
            id: 0,
            title: "Error Folder",
            emoticon: "",
            includePeers: [],
            excludePeers: [],
            pinnedPeers: []
          };
        }
      }).filter(f => f.id !== 0);

      // Add the default "All Chats" option
      const allFolders: TelegramFolder[] = [
        {
          id: 0,
          title: "All Chats",
          emoticon: "",
          includePeers: [],
          excludePeers: [],
          pinnedPeers: []
        },
        ...mappedFolders
      ];

      setFolders(allFolders);
    } catch (error) {
      console.error("Error loading folders:", error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  return (
    <List
      isLoading={isLoading}
      navigationTitle="Select Folder"
      searchBarPlaceholder="Search folders..."
    >
      <List.Section title="Telegram Folders">
        {folders.map((folder) => (
          <List.Item
            key={folder.id}
            title={folder.title}
            subtitle={folder.emoticon}
            icon={{ 
              source: folder.id === 0 ? Icon.List : Icon.Folder,
              tintColor: folder.id === currentFolderId ? Color.Blue : Color.PrimaryText
            }}
            accessories={[
              folder.id === currentFolderId ? { icon: Icon.Checkmark, tooltip: "Current selection" } : {}
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Select Folder"
                  icon={Icon.Folder}
                  onAction={async () => {
                    await onFolderSelect(folder.id);
                    await showToast({
                      style: Toast.Style.Success,
                      title: "Folder Selected",
                      message: `Now showing chats from "${folder.title}"`
                    });
                  }}
                />
                <Action
                  title="Refresh Folders"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={loadFolders}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}