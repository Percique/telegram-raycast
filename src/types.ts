export interface Chat {
  id: string;
  title: string;
  type: "Private" | "Group" | "Channel";
  unreadCount?: number;
  lastMessage?: string;
  description?: string;
  username?: string;
}

export interface TelegramConfig {
  apiId: number;
  apiHash: string;
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

export const SESSION_KEY = "telegram-session-v1" as const;