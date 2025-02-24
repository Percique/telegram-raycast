// src/index.tsx

import {
  ActionPanel,
  Action,
  List,
  showToast,
  Toast,
  Icon,
  Color,
  LocalStorage,
  useNavigation,
  open,
  Detail,
  Form,
} from "@raycast/api";
import { useEffect, useState, useCallback } from "react";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { SESSION_KEY, Chat, ChatType } from "./types";
import { getTelegramConfig } from "./config";
import QRCode from 'qrcode';

// Constants
const MAX_RETRY_ATTEMPTS = 3;
const AUTH_TIMEOUT_MS = 180000; // 3 minutes
const AUTH_CHECK_INTERVAL_MS = 1000; // 1 second
const SELECTED_FOLDER_ID_KEY = "selected-folder-id";
const FOLDER_INCLUDE_PEERS_KEY = "folder-include-peers";
const FOLDER_PINNED_PEERS_KEY = "folder-pinned-peers"; // Новая константа

/**
 * Safely open a chat in the Telegram desktop app
 */
async function openInTelegram(chatId: string, username: string | undefined): Promise<void> {
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
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to open Telegram",
      message: String(error)
    });
  }
}

/**
 * Safely sanitize text to prevent JSON rendering issues
 */
function sanitizeText(text: string | undefined): string {
  if (!text) return "";
  
  try {
    // Replace problematic characters
    return text
      // Keep only common ASCII characters and simple Unicode
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, "")
      .trim()
      .substring(0, 1000); // Limit length for safety
  } catch (e) {
    console.error("Error sanitizing text:", e);
    return ""; // Return empty string on error
  }
}

/**
 * Generate QR code for authentication
 */
async function generateQRCode(url: string): Promise<string> {
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
    return "";
  }
}

/**
 * Component to display and interact with chat messages
 */
function ChatMessages({ chat, onClose, client, handleError }: {
  chat: Chat;
  onClose: () => void;
  client: TelegramClient | null;
  handleError: (error: unknown) => Promise<void>;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadMessages = useCallback(async () => {
    try {
      if (!client) throw new Error("Client not initialized");
      setIsLoading(true);
      
      const result = await client.getMessages(chat.id, {
        limit: 30
      });
      
      if (!result || !Array.isArray(result)) {
        throw new Error("Failed to load messages");
      }
      
      const sanitizedMessages = result.map(msg => {
        try {
          return {
            date: msg.date || 0,
            message: sanitizeText(msg.message) || "",
            out: Boolean(msg.out),
            sender: msg.sender && 'firstName' in msg.sender ? {
              firstName: sanitizeText(msg.sender.firstName) || "Unknown"
            } : undefined
          };
        } catch (e) {
          console.error("Error processing message:", e);
          return {
            date: 0,
            message: "Error processing message",
            out: false
          };
        }
      });
      
      setMessages(sanitizedMessages);
    } catch (error) {
      console.error("Error loading messages:", error);
      await handleError(error);
    } finally {
      setIsLoading(false);
    }
  }, [client, chat.id, handleError]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || !client) return;
    
    try {
      await client.sendMessage(chat.id, { message: sanitizeText(newMessage) });
      setNewMessage("");
      await loadMessages();
    } catch (error) {
      console.error("Error sending message:", error);
      await handleError(error);
    }
  }, [client, chat.id, newMessage, loadMessages, handleError]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Write a message..."
      onSearchTextChange={setNewMessage}
      searchText={newMessage}
      navigationTitle={chat.title || "Chat"}
      enableFiltering={false}
      throttle={false}
    >
      <List.Section title={chat.title || "Chat"}>
        <List.Item
          title="New Message"
          subtitle={newMessage}
          icon={Icon.Message}
          actions={
            <ActionPanel>
              <Action
                title="Send"
                icon={Icon.Message}
                onAction={handleSendMessage}
                shortcut={{ modifiers: [], key: "return" }}
              />
              <Action
                title="Close"
                icon={Icon.Xmark}
                onAction={onClose}
                shortcut={{ modifiers: ["cmd"], key: "z" }}
              />
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                onAction={loadMessages}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
              />
            </ActionPanel>
          }
        />
        {messages.map((msg, index) => (
          <List.Item
            key={index}
            title={msg.out ? "You" : (msg.sender?.firstName || "Unknown")}
            subtitle={msg.message || ""}
            accessories={[{ 
              text: msg.date ? new Date(msg.date * 1000).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              }) : ""
            }]}
            icon={{ 
              source: Icon.Message,
              tintColor: msg.out ? Color.Blue : Color.Green 
            }}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard
                  title="Copy Message"
                  content={msg.message || ""}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
                <Action
                  title="Close"
                  icon={Icon.Xmark}
                  onAction={onClose}
                  shortcut={{ modifiers: ["cmd"], key: "z" }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

/**
 * Folder Settings Component
 */
function FolderSettings({ client, currentFolderId, onFolderSelect, navigation }: {
  client: TelegramClient;
  currentFolderId?: number;
  onFolderSelect: (folderId?: number, includePeers?: any[], pinnedPeers?: any[]) => Promise<void>;
  navigation: { pop: () => void };
}) {
  const [folders, setFolders] = useState<{ 
    id: number; 
    title: string; 
    emoticon?: string; 
    includePeers?: any[];
    pinnedPeers?: any[];
  }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadFolders = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Get all dialog filters (folders)
      const result = await client.invoke(new Api.messages.GetDialogFilters());
      
      if (!result || !result.filters) {
        throw new Error("Failed to load folders");
      }

      console.log("Loaded dialog filters:", JSON.stringify(result.filters.slice(0, 1), null, 2));

      // Map the API response to our simpler model
      const mappedFolders = result.filters.map((filter: any) => {
        try {
          // Добавляем includePeers и pinnedPeers в модель папки для фильтрации
          let includePeers: any[] = [];
          let pinnedPeers: any[] = [];
          
          if (filter.includePeers) {
            includePeers = filter.includePeers;
          } else if (filter.include_peers) {
            includePeers = filter.include_peers;
          }
          
          if (filter.pinnedPeers) {
            pinnedPeers = filter.pinnedPeers;
          } else if (filter.pinned_peers) {
            pinnedPeers = filter.pinned_peers;
          }
          
          console.log(`Folder "${filter.title || 'Unnamed'}": found ${includePeers.length} include_peers, ${pinnedPeers.length} pinned_peers`);
          
          return {
            id: filter.id || 0,
            title: typeof filter.title === 'string' ? sanitizeText(filter.title) : 
                  filter.title?.text ? sanitizeText(filter.title.text) : "Unnamed Folder",
            emoticon: filter.emoticon ? sanitizeText(filter.emoticon) : "",
            includePeers, // Сохраняем список чатов для папки
            pinnedPeers // Сохраняем список закрепленных чатов
          };
        } catch (e) {
          console.error("Error processing folder:", e);
          return {
            id: 0,
            title: "Error Folder",
            emoticon: ""
          };
        }
      }).filter(f => f.id !== 0);

      // Add the default "All Chats" option
      const allFolders = [
        {
          id: 0,
          title: "All Chats"
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
              folder.id === currentFolderId ? { icon: Icon.Checkmark, tooltip: "Current selection" } : {},
              // Показать количество чатов в папке
              folder.includePeers && folder.includePeers.length > 0 ? { text: `${folder.includePeers.length} chats` } : {},
              // Показать количество закрепленных чатов в папке
              folder.pinnedPeers && folder.pinnedPeers.length > 0 ? { icon: Icon.Pin, tooltip: `${folder.pinnedPeers.length} pinned` } : {}
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Select Folder"
                  icon={Icon.Folder}
                  onAction={async () => {
                    // Передаем ID папки, список включенных чатов и закрепленных чатов
                    await onFolderSelect(folder.id, folder.includePeers, folder.pinnedPeers);
                    
                    // Показываем уведомление
                    await showToast({
                      style: Toast.Style.Success,
                      title: "Folder Selected",
                      message: `Now showing chats from "${folder.title}"`
                    });
                    
                    // Возвращаемся на предыдущий экран после выбора
                    navigation.pop();
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

export default function Command() {
  const { push, pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [client, setClient] = useState<TelegramClient | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [passwordResolver, setPasswordResolver] = useState<((value: string) => void) | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<number>();
  const [error, setError] = useState<string | null>(null);

  /**
   * Handles errors uniformly across the extension
   */
  const handleError = useCallback(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Telegram Error:", error);
    
    if (message.includes("AUTH_KEY_UNREGISTERED")) {
      await LocalStorage.removeItem(SESSION_KEY);
      setNeedAuth(true);
    }
    
    await showToast({
      style: Toast.Style.Failure,
      title: "Error",
      message: message.substring(0, 100) // Limit length for UI
    });
    
    setError(message);
  }, []);

  /**
   * Clears the current session
   */
  const clearSession = useCallback(async () => {
    try {
      console.log("Clearing session...");
      if (client) {
        try {
          await client.disconnect();
        } catch (error) {
          console.warn("Error disconnecting client:", error);
        }
      }
      await LocalStorage.removeItem(SESSION_KEY);
      setClient(null);
      setNeedAuth(true);
      setChats([]);
    } catch (e) {
      console.error("Error clearing session:", e);
    }
  }, [client]);

  /**
   * Safely formats a dialog entity into a Chat object
   */
  const formatDialog = useCallback((dialog: any): Chat | null => {
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
    } catch (err) {
      console.warn("Error processing dialog:", err);
      return null;
    }
  }, []);

  /**
   * Loads chats for the current client and folder
   */
  const loadChats = useCallback(async (telegramClient: TelegramClient, folderId?: number) => {
    try {
      setIsLoading(true);
      console.log(`Loading chats for folder ID: ${folderId}`);
      
      let dialogs: any[] = [];

      if (!folderId || folderId === 0) {
        // For "All Chats" folder
        console.log("Loading all chats...");
        const result = await telegramClient.getDialogs({
          limit: 500 // Увеличенный лимит чатов
        });
        dialogs = Array.isArray(result) ? result : [];
      } else {
        // For specific folders - используем правильный формат запроса с folder_id (snake_case)
        console.log(`Loading chats for folder ID: ${folderId} using invoke`);
        
        // Используем напрямую API.messages.GetDialogs с правильным параметром folderId
        try {
          const result = await telegramClient.invoke(
            new Api.messages.GetDialogs({
              offsetDate: 0,
              offsetId: 0,
              offsetPeer: new Api.InputPeerEmpty(),
              limit: 500,
              excludePinned: false,
              folderId: folderId
            })
          );

          if (result && 'messages' in result) {
            const dialogsList = Array.isArray(result.dialogs) ? result.dialogs : [];
            console.log(`Received ${dialogsList.length} dialogs from folder`);
            dialogs = dialogsList;
          }
        } catch (error) {
          console.error("Error using folder_id parameter:", error);
          console.log("Falling back to regular getDialogs without filter...");
          
          const result = await telegramClient.getDialogs({
            limit: 500 // Увеличенный лимит чатов
          });
          dialogs = Array.isArray(result) ? result : [];
        }
      }

      console.log(`Processing ${dialogs.length} dialogs total`);
      
      const formattedChats: Chat[] = [];

      for (const dialog of dialogs) {
        const chat = formatDialog(dialog);
        if (chat) {
          formattedChats.push(chat);
        }
      }
      
      console.log(`Formatted ${formattedChats.length} chats`);
      setChats(formattedChats);
    } catch (error) {
      console.error("Error loading chats:", error);
      await handleError(error);
    } finally {
      setIsLoading(false);
    }
  }, [handleError, formatDialog]);

  /**
   * Handles QR code authentication
   */
  const handleQRAuth = useCallback(async (telegramClient: TelegramClient, config: { apiId: number, apiHash: string }) => {
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Authorization timeout"));
        }, AUTH_TIMEOUT_MS);

        let passwordPromise: Promise<string> | null = null;

        telegramClient.signInUserWithQrCode(
          { apiId: config.apiId, apiHash: config.apiHash },
          {
            qrCode: async (qrCode: { token: Buffer }) => {
              try {
                const token = qrCode.token.toString('base64');
                const qrUrl = `tg://login?token=${token}`;
                setQrCode(qrUrl);
                const dataUrl = await generateQRCode(qrUrl);
                setQrDataUrl(dataUrl);
              } catch (error) {
                console.error("QR generation error:", error);
              }
            },
            onError: async (error: Error) => {
              console.log("QR auth error:", error.message);
              if (error.message.includes("2FA")) {
                setNeedPassword(true);
                return false;
              }
              reject(error);
              return true;
            },
            password: async () => {
              console.log("Password requested by Telegram");
              setNeedPassword(true);

              try {
                passwordPromise = new Promise<string>((resolvePassword) => {
                  setPasswordResolver(() => (password: string) => {
                    console.log("Password received from form, length:", password.length);
                    resolvePassword(password);
                  });
                });

                const password = await passwordPromise;
                console.log("Returning password to Telegram");
                return password;
              } catch (error) {
                console.error("Password error:", error);
                reject(error);
                throw error;
              }
            }
          }
        );

        // Check authorization status periodically
        const authCheck = setInterval(async () => {
          try {
            const authorized = await telegramClient.isUserAuthorized();
            if (authorized) {
              clearInterval(authCheck);
              clearTimeout(timeout);
              const session = telegramClient.session.save() as unknown as string;
              await LocalStorage.setItem(SESSION_KEY, session);
              setNeedAuth(false);
              setNeedPassword(false);
              setPasswordResolver(null);
              resolve(true);
            }
          } catch (error) {
            console.warn("Auth check error:", error);
          }
        }, AUTH_CHECK_INTERVAL_MS);
      });

      await loadChats(telegramClient);
    } catch (error) {
      console.error("QR Auth error:", error);
      if (error instanceof Error) {
        if (error.message.includes("AUTH_TOKEN_EXPIRED")) {
          await clearSession();
          initTelegram().catch(e => handleError(e));
        } else {
          await handleError(error);
        }
      }
    }
  }, [loadChats, clearSession, handleError]);

  /**
   * Handles folder selection with caching of include_peers and pinned_peers
   */
  const handleFolderSelect = useCallback(async (folderId?: number, includePeers?: any[], pinnedPeers?: any[]) => {
    try {
      console.log(`Selecting folder with ID: ${folderId}, has includePeers: ${Boolean(includePeers)}, pinnedPeers: ${Boolean(pinnedPeers)}`);
      setSelectedFolderId(folderId);
      
      // Сохраняем ID папки
      await LocalStorage.setItem(SELECTED_FOLDER_ID_KEY, folderId || 0);
      
      // Список всех пиров (включенные + закрепленные) для фильтрации
      let allPeers: { type: string; id: string }[] = [];
      
      // Обработка includePeers
      if (folderId && folderId !== 0 && includePeers && includePeers.length > 0) {
        console.log(`Saving ${includePeers.length} include_peers to cache`);
        
        // Преобразуем peer IDs в формат строк для сохранения
        const includePeerIds = includePeers.map(peer => {
          if (peer.userId) return { type: "user", id: peer.userId.toString() };
          if (peer.channelId) return { type: "channel", id: `-100${peer.channelId}` };
          if (peer.chatId) return { type: "chat", id: `-${peer.chatId}` };
          return null;
        }).filter(Boolean);
        
        // Сохраняем преобразованные ID в кэше
        await LocalStorage.setItem(FOLDER_INCLUDE_PEERS_KEY, JSON.stringify(includePeerIds));
        
        // Добавляем в общий список пиров
        allPeers = [...includePeerIds];
      } else {
        // Очищаем кэш includePeers если выбрана папка "All Chats"
        await LocalStorage.removeItem(FOLDER_INCLUDE_PEERS_KEY);
      }
      
      // Обработка pinnedPeers
      if (folderId && folderId !== 0 && pinnedPeers && pinnedPeers.length > 0) {
        console.log(`Saving ${pinnedPeers.length} pinned_peers to cache`);
        
        // Преобразуем pinnedPeers IDs в формат строк
        const pinnedPeerIds = pinnedPeers
          .map(peer => {
            if (peer.userId) return { type: "user", id: peer.userId.toString() };
            if (peer.channelId) return { type: "channel", id: `-100${peer.channelId}` };
            if (peer.chatId) return { type: "chat", id: `-${peer.chatId}` };
            return null;
          })
          .filter((peer): peer is { type: string; id: string } => peer !== null);
        
        // Сохраняем преобразованные ID в кэше
        await LocalStorage.setItem(FOLDER_PINNED_PEERS_KEY, JSON.stringify(pinnedPeerIds));
        
        // Добавляем в общий список пиров, исключая дубликаты
        pinnedPeerIds.forEach(pinnedPeer => {
          if (!allPeers.some(p => p.id === pinnedPeer.id)) {
            allPeers.push(pinnedPeer);
          }
        });
      } else {
        // Очищаем кэш pinnedPeers если выбрана папка "All Chats" или нет закрепленных чатов
        await LocalStorage.removeItem(FOLDER_PINNED_PEERS_KEY);
      }
      
      if (folderId && folderId !== 0 && allPeers.length > 0) {
        console.log(`Total unique peers for filtering: ${allPeers.length}`);
        
        // Загружаем все чаты, затем фильтруем их локально
        if (client) {
          setIsLoading(true);
          const result = await client.getDialogs({
            limit: 500 // Увеличенный лимит чатов
          });
          
          const dialogs = Array.isArray(result) ? result : [];
          console.log(`Loaded ${dialogs.length} total chats for filtering`);
          
          // Фильтруем чаты по объединенному списку peerIds
          const formattedChats: Chat[] = [];
          
          for (const dialog of dialogs) {
            const chat = formatDialog(dialog);
            if (chat) {
              // Проверяем, входит ли чат в список включенных в папку или закрепленных
              const isInFolder = allPeers.some(peer => chat.id === peer.id);
              
              if (isInFolder) {
                formattedChats.push(chat);
              }
            }
          }
          
          console.log(`Filtered to ${formattedChats.length} chats in the folder (including pinned)`);
          setChats(formattedChats);
          setIsLoading(false);
        }
      } else if (client) {
        // Для "All Chats" или если нет списка пиров, загружаем все чаты
        await loadChats(client, folderId);
      }
    } catch (error) {
      console.error("Error selecting folder:", error);
      await handleError(error);
    }
  }, [client, loadChats, handleError, formatDialog]);

  /**
   * Initializes the Telegram client and restores cached folder selection
   */
  const initTelegram = useCallback(async (retryAttempt = 0) => {
    try {
      setIsLoading(true);
      setError(null);

      const config = await getTelegramConfig();
      const savedSession = await LocalStorage.getItem<string>(SESSION_KEY);
      
      const newClient = new TelegramClient(
        new StringSession(savedSession || ""), 
        config.apiId,
        config.apiHash,
        {
          connectionRetries: 5,
          useWSS: true,
          timeout: 60000,
          deviceModel: "Raycast Extension",
          systemVersion: "1.0.0",
          appVersion: "1.0.0"
        }
      );
      
      try {
        await newClient.connect();
        setClient(newClient);

        const clientAuthorized = await newClient.isUserAuthorized().catch(() => false);
        
        if (!clientAuthorized) {
          setNeedAuth(true);
          await handleQRAuth(newClient, config);
        } else {
          setNeedAuth(false);
          
          // Загружаем сохраненный ID папки
          const savedFolderId = await LocalStorage.getItem<number>(SELECTED_FOLDER_ID_KEY);
          setSelectedFolderId(savedFolderId || 0);
          
          // Проверяем, есть ли сохраненные данные для папки
          if (savedFolderId && savedFolderId !== 0) {
            const savedIncludePeersStr = await LocalStorage.getItem<string>(FOLDER_INCLUDE_PEERS_KEY);
            const savedPinnedPeersStr = await LocalStorage.getItem<string>(FOLDER_PINNED_PEERS_KEY);
            
            let allPeers: any[] = [];
            
            // Обрабатываем includePeers
            if (savedIncludePeersStr) {
              try {
                const savedIncludePeers = JSON.parse(savedIncludePeersStr);
                console.log(`Found cached include_peers for folder ${savedFolderId}: ${savedIncludePeers.length} peers`);
                allPeers = [...savedIncludePeers];
              } catch (error) {
                console.error("Error parsing saved include peers IDs:", error);
              }
            }
            
            // Обрабатываем pinnedPeers
            if (savedPinnedPeersStr) {
              try {
                const savedPinnedPeers = JSON.parse(savedPinnedPeersStr);
                console.log(`Found cached pinned_peers for folder ${savedFolderId}: ${savedPinnedPeers.length} peers`);
                
                // Добавляем закрепленные чаты, исключая дубликаты
                savedPinnedPeers.forEach((pinnedPeer: any) => {
                  if (!allPeers.some(p => p.id === pinnedPeer.id)) {
                    allPeers.push(pinnedPeer);
                  }
                });
              } catch (error) {
                console.error("Error parsing saved pinned peers IDs:", error);
              }
            }
            
            // Если есть сохраненные пиры, применяем их для фильтрации
            if (allPeers.length > 0) {
              console.log(`Total unique cached peers: ${allPeers.length}`);
              
              // Загружаем чаты и применяем сохраненный фильтр
              setIsLoading(true);
              const result = await newClient.getDialogs({
                limit: 500 // Увеличенный лимит чатов
              });
              
              const dialogs = Array.isArray(result) ? result : [];
              console.log(`Loaded ${dialogs.length} total chats for filtering with cached peer list`);
              
              // Фильтруем чаты по списку allPeers
              const formattedChats: Chat[] = [];
              
              for (const dialog of dialogs) {
                const chat = formatDialog(dialog);
                if (chat) {
                  // Проверяем, входит ли чат в список пиров
                  const isInFolder = allPeers.some((peer: any) => chat.id === peer.id);
                  
                  if (isInFolder) {
                    formattedChats.push(chat);
                  }
                }
              }
              
              console.log(`Filtered to ${formattedChats.length} chats using cached peer list`);
              setChats(formattedChats);
              setIsLoading(false);
              return; // Прерываем выполнение, так как уже загрузили и отфильтровали чаты
            }
          }
          
          // Если нет сохраненных данных о папке или возникла ошибка, используем обычную загрузку
          await loadChats(newClient, savedFolderId);
        }
      } catch (connectionError) {
        if (retryAttempt < MAX_RETRY_ATTEMPTS) {
          console.log(`Reconnection attempt ${retryAttempt + 1}/${MAX_RETRY_ATTEMPTS}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          await initTelegram(retryAttempt + 1);
        } else {
          throw connectionError;
        }
      }
    } catch (error) {
      await handleError(error);
    } finally {
      setIsLoading(false);
    }
  }, [handleQRAuth, loadChats, handleError, formatDialog]);

  // Initialize on component mount
  useEffect(() => {
    initTelegram().catch(e => handleError(e));
  }, []);

  // Handle fatal errors
  if (error && !needAuth && !selectedChat) {
    return (
      <Detail
        isLoading={isLoading}
        markdown={`# Error Connecting to Telegram\n\n${error}\n\nPlease try again.`}
        actions={
          <ActionPanel>
            <Action 
              title="Try Again" 
              icon={Icon.ArrowClockwise}
              onAction={() => {
                setError(null);
                setIsLoading(true);
                initTelegram().catch(e => handleError(e));
              }} 
            />
          </ActionPanel>
        }
      />
    );
  }

  // Render different UI based on state
  if (selectedChat) {
    return (
      <ChatMessages 
        chat={selectedChat} 
        onClose={() => setSelectedChat(null)}
        client={client}
        handleError={handleError}
      />
    );
  }

  if (needAuth) {
    if (needPassword) {
      return (
        <Form
          actions={
            <ActionPanel>
              <Action.SubmitForm
                title="Submit Password"
                onSubmit={async (values) => {
                  try {
                    console.log("Submitting 2FA password...");
                    const password = values.password.trim();
                    if (!password) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: "Error",
                        message: "Password cannot be empty"
                      });
                      return;
                    }
                    if (passwordResolver) {
                      passwordResolver(password);
                      setPasswordResolver(null);
                    }
                  } catch (e) {
                    console.error("Error submitting password:", e);
                    await handleError(e);
                  }
                }}
              />
            </ActionPanel>
          }
        >
          <Form.Description text="Please enter your 2FA password to complete the authorization." />
          <Form.PasswordField
            id="password"
            title="2FA Password"
            placeholder="Enter your 2FA password"
            autoFocus
            onChange={(value) => {
              if (value.endsWith('\n') || value.endsWith('\r')) {
                const password = value.trim();
                if (password && passwordResolver) {
                  passwordResolver(password);
                  setPasswordResolver(null);
                }
              }
            }}
          />
        </Form>
      );
    }

    return (
      <Detail
        isLoading={isLoading}
        markdown={`
# Telegram Authorization

Scan the QR code to log in:

${qrDataUrl ? `![QR Code](${qrDataUrl})` : 'Generating QR code...'}

1. Open Telegram on your phone
2. Go to Settings → Devices
3. Click "Connect Device"
4. Scan the QR code above
`}
      />
    );
  }

  // Filter chats based on search text
  const filteredChats = chats.filter(chat =>
    chat.title.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search Chats..."
    >
      <List.Section title="Chats" subtitle={selectedFolderId ? "Filtered by folder" : undefined}>
        {filteredChats.length === 0 && !isLoading ? (
          <List.EmptyView
            title="No chats found"
            description={selectedFolderId ? "Try selecting a different folder" : "No chats available"}
            icon={Icon.Message}
          />
        ) : (
          filteredChats.map((chat) => (
            <List.Item
              key={chat.id}
              title={chat.title || "Unknown Chat"}
              subtitle={chat.lastMessage || ""}
              accessories={[
                {
                  text: chat.unreadCount ? String(chat.unreadCount) : undefined,
                  icon: chat.unreadCount ? { source: Icon.Dot, tintColor: Color.Red } : undefined
                },
                { text: chat.type }
              ]}
              icon={
                chat.type === "Private" ? { source: Icon.PersonCircle, tintColor: Color.Blue } :
                chat.type === "Group" ? { source: Icon.TwoPeople, tintColor: Color.Green } :
                chat.type === "Channel" ? { source: Icon.Megaphone, tintColor: Color.Orange } :
                Icon.Message
              }
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <Action
                      title="View Messages"
                      icon={Icon.Message}
                      onAction={() => setSelectedChat(chat)}
                    />
                    <Action
                      title="Open in Telegram"
                      icon={Icon.Globe}
                      shortcut={{ modifiers: ["cmd"], key: "return" }}
                      onAction={() => openInTelegram(chat.id, chat.username)}
                    />
                  </ActionPanel.Section>
                  <ActionPanel.Section>
                    <Action
                      title="Select Folder"
                      icon={Icon.Folder}
                      shortcut={{ modifiers: ["cmd"], key: "f" }}
                      onAction={() => {
                        if (client) {
                          push(
                            <FolderSettings
                              client={client}
                              currentFolderId={selectedFolderId}
                              onFolderSelect={handleFolderSelect}
                              navigation={{ pop }}
                            />
                          );
                        }
                      }}
                    />
                    <Action.CopyToClipboard
                      title="Copy Chat ID"
                      content={String(chat.id)}
                      shortcut={{ modifiers: ["cmd"], key: "c" }}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))
        )}
      </List.Section>
    </List>
  );
}