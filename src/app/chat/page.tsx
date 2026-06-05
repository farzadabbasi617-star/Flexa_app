"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface Message {
  id: string;
  senderId: string;
  receiverId: string | null;
  message: string;
  createdAt: string;
}

interface User {
  id: string;
  username: string;
  displayName: string;
}

export default function ChatPage() {
  const { t, lang } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [loadingChat, setLoadingChat] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser.id);
      const interval = setInterval(() => fetchMessages(selectedUser.id), 5000);
      return () => clearInterval(interval);
    }
  }, [selectedUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function fetchUsers() {
    try {
      const res = await fetch("/api/players");
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsers(
          data.map((p: { id: string; username: string; displayName: string }) => ({
            id: p.id,
            username: p.username,
            displayName: p.displayName,
          }))
        );
      }
    } catch {
      // handle error
    }
    setLoadingChat(false);
  }

  async function fetchMessages(recipientId: string) {
    try {
      const res = await fetch(`/api/chat?recipientId=${recipientId}`);
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      // handle error
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser) return;

    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: selectedUser.id,
          message: newMessage,
        }),
      });
      setNewMessage("");
      fetchMessages(selectedUser.id);
    } catch {
      // handle error
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="text-4xl animate-neon-pulse">💬</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6">
          💬 <span className="neon-text-blue">{t.chat.title}</span>
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[600px]">
          {/* Users List */}
          <div className="gaming-card p-4 overflow-y-auto">
            <h3 className="font-bold text-neon-purple mb-3">
              {lang === "fa" ? "کاربران" : "Users"}
            </h3>
            {loadingChat ? (
              <p className="text-gray-500 text-sm">{lang === "fa" ? "در حال بارگذاری..." : "Loading..."}</p>
            ) : (
              <div className="space-y-2">
                {users
                  .filter((u) => u.username !== user.username)
                  .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      className={`w-full text-start p-3 rounded-lg transition-all ${
                        selectedUser?.id === u.id
                          ? "bg-neon-purple/20 border border-neon-purple/50"
                          : "bg-dark-700 hover:bg-dark-600"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center text-xs font-bold">
                          {u.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{u.displayName}</div>
                          <div className="text-xs text-gray-500">@{u.username}</div>
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Chat Area */}
          <div className="md:col-span-3 gaming-card flex flex-col">
            {!selectedUser ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-5xl mb-4">💬</div>
                  <p className="text-gray-400">
                    {lang === "fa"
                      ? "یک کاربر را برای شروع چت انتخاب کنید"
                      : "Select a user to start chatting"}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-gaming-border flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center font-bold">
                    {selectedUser.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold">{selectedUser.displayName}</div>
                    <div className="text-xs text-gray-500">@{selectedUser.username}</div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3">
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      {t.chat.noMessages}
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.senderId === user.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                              isMe
                                ? "bg-neon-purple/30 text-white rounded-br-md"
                                : "bg-dark-600 text-gray-200 rounded-bl-md"
                            }`}
                          >
                            <p className="text-sm">{msg.message}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(msg.createdAt).toLocaleTimeString(
                                lang === "fa" ? "fa-IR" : "en-US",
                                { hour: "2-digit", minute: "2-digit" }
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={sendMessage} className="p-4 border-t border-gaming-border flex gap-2">
                  <input
                    type="text"
                    className="gaming-input flex-1"
                    placeholder={t.chat.typeMessage}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                  />
                  <button type="submit" className="gaming-btn px-6">
                    {t.chat.send}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
