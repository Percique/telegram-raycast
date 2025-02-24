// src/types.ts

export const SESSION_KEY = "telegram-session-v1" as const;

export type ChatType = "Private" | "Group" | "Channel";

export interface Chat {
  id: string;
  username: string;
  title: string;
  type: ChatType;
  unreadCount: number;
  lastMessage: string;
  description: string;
}

export interface TelegramConfig {
  apiId: number;
  apiHash: string;
  selectedFolderId?: number;
}

export interface PhotoSize {
  type: string;
  location: {
    dcId: number;
    volumeId: string;
    localId: number;
    secret: string;
  };
  w: number;
  h: number;
  size: number;
}

export interface TelegramFolder {
  id: number;
  title: string;
  emoticon: string;
  includePeers: any[];
  excludePeers: any[];
  pinnedPeers: any[];
}

export interface Preferences {
  apiId: string;
  apiHash: string;
}

export interface TelegramEntity {
  id?: number;
  className?: string;
  megagroup?: boolean;
  username?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  about?: string;
}

export interface TelegramDialog {
  entity: TelegramEntity;
  peer?: {
    userId?: number;
    channelId?: number;
    chatId?: number;
  };
  unreadCount?: number;
  message?: {
    message?: string;
  };
  topMessage?: number;
}

export interface DialogFilter {
  id?: number;
  title?: string | { text: string };
  emoticon?: string;
  include_peers?: any[];
  exclude_peers?: any[];
  pinned_peers?: any[];
}

export interface GetDialogFilterResult {
  _: string;
  filter?: DialogFilter;
  filters?: DialogFilter[];
}