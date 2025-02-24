// src/utils/telegramUtils.ts

import { TelegramDialog, Chat, ChatType } from "../types";
import { open } from "@raycast/api";
import QRCode from 'qrcode';

/**
 * Sanitizes text by removing control characters and emoji
 */
export function sanitizeText(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, "")
    .trim()
    .substring(0, 1000); // Limit length for safety
}

/**
 * Opens a chat in the Telegram desktop app
 */
export async function openInTelegram(chatId: string, username: string | undefined): Promise<void> {
  try {
    if (username) {
      await open(`tg://resolve?domain=${username}`);
    } else if (chatId.startsWith('-100')) {
      const peerID = chatId.replace('-100', '');
      await open(`tg://privatepost?channel=${peerID}`);
    } else if (chatId.startsWith('-')) {
      const groupId = chatId.substring(1);
      await open(`tg://group?id=${groupId}`);
    } else {
      await open(`tg://user?id=${chatId}`);
    }
  } catch (error) {
    console.error("Failed to open Telegram:", error);
    throw error;
  }
}

/**
 * Formats a TelegramDialog into a Chat object
 */
export function formatDialog(dialog: TelegramDialog): Chat | null {
  try {
    const entity = dialog.entity;
    if (!entity) return null;

    let chatType: ChatType = "Private";
    let peerId = entity.id?.toString() || "";
    
    if (entity.className === "Channel") {
      chatType = entity.megagroup ? "Group" : "Channel";
      peerId = `-100${peerId}`;
    } else if (entity.className === "Chat") {
      chatType = "Group";
      peerId = `-${peerId}`;
    }
    
    if (!peerId) return null;

    return {
      id: peerId,
      username: entity.username || "",
      title: sanitizeText(entity.title || entity.firstName || "Unknown Chat"),
      type: chatType,
      unreadCount: dialog.unreadCount || 0,
      lastMessage: sanitizeText(dialog.message?.message?.substring(0, 100) || ""),
      description: sanitizeText(entity.about || "")
    };
  } catch (error) {
    console.warn("Error formatting dialog:", error);
    return null;
  }
}

/**
 * Generates a QR code for authentication
 */
export async function generateQRCode(url: string): Promise<string> {
  try {
    return await QRCode.toDataURL(url, {
      width: 200,
      margin: 1,
      color: {
        dark: '#ffffff',
        light: '#000000'
      }
    });
  } catch (err) {
    console.error("Error generating QR code:", err);
    throw err;
  }
}