export interface Preferences {
  apiId: string;
  apiHash: string;
  phoneNumber: string;
}

export interface Chat {
  id: string;
  title: string;
  type: string;
  username?: string;
  unreadCount?: number;
  lastMessage?: string;
  description?: string;
}

export const SESSION_KEY = "telegram-session-v1" as const;