// src/config.ts

import { LocalStorage } from "@raycast/api";
import { TelegramConfig } from "./types";

/**
 * Retrieves Telegram API configuration
 * Preserving existing API credentials
 */
export async function getTelegramConfig(): Promise<TelegramConfig> {
  try {
    const selectedFolderId = await LocalStorage.getItem<number>("selected-folder-id");
    
    return {
      apiId: 24474607,
      apiHash: "de99c4d3e20c6fe0d35c1baa98f763e0",
      selectedFolderId: selectedFolderId || 0
    };
  } catch (error) {
    console.error("Error loading Telegram config:", error);
    throw error;
  }
}