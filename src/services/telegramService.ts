// src/services/telegramService.ts

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { LocalStorage } from "@raycast/api";
import { SESSION_KEY, TelegramConfig, Chat } from "../types";
import { formatDialog, sanitizeText } from "../utils/telegramUtils";

// Client configuration
const CLIENT_CONFIG = {
  connectionRetries: 5,
  useWSS: true,
  timeout: 60000,
  deviceModel: "Raycast Extension",
  systemVersion: "1.0.0",
  appVersion: "1.0.0"
};

/**
 * Creates and initializes a new Telegram client
 */
export async function createClient(config: TelegramConfig, session?: string): Promise<TelegramClient> {
  const client = new TelegramClient(
    new StringSession(session || ""), 
    config.apiId,
    config.apiHash,
    CLIENT_CONFIG
  );
  
  await client.connect();
  return client;
}

/**
 * Gets authentication status
 */
export async function isAuthorized(client: TelegramClient): Promise<boolean> {
  try {
    return await client.isUserAuthorized();
  } catch (error) {
    console.error("Error checking auth status:", error);
    return false;
  }
}

/**
 * Saves the client session to local storage
 */
export async function saveSession(client: TelegramClient): Promise<void> {
  const session = client.session.save() as unknown as string;
  await LocalStorage.setItem(SESSION_KEY, session);
}

/**
 * Loads chats for the given folder ID
 */
export async function getChats(client: TelegramClient, folderId?: number): Promise<Chat[]> {
  try {
    console.log(`TelegramService: Loading chats for folder ID: ${folderId}`);
    let dialogs: any[] = [];

    if (!folderId || folderId === 0) {
      // For "All Chats" folder
      console.log("TelegramService: Loading all chats...");
      const result = await client.getDialogs({
        limit: 100
      });
      dialogs = Array.isArray(result) ? result : [];
    } else {
      // For specific folders
      console.log(`TelegramService: Loading chats for specific folder: ${folderId}`);
      // Используем API getDialogs с правильным параметром для папок
      const result = await client.getDialogs({
        limit: 100,
        folder: folderId // Используем правильный параметр
      });
      
      dialogs = Array.isArray(result) ? result : [];
    }

    console.log(`TelegramService: Received ${dialogs.length} dialogs`);
    const formattedChats: Chat[] = [];

    for (const dialog of dialogs) {
      const chat = formatDialog(dialog);
      if (chat) {
        formattedChats.push(chat);
      }
    }

    console.log(`TelegramService: Formatted ${formattedChats.length} chats`);
    return formattedChats;
  } catch (error) {
    console.error("TelegramService: Error loading chats:", error);
    throw error;
  }
}

/**
 * Fetches messages from a specific chat
 */
export async function getMessages(client: TelegramClient, chatId: string, limit = 30): Promise<any[]> {
  return client.getMessages(chatId, { limit });
}

/**
 * Sends a message to a specific chat
 */
export async function sendMessage(client: TelegramClient, chatId: string, message: string): Promise<void> {
  await client.sendMessage(chatId, { message: sanitizeText(message) });
}

/**
 * Disconnect the client
 */
export async function disconnect(client: TelegramClient): Promise<void> {
  try {
    await client.disconnect();
  } catch (error) {
    console.warn("Error disconnecting client:", error);
  }
}