import {
  ActionPanel,
  Action,
  List,
  showToast,
  Toast,
  Icon,
  Color,
  LocalStorage,
  Detail,
  open,
  getPreferenceValues,
  Image,
  Form,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Chat, SESSION_KEY, TelegramConfig } from "./types";
import { getTelegramConfig } from "./config";
import QRCode from 'qrcode';

// Updated interface for ChatMessages with more specific typing
interface ChatMessagesProps {
  chat: Chat;
  onClose: () => void;
  client: TelegramClient | null;
  handleError: (error: unknown) => Promise<void>;
}

// Typed message interface to replace any
interface Message {
  date: number;
  message: string;
  out: boolean;
  sender?: {
    firstName?: string;
  };
}

// Typed dialog entity interface
interface DialogEntity {
  className?: string;
  id?: { toString: () => string };
  megagroup?: boolean;
  username?: string;
  title?: string;
  firstName?: string;
  about?: string;
}

// Добавляем интерфейсы для типизации
interface TelegramPhoto {
  _: string;
  id: string;
  sizes: Array<{
    _: string;
    type: string;
    bytes: Uint8Array;
  }>;
}

interface TelegramPhotosResponse {
  _: string;
  photos: TelegramPhoto[];
  users: any[];
}

// Resolves opening chats in Telegram
async function openInTelegram(chatId: string, username: string | undefined) {
  if (username) {
    const telegramUrl = `tg://resolve?domain=${username}`;
    await open(telegramUrl);
  } else {
    if (chatId.startsWith('-100')) {
      const peerID = chatId.replace('-100', '');
      const telegramUrl = `tg://privatepost?channel=${peerID}`;
      await open(telegramUrl);
    } else if (chatId.startsWith('-')) {
      const groupId = chatId.substring(1);
      const telegramUrl = `tg://group?id=${groupId}`;
      await open(telegramUrl);
    } else {
      const telegramUrl = `tg://user?id=${chatId}`;
      await open(telegramUrl);
    }
  }
}

// Updated ChatMessages component with proper typing
function ChatMessages({ chat, onClose, client, handleError }: ChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [chatPhoto, setChatPhoto] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadMessages();
    loadChatPhoto();
  }, []);

  async function loadChatPhoto() {
    try {
      if (!client) return;

      const entity = await client.getEntity(chat.id);
      if (entity && 'photo' in entity && entity.photo) {
        const buffer = await client.downloadProfilePhoto(entity);
        if (buffer) {
          const blob = new Blob([buffer], { type: 'image/jpeg' });
          const photoUrl = URL.createObjectURL(blob);
          setChatPhoto(photoUrl);
        }
      }
    } catch (error) {
      console.warn("Error loading chat photo:", error);
    }
  }

  async function loadMessages() {
    try {
      if (!client) throw new Error("Client not initialized");
      const result = await client.getMessages(chat.id, {
        limit: 30
      });
      setMessages(result as Message[] || []);
    } catch (error) {
      console.error("Error loading messages:", error);
      await handleError(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !client) return;
    try {
      await client.sendMessage(chat.id, { message: newMessage });
      setNewMessage("");
      await loadMessages();
    } catch (error) {
      console.error("Error sending message:", error);
      await handleError(error);
    }
  }

  useEffect(() => {
    return () => {
      if (chatPhoto) {
        URL.revokeObjectURL(chatPhoto);
      }
    };
  }, [chatPhoto]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Написать сообщение..."
      onSearchTextChange={setNewMessage}
      searchText={newMessage}
      navigationTitle={chat.title}
      enableFiltering={false}
      throttle={false}
    >
      <List.Section title={`${chat.title} ${chat.type === "Private" ? "💬" : chat.type === "Group" ? "👥" : "📢"}`}>
        {/* Поле для ввода сообщения вверху */}
        <List.Item
          title="Новое сообщение"
          subtitle={newMessage}
          actions={
            <ActionPanel>
              <Action
                title="Отправить"
                icon={Icon.Message}
                onAction={sendMessage}
                shortcut={{ modifiers: [], key: "return" }}
              />
              <Action
                title="Открыть в Telegram"
                icon={Icon.Globe}
                onAction={() => openInTelegram(chat.id, chat.username)}
                shortcut={{ modifiers: ["cmd"], key: "return" }}
              />
              <Action
                title="Закрыть"
                icon={Icon.Xmark}
                onAction={onClose}
              />
            </ActionPanel>
          }
        />

        {/* Сообщения идут после поля ввода */}
        {messages.map((msg, index) => {
          const time = new Date(msg.date * 1000).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          const sender = msg.out ? "Вы" : (msg.sender?.firstName || "Unknown");
          
          return (
            <List.Item
              key={index}
              title={sender}
              subtitle={msg.message}
              accessories={[{ text: time }]}
              icon={msg.out ? "🗨️" : "💭"}
            />
          );
        })}
      </List.Section>
    </List>
  );
}

export default function Command() {
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [client, setClient] = useState<TelegramClient | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  const [qrCode, setQrCode] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [password2FA, setPassword2FA] = useState<string>("");
  const [needPassword, setNeedPassword] = useState(false);
  const [passwordResolver, setPasswordResolver] = useState<((value: string) => void) | null>(null);

  useEffect(() => {
    initTelegram();
  }, []);

  // Added max retry attempts constant
  const MAX_RETRY_ATTEMPTS = 3;

  async function initTelegram(retryAttempt = 0) {
    try {
      setIsLoading(true);

      const config = getTelegramConfig();
      const savedSession = await LocalStorage.getItem<string>(SESSION_KEY);
      
      const client = new TelegramClient(
        new StringSession(savedSession || ""), 
        Number(config.apiId),
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
        await client.connect();
        setClient(client);

        const isAuthorized = await client.isUserAuthorized().catch(() => false);
        
        if (!isAuthorized) {
          setNeedAuth(true);
          await handleQRAuth(client, config);
        } else {
          setNeedAuth(false);
          await loadChats(client);
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
    } catch (initError) {
      await handleError(initError);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleQRAuth(client: TelegramClient, config: TelegramConfig) {
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Authorization timeout"));
        }, 180000);

        let isPasswordRequired = false;
        let passwordPromise: Promise<string> | null = null;

        client.signInUserWithQrCode(
          { apiId: Number(config.apiId), apiHash: config.apiHash },
          {
            qrCode: async (qrCode: { token: Buffer }) => {
              const token = qrCode.token.toString('base64');
              const qrUrl = `tg://login?token=${token}`;
              setQrCode(qrUrl);
              await generateQRCode(qrUrl);
            },
            onError: async (error: Error) => {
              console.log("QR auth error:", error.message);
              if (error.message.includes("2FA")) {
                isPasswordRequired = true;
                setNeedPassword(true);
                return false;
              }
              reject(error);
              return true;
            },
            password: async () => {
              console.log("Password requested by Telegram");
              isPasswordRequired = true;
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

        // Проверяем статус авторизации каждую секунду
        const authCheck = setInterval(async () => {
          try {
            const isAuthorized = await client.isUserAuthorized();
            if (isAuthorized) {
              clearInterval(authCheck);
              clearTimeout(timeout);
              const session = client.session.save() as unknown as string;
              await LocalStorage.setItem(SESSION_KEY, session);
              setNeedAuth(false);
              setNeedPassword(false);
              setPasswordResolver(null);
              resolve(true);
            }
          } catch (error) {
            console.warn("Auth check error:", error);
          }
        }, 1000);
      });

      await loadChats(client);
    } catch (error) {
      console.error("QR Auth error:", error);
      if (error instanceof Error) {
        if (error.message.includes("AUTH_TOKEN_EXPIRED")) {
          await clearSession();
          await initTelegram();
        } else {
          await handleError(error);
        }
      }
    }
  }

  async function loadChats(telegramClient: TelegramClient) {
    try {
      console.log("Loading chats...");
      setIsLoading(true);
      
      // Проверяем авторизацию перед загрузкой чатов
      const isAuthorized = await telegramClient.isUserAuthorized().catch(() => false);
      if (!isAuthorized) {
        console.log("Not authorized, clearing session...");
        await clearSession();
        await initTelegram();
        return;
      }

      const dialogs = await telegramClient.getDialogs({
        limit: 100
      });
      
      const formattedChats: Chat[] = await Promise.all(
        dialogs.map(async (dialog) => {
          const entity = dialog.entity as DialogEntity;
          let chatType: "Private" | "Group" | "Channel" = "Private";
          
          if (entity?.className === "Channel") {
            chatType = entity.megagroup ? "Group" : "Channel";
          } else if (entity?.className === "Chat") {
            chatType = "Group";
          }
          
          let peerId = entity?.id?.toString() || "";
          if (chatType === "Group" || chatType === "Channel") {
            peerId = `-100${Math.abs(Number(entity?.id))}`;
          } else if (chatType === "Private") {
            peerId = entity?.id?.toString() || "";
          }

          const sanitizeText = (text: string | undefined) => {
            if (!text) return "";
            // Используем более безопасный способ удаления управляющих символов
            return text.replace(/[\x00-\x1F\x7F-\x9F]/gu, "");
          };

          let photoUrl: string | undefined;
          try {
            if (entity && 'photo' in entity && entity.photo) {
              try {
                // Используем прямые ссылки на аватарки
                if (entity.username) {
                  // Для публичных чатов/каналов/пользователей
                  photoUrl = `https://t.me/${entity.username}/photo`;
                } else if (entity.id) {
                  // Для приватных чатов используем ID
                  const peerType = entity.className?.toLowerCase() || 'user';
                  photoUrl = `tg://peer?id=${entity.id}&type=${peerType}`;
                }

                // Если не удалось получить URL, используем дефолтные иконки
                if (!photoUrl) {
                  photoUrl = chatType === "Private" ? "💬" :
                            chatType === "Group" ? "👥" :
                            chatType === "Channel" ? "📢" :
                            "💬";
                }
              } catch (downloadError) {
                console.warn("Error with photo URL:", downloadError);
                photoUrl = chatType === "Private" ? "💬" :
                          chatType === "Group" ? "👥" :
                          chatType === "Channel" ? "📢" :
                          "💬";
              }
            } else {
              // Если нет фото, используем дефолтные иконки
              photoUrl = chatType === "Private" ? "💬" :
                        chatType === "Group" ? "👥" :
                        chatType === "Channel" ? "📢" :
                        "💬";
            }
          } catch (photoError) {
            console.warn("Error with photo:", photoError);
            photoUrl = chatType === "Private" ? "💬" :
                      chatType === "Group" ? "👥" :
                      chatType === "Channel" ? "📢" :
                      "💬";
          }

          return {
            id: peerId,
            username: entity?.username || "",
            title: sanitizeText(entity?.title || entity?.firstName) || "Unknown Chat",
            type: chatType,
            unreadCount: dialog.unreadCount || 0,
            lastMessage: sanitizeText(dialog.message?.message)?.substring(0, 100) || "",
            description: sanitizeText(entity?.about) || "",
            photoUrl
          };
        })
      );

      setChats(formattedChats);
    } catch (error) {
      console.error("Error loading chats:", error);
      await handleError(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function clearSession() {
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
    setChats([]); // Очищаем список чатов
  }

  async function handleError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Telegram Error:", error);
    
    if (message.includes("AUTH_KEY_UNREGISTERED")) {
      await LocalStorage.removeItem(SESSION_KEY);
      setNeedAuth(true);
    }
    
    await showToast({
      style: Toast.Style.Failure,
      title: "Error",
      message
    });
  }

  async function generateQRCode(url: string) {
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 200,
        margin: 1,
        color: {
          dark: '#ffffff',
          light: '#000000'
        }
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      console.error("Error generating QR code:", err);
    }
  }

  useEffect(() => {
    return () => {
      // Очищаем URL объекты при размонтировании
      chats.forEach(chat => {
        if (chat.photoUrl) {
          URL.revokeObjectURL(chat.photoUrl);
        }
      });
    };
  }, [chats]);

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
            onKeyPress={(event) => {
              if (event.key === 'Enter') {
                const value = event.target.value as string;
                if (value.trim() && passwordResolver) {
                  passwordResolver(value.trim());
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

\`\`\`
${qrCode}
\`\`\`
`}
        actions={
          <ActionPanel>
            <Action
              title="Refresh QR Code"
              icon={Icon.ArrowClockwise}
              onAction={() => initTelegram()}
            />
            <Action
              title="Clear Session"
              icon={Icon.Trash}
              onAction={clearSession}
              style={Action.Style.Destructive}
            />
          </ActionPanel>
        }
      />
    );
  }

  const filteredChats = chats.filter(chat => {
    const searchLower = searchText.toLowerCase();
    return (
      chat.title.toLowerCase().includes(searchLower) ||
      chat.lastMessage?.toLowerCase().includes(searchLower) ||
      chat.description?.toLowerCase().includes(searchLower) ||
      chat.username?.toLowerCase().includes(searchLower) ||
      chat.id.toLowerCase().includes(searchLower)
    );
  });

  function ErrorBoundary({ children }: { children: React.ReactNode }) {
    try {
      return <>{children}</>;
    } catch (error) {
      console.error("Render error:", error);
      return <List.Item title="Display Error" />;
    }
  }

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search Chats..."
    >
      <List.Section title="Chats">
        {filteredChats.map((chat) => (
          <ErrorBoundary key={chat.id}>
            <List.Item
              key={chat.id}
              title={chat.title}
              subtitle={chat.lastMessage}
              accessories={[
                {
                  text: chat.unreadCount ? String(chat.unreadCount) : undefined,
                  icon: chat.unreadCount 
                    ? { source: Icon.Dot, tintColor: Color.Red } 
                    : undefined
                },
                { text: chat.type }
              ]}
              icon={
                chat.type === "Private" ? { source: "💬", tintColor: Color.PrimaryText } :
                chat.type === "Group" ? { source: "👥", tintColor: Color.PrimaryText } :
                chat.type === "Channel" ? { source: "📢", tintColor: Color.PrimaryText } :
                { source: "💬", tintColor: Color.PrimaryText }
              }
              actions={
                <ActionPanel>
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
                  <Action.CopyToClipboard
                    title="Copy Chat ID"
                    content={String(chat.id)}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                </ActionPanel>
              }
            />
          </ErrorBoundary>
        ))}
      </List.Section>
    </List>
  );
}