// src/components/ChatMessages.tsx

import { ActionPanel, Action, List, Icon, Color } from "@raycast/api";
import { useEffect, useState, useCallback } from "react";
import { TelegramClient } from "telegram";
import { Chat } from "../types";
import { sanitizeText } from "../utils/telegramUtils";

interface Message {
  date: number;
  message: string;
  out: boolean;
  sender?: {
    firstName?: string;
  };
}

interface ChatMessagesProps {
  chat: Chat;
  onClose: () => void;
  client: TelegramClient | null;
  handleError: (error: unknown) => Promise<void>;
}

export function ChatMessages({ chat, onClose, client, handleError }: ChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadMessages = useCallback(async () => {
    try {
      if (!client) throw new Error("Client not initialized");
      setIsLoading(true);
      
      const result = await client.getMessages(chat.id, {
        limit: 30
      });
      
      const sanitizedMessages = (result as Message[]).map(msg => ({
        ...msg,
        message: sanitizeText(msg.message),
        sender: msg.sender ? {
          firstName: sanitizeText(msg.sender.firstName)
        } : undefined
      }));
      
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
      navigationTitle={chat.title}
      enableFiltering={false}
      throttle={false}
    >
      <List.Section title={chat.title}>
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
            subtitle={msg.message}
            accessories={[{ 
              text: new Date(msg.date * 1000).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })
            }]}
            icon={{ 
              source: Icon.Message,
              tintColor: msg.out ? Color.Blue : Color.Green 
            }}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard
                  title="Copy Message"
                  content={msg.message}
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