// src/openChat.tsx

import {
    ActionPanel,
    Action,
    Form,
    showToast,
    Toast,
    List,
    Icon,
    Color,
    LocalStorage,
    useNavigation,
    Detail
  } from "@raycast/api";
  import { useEffect, useState, useCallback } from "react";
  import { TelegramClient } from "telegram";
  import { StringSession } from "telegram/sessions";
  import { SESSION_KEY, Chat, ChatType } from "./types";
  import { getTelegramConfig } from "./config";
  import { sanitizeText } from "./utils/telegramUtils";
  import QRCode from 'qrcode';
  
  // Константы
  const MAX_RETRY_ATTEMPTS = 3;
  const AUTH_TIMEOUT_MS = 180000; // 3 минуты
  const AUTH_CHECK_INTERVAL_MS = 1000; // 1 секунда
  const RECENT_CHATS_KEY = "telegram-recent-chats"; // Ключ для хранения недавних чатов
  const LAST_CHAT_KEY = "telegram-last-chat"; // Ключ для хранения последнего открытого чата
  const MAX_RECENT_CHATS = 15; // Максимальное количество недавних чатов для хранения
  
  // Интерфейс для недавнего чата
  interface RecentChat {
    id: string;
    title: string;
    type: string;
    lastUsed: number;
  }
  
  // Добавляем типы для сущностей Telegram
  interface TelegramEntity {
    id?: number | bigint;
    className?: string;
    megagroup?: boolean;
    title?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
  }
  
  /**
   * Компонент для отображения и взаимодействия с сообщениями чата
   */
  function ChatMessages({ chatIdentifier, onClose, client, handleError, updateRecentChatInfo }: {
    chatIdentifier: string;
    onClose: () => void;
    client: TelegramClient | null;
    handleError: (error: unknown) => Promise<string>;
    updateRecentChatInfo: (id: string, title: string, type: string) => Promise<void>;
  }) {
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [chatInfo, setChatInfo] = useState<{
      id: string;
      title: string;
      type: ChatType;
    } | null>(null);
  
    // Попытка определить, является ли chatIdentifier именем пользователя или ID
    const isUsername = !chatIdentifier.match(/^-?\d+$/);
  
    // Функция для загрузки информации о чате
    const loadChatInfo = useCallback(async () => {
      try {
        if (!client) throw new Error("Клиент не инициализирован");
        setIsLoading(true);
        
        let entity: TelegramEntity;
        let chatId = chatIdentifier;
        
        // Если это имя пользователя, сначала получаем информацию о пользователе
        if (isUsername) {
          try {
            const username = chatIdentifier.startsWith('@') 
              ? chatIdentifier.substring(1) 
              : chatIdentifier;
            
            // Получаем информацию о сущности по имени пользователя и преобразуем в нужный тип
            const rawEntity = await client.getEntity(username);
            entity = {
              id: rawEntity.id ? Number(rawEntity.id) : undefined,
              className: rawEntity.className,
              megagroup: 'megagroup' in rawEntity ? rawEntity.megagroup : undefined,
              title: 'title' in rawEntity ? rawEntity.title : undefined,
              firstName: 'firstName' in rawEntity ? rawEntity.firstName : undefined,
              lastName: 'lastName' in rawEntity ? rawEntity.lastName : undefined,
              username: 'username' in rawEntity ? rawEntity.username : undefined
            };
            
            if (entity) {
              // Определяем тип чата и формируем правильный ID
              let type: ChatType = "Private";
              let peerId = entity.id ? entity.id.toString() : "";
              
              if (entity.className === "Channel") {
                type = entity.megagroup ? "Group" : "Channel";
                peerId = `-100${peerId}`;
              } else if (entity.className === "Chat") {
                type = "Group";
                peerId = `-${peerId}`;
              }
              
              const title = sanitizeText(entity.title || entity.firstName || username);
              
              setChatInfo({
                id: peerId,
                title: title,
                type: type
              });
              
              // Обновляем информацию о недавнем чате
              await updateRecentChatInfo(peerId, title, type);
              
              // Сохраняем последний открытый чат
              await LocalStorage.setItem(LAST_CHAT_KEY, peerId);
              
              chatId = peerId;
            }
          } catch (error) {
            console.error("Ошибка при получении сущности по имени:", error);
            throw new Error(`Не удалось найти чат с именем: ${chatIdentifier}`);
          }
        } else {
          // Если это числовой ID, пытаемся получить информацию о чате
          try {
            const rawEntity = await client.getEntity(chatIdentifier);
            entity = {
              id: rawEntity.id ? Number(rawEntity.id) : undefined,
              className: rawEntity.className,
              megagroup: 'megagroup' in rawEntity ? rawEntity.megagroup : undefined,
              title: 'title' in rawEntity ? rawEntity.title : undefined,
              firstName: 'firstName' in rawEntity ? rawEntity.firstName : undefined,
              lastName: 'lastName' in rawEntity ? rawEntity.lastName : undefined,
              username: 'username' in rawEntity ? rawEntity.username : undefined
            };
            
            if (entity) {
              let type: ChatType = "Private";
              
              if (chatIdentifier.startsWith('-100')) {
                type = entity.megagroup ? "Group" : "Channel";
              } else if (chatIdentifier.startsWith('-')) {
                type = "Group";
              }
              
              const title = sanitizeText(entity.title || entity.firstName || "Чат");
              
              setChatInfo({
                id: chatIdentifier,
                title: title,
                type: type
              });
              
              // Обновляем информацию о недавнем чате
              await updateRecentChatInfo(chatIdentifier, title, type);
              
              // Сохраняем последний открытый чат
              await LocalStorage.setItem(LAST_CHAT_KEY, chatIdentifier);
            }
          } catch (error) {
            console.error("Ошибка при получении сущности по ID:", error);
            // Пробуем продолжить, используя ID как есть
            const defaultTitle = "Чат " + chatIdentifier;
            const defaultType = chatIdentifier.startsWith('-100') ? "Channel" : 
                                chatIdentifier.startsWith('-') ? "Group" : "Private";
            
            setChatInfo({
              id: chatIdentifier,
              title: defaultTitle,
              type: defaultType
            });
            
            // Обновляем информацию о недавнем чате
            await updateRecentChatInfo(chatIdentifier, defaultTitle, defaultType);
            
            // Сохраняем последний открытый чат
            await LocalStorage.setItem(LAST_CHAT_KEY, chatIdentifier);
          }
        }
        
        // Загружаем сообщения
        const result = await client.getMessages(chatId, {
          limit: 30
        });
        
        if (Array.isArray(result)) {
          const sanitizedMessages = result.map(msg => {
            try {
              return {
                date: msg.date || 0,
                message: sanitizeText(msg.message) || "",
                out: Boolean(msg.out),
                sender: msg.sender && 'firstName' in msg.sender ? {
                  firstName: sanitizeText(msg.sender.firstName) || "Неизвестный"
                } : undefined
              };
            } catch (e) {
              console.error("Ошибка обработки сообщения:", e);
              return {
                date: 0,
                message: "Ошибка обработки сообщения",
                out: false
              };
            }
          });
          
          setMessages(sanitizedMessages);
        } else {
          throw new Error("Не удалось загрузить сообщения");
        }
      } catch (error) {
        console.error("Ошибка загрузки чата:", error);
        await handleError(error);
      } finally {
        setIsLoading(false);
      }
    }, [client, chatIdentifier, isUsername, handleError, updateRecentChatInfo]);
  
    const handleSendMessage = useCallback(async () => {
      if (!newMessage.trim() || !client || !chatInfo) return;
      
      try {
        await client.sendMessage(chatInfo.id, { message: sanitizeText(newMessage) });
        setNewMessage("");
        await loadChatInfo(); // Перезагружаем сообщения после отправки
      } catch (error) {
        console.error("Ошибка отправки сообщения:", error);
        await handleError(error);
      }
    }, [client, chatInfo, newMessage, loadChatInfo, handleError]);
  
    useEffect(() => {
      loadChatInfo();
    }, [loadChatInfo]);
  
    return (
      <List
        isLoading={isLoading}
        searchBarPlaceholder="Напишите сообщение..."
        onSearchTextChange={setNewMessage}
        searchText={newMessage}
        navigationTitle={chatInfo?.title || "Чат"}
        enableFiltering={false}
        throttle={false}
      >
        <List.Section title={chatInfo?.title || "Чат"}>
          <List.Item
            title="Новое сообщение"
            subtitle={newMessage}
            icon={Icon.Message}
            actions={
              <ActionPanel>
                <Action
                  title="Отправить"
                  icon={Icon.Message}
                  onAction={handleSendMessage}
                  shortcut={{ modifiers: [], key: "return" }}
                />
                <Action
                  title="Вернуться к списку чатов"
                  icon={Icon.ArrowLeft}
                  onAction={onClose}
                  shortcut={{ modifiers: ["cmd"], key: "x" }}
                />
                <Action
                  title="Обновить"
                  icon={Icon.ArrowClockwise}
                  onAction={loadChatInfo}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                />
              </ActionPanel>
            }
          />
          {messages.map((msg, index) => (
            <List.Item
              key={index}
              title={msg.out ? "Вы" : (msg.sender?.firstName || "Неизвестный")}
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
                    title="Копировать сообщение"
                    content={msg.message || ""}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                  <Action
                    title="Вернуться к списку чатов"
                    icon={Icon.ArrowLeft}
                    onAction={onClose}
                    shortcut={{ modifiers: ["cmd"], key: "x" }}
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
   * Генерация QR-кода для аутентификации
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
      console.error("Ошибка генерации QR-кода:", err);
      return "";
    }
  }
  
  /**
   * Загрузка списка недавних чатов
   */
  async function loadRecentChats(): Promise<RecentChat[]> {
    try {
      const storedChats = await LocalStorage.getItem<string>(RECENT_CHATS_KEY);
      if (storedChats) {
        return JSON.parse(storedChats);
      }
    } catch (error) {
      console.error("Ошибка загрузки недавних чатов:", error);
    }
    return [];
  }
  
  /**
   * Добавление или обновление недавнего чата
   */
  async function updateRecentChat(id: string, title: string, type: string): Promise<void> {
    try {
      // Загружаем текущий список
      const recentChats = await loadRecentChats();
      
      // Ищем, существует ли уже такой чат
      const existingIndex = recentChats.findIndex(chat => chat.id === id);
      
      // Текущее время в миллисекундах
      const now = Date.now();
      
      if (existingIndex !== -1) {
        // Если чат уже существует, обновляем его
        recentChats[existingIndex] = {
          ...recentChats[existingIndex],
          title, // Обновляем название, так как оно могло измениться
          type, // Обновляем тип
          lastUsed: now
        };
      } else {
        // Если чата нет, добавляем его
        recentChats.push({
          id,
          title,
          type,
          lastUsed: now
        });
      }
      
      // Сортируем по времени последнего использования (от новых к старым)
      recentChats.sort((a, b) => b.lastUsed - a.lastUsed);
      
      // Ограничиваем список до максимального размера
      const trimmedChats = recentChats.slice(0, MAX_RECENT_CHATS);
      
      // Сохраняем обновленный список
      await LocalStorage.setItem(RECENT_CHATS_KEY, JSON.stringify(trimmedChats));
    } catch (error) {
      console.error("Ошибка обновления недавних чатов:", error);
    }
  }
  
  export default function Command() {
    const { push, pop } = useNavigation();
    const [isLoading, setIsLoading] = useState(true);
    const [client, setClient] = useState<TelegramClient | null>(null);
    const [needAuth, setNeedAuth] = useState(false);
    const [qrCode, setQrCode] = useState("");
    const [qrDataUrl, setQrDataUrl] = useState("");
    const [needPassword, setNeedPassword] = useState(false);
    const [passwordResolver, setPasswordResolver] = useState<((value: string) => void) | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedChatIdentifier, setSelectedChatIdentifier] = useState<string | null>(null);
    const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [isFirstLoading, setIsFirstLoading] = useState(true); // Флаг первой загрузки
    
    /**
     * Обработка ошибок
     */
    const handleError = useCallback(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Ошибка Telegram:", error);
      
      if (message.includes("AUTH_KEY_UNREGISTERED")) {
        await LocalStorage.removeItem(SESSION_KEY);
        setNeedAuth(true);
      }
      
      await showToast({
        style: Toast.Style.Failure,
        title: "Ошибка",
        message: message.substring(0, 100) // Ограничиваем длину для UI
      });
      
      setError(message);
      return message;
    }, []);
  
    /**
     * Очистка текущей сессии
     */
    const clearSession = useCallback(async () => {
      try {
        console.log("Очистка сессии...");
        if (client) {
          try {
            await client.disconnect();
          } catch (error) {
            console.warn("Ошибка при отключении клиента:", error);
          }
        }
        await LocalStorage.removeItem(SESSION_KEY);
        setClient(null);
        setNeedAuth(true);
      } catch (e) {
        console.error("Ошибка при очистке сессии:", e);
      }
    }, [client]);
  
    /**
     * Загрузка недавних чатов
     */
    const fetchRecentChats = useCallback(async () => {
      const chats = await loadRecentChats();
      setRecentChats(chats);
    }, []);
  
    /**
     * Обновление информации о чате в недавних
     */
    const updateRecentChatInfo = useCallback(async (id: string, title: string, type: string) => {
      await updateRecentChat(id, title, type);
      await fetchRecentChats();
    }, [fetchRecentChats]);
  
    /**
     * Аутентификация с QR-кодом
     */
    const handleQRAuth = useCallback(async (telegramClient: TelegramClient, config: { apiId: number, apiHash: string }) => {
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Таймаут авторизации"));
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
                  console.error("Ошибка генерации QR-кода:", error);
                }
              },
              onError: async (error: Error) => {
                console.log("Ошибка QR-аутентификации:", error.message);
                if (error.message.includes("2FA")) {
                  setNeedPassword(true);
                  return false;
                }
                reject(error);
                return true;
              },
              password: async () => {
                console.log("Telegram запрашивает пароль");
                setNeedPassword(true);
  
                try {
                  passwordPromise = new Promise<string>((resolvePassword) => {
                    setPasswordResolver(() => (password: string) => {
                      console.log("Получен пароль из формы, длина:", password.length);
                      resolvePassword(password);
                    });
                  });
  
                  const password = await passwordPromise;
                  console.log("Возвращаем пароль в Telegram");
                  return password;
                } catch (error) {
                  console.error("Ошибка пароля:", error);
                  reject(error);
                  throw error;
                }
              }
            }
          );
  
          // Периодически проверяем статус авторизации
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
              console.warn("Ошибка проверки авторизации:", error);
            }
          }, AUTH_CHECK_INTERVAL_MS);
        });
  
      } catch (error) {
        console.error("Ошибка QR-аутентификации:", error);
        if (error instanceof Error) {
          if (error.message.includes("AUTH_TOKEN_EXPIRED")) {
            await clearSession();
            initTelegram().catch(e => handleError(e));
          } else {
            await handleError(error);
          }
        }
      }
    }, [clearSession, handleError]);
  
    /**
     * Открытие последнего чата 
     */
    const openLastChat = useCallback(async () => {
      try {
        const lastChatId = await LocalStorage.getItem<string>(LAST_CHAT_KEY);
        if (lastChatId) {
          console.log("Открываем последний чат:", lastChatId);
          setSelectedChatIdentifier(lastChatId);
          return true;
        }
        return false;
      } catch (error) {
        console.error("Ошибка при загрузке последнего чата:", error);
        return false;
      }
    }, []);
  
    /**
     * Инициализация клиента Telegram
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
            // После успешной авторизации сразу пробуем открыть последний чат
            if (await newClient.isUserAuthorized()) {
              setNeedAuth(false);
              await fetchRecentChats();
              await openLastChat();
            }
          } else {
            setNeedAuth(false);
            await fetchRecentChats();
            // Сразу открываем последний чат
            await openLastChat();
          }
        } catch (connectionError) {
          if (retryAttempt < MAX_RETRY_ATTEMPTS) {
            console.log(`Попытка переподключения ${retryAttempt + 1}/${MAX_RETRY_ATTEMPTS}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            await initTelegram(retryAttempt + 1);
          } else {
            throw connectionError;
          }
        } finally {
          setIsFirstLoading(false);
        }
      } catch (error) {
        await handleError(error);
        setIsFirstLoading(false);
      } finally {
        setIsLoading(false);
      }
    }, [handleQRAuth, handleError, fetchRecentChats, openLastChat]);
  
    // Инициализация при монтировании компонента
    useEffect(() => {
      initTelegram().catch(e => handleError(e));
    }, []);
  
    // Переключение на форму открытия нового чата
    const handleOpenNewChat = useCallback(() => {
      setShowForm(true);
    }, []);
  
    // Переключение на список чатов
    const handleShowChatList = useCallback(() => {
      setSelectedChatIdentifier(null); // Закрываем текущий чат, если он открыт
    }, []);
  
    // При фатальных ошибках
    if (error && !needAuth && !selectedChatIdentifier) {
      return (
        <Detail
          isLoading={isLoading}
          markdown={`# Ошибка соединения с Telegram\n\n${error}\n\nПожалуйста, попробуйте снова.`}
          actions={
            <ActionPanel>
              <Action 
                title="Попробовать снова" 
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
  
    // Отображение выбранного чата (активный чат или авторизация имеют приоритет)
    if (selectedChatIdentifier && client) {
      return (
        <ChatMessages 
          chatIdentifier={selectedChatIdentifier} 
          onClose={handleShowChatList}
          client={client}
          handleError={handleError}
          updateRecentChatInfo={updateRecentChatInfo}
        />
      );
    }
  
    // Отображение формы аутентификации
    if (needAuth) {
      if (needPassword) {
        return (
          <Form
            actions={
              <ActionPanel>
                <Action.SubmitForm
                  title="Отправить пароль"
                  onSubmit={async (values) => {
                    try {
                      console.log("Отправка пароля 2FA...");
                      const password = values.password.trim();
                      if (!password) {
                        await showToast({
                          style: Toast.Style.Failure,
                          title: "Ошибка",
                          message: "Пароль не может быть пустым"
                        });
                        return;
                      }
                      if (passwordResolver) {
                        passwordResolver(password);
                        setPasswordResolver(null);
                      }
                    } catch (e) {
                      console.error("Ошибка отправки пароля:", e);
                      await handleError(e);
                    }
                  }}
                />
              </ActionPanel>
            }
          >
            <Form.Description text="Пожалуйста, введите ваш пароль 2FA для завершения авторизации." />
            <Form.PasswordField
              id="password"
              title="Пароль 2FA"
              placeholder="Введите ваш пароль 2FA"
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
  # Авторизация в Telegram
  
  Отсканируйте QR-код для входа:
  
  ${qrDataUrl ? `![QR Code](${qrDataUrl})` : 'Генерация QR-кода...'}
  
  1. Откройте Telegram на вашем телефоне
  2. Перейдите в Настройки → Устройства
  3. Нажмите "Подключить устройство"
  4. Отсканируйте QR-код выше
  `}
        />
      );
    }
  
    // Форма для открытия нового чата
    if (showForm) {
      return (
        <Form
          isLoading={isLoading}
          actions={
            <ActionPanel>
              <Action.SubmitForm
                title="Открыть чат"
                onSubmit={async (values) => {
                  try {
                    const chatIdentifier = values.chatIdentifier.trim();
                    if (!chatIdentifier) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: "Ошибка",
                        message: "Пожалуйста, укажите ID чата или имя пользователя"
                      });
                      return;
                    }
                    
                    setShowForm(false);
                    setSelectedChatIdentifier(chatIdentifier);
                    
                  } catch (error) {
                    await handleError(error);
                  }
                }}
              />
              <Action
                title="Назад"
                icon={Icon.ArrowLeft}
                shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                onAction={handleShowChatList}
              />
            </ActionPanel>
          }
        >
          <Form.Description text="Введите ID чата или имя пользователя для открытия в Raycast" />
          <Form.TextField
            id="chatIdentifier"
            title="ID чата или имя пользователя"
            placeholder="Например: -100123456789, @username или username"
            info="Для каналов используйте формат -100ID, для групп -ID, для пользователей ID или имя пользователя"
            autoFocus
          />
        </Form>
      );
    }
  
    // Если идет первичная загрузка, показываем экран загрузки
    if (isFirstLoading) {
      return (
        <Detail
          isLoading={true}
          markdown="Загрузка последнего чата..."
          actions={
            <ActionPanel>
              <Action
                title="Открыть новый чат"
                icon={Icon.Plus}
                onAction={handleOpenNewChat}
              />
            </ActionPanel>
          }
        />
      );
    }
  
    // Если все остальные условия не выполнены, показываем список чатов
    return (
      <List
        isLoading={isLoading}
        navigationTitle="Telegram чаты"
        searchBarPlaceholder="Поиск по недавним чатам..."
      >
        <List.Section title="Недавние чаты">
          {recentChats.length === 0 ? (
            <List.Item
              title="Нет недавних чатов"
              icon={Icon.Info}
              actions={
                <ActionPanel>
                  <Action
                    title="Открыть новый чат"
                    icon={Icon.Plus}
                    onAction={handleOpenNewChat}
                  />
                  <Action
                    title="Обновить"
                    icon={Icon.ArrowClockwise}
                    onAction={fetchRecentChats}
                  />
                </ActionPanel>
              }
            />
          ) : (
            <>
              <List.Item
                title="Открыть новый чат"
                icon={Icon.Plus}
                actions={
                  <ActionPanel>
                    <Action
                      title="Открыть новый чат"
                      icon={Icon.Plus}
                      onAction={handleOpenNewChat}
                    />
                  </ActionPanel>
                }
              />
              {recentChats.map(chat => (
                <List.Item
                  key={chat.id}
                  title={chat.title}
                  subtitle={chat.id}
                  accessories={[{ 
                    text: new Date(chat.lastUsed).toLocaleDateString() 
                  }]}
                  icon={
                    chat.type === "Private" ? { source: Icon.PersonCircle, tintColor: Color.Blue } :
                    chat.type === "Group" ? { source: Icon.TwoPeople, tintColor: Color.Green } :
                    chat.type === "Channel" ? { source: Icon.Megaphone, tintColor: Color.Orange } :
                    Icon.Message
                  }
                  actions={
                    <ActionPanel>
                      <Action
                        title="Открыть чат"
                        icon={Icon.Message}
                        onAction={() => setSelectedChatIdentifier(chat.id)}
                      />
                      <Action.CopyToClipboard
                        title="Копировать ID чата"
                        content={chat.id}
                        shortcut={{ modifiers: ["cmd"], key: "c" }}
                      />
                      <Action
                        title="Удалить из недавних"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["cmd"], key: "d" }}
                        onAction={async () => {
                          const updatedChats = recentChats.filter(c => c.id !== chat.id);
                          await LocalStorage.setItem(RECENT_CHATS_KEY, JSON.stringify(updatedChats));
                          setRecentChats(updatedChats);
                          
                          // Если удаляем последний открытый чат, очищаем его
                          const lastChatId = await LocalStorage.getItem<string>(LAST_CHAT_KEY);
                          if (lastChatId === chat.id) {
                            await LocalStorage.removeItem(LAST_CHAT_KEY);
                          }
                          
                          await showToast({
                            style: Toast.Style.Success,
                            title: "Чат удален из списка недавних"
                          });
                        }}
                      />
                    </ActionPanel>
                  }
                />
              ))}
            </>
          )}
        </List.Section>
      </List>
    );
  }