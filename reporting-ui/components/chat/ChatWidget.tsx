"use client";

// Floating Messenger/Intercom-style chat widget. A launcher button sits in the
// bottom-right corner with an unread badge; clicking it opens a compact popup
// with a conversation list, a thread view, and a composer. It reuses the same
// messaging API + Supabase Realtime as the full /messages page — this is a
// condensed surface over the exact same data, not a separate system.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageCircle,
  X,
  ArrowLeft,
  Send,
  Plus,
  Search,
  Paperclip,
  FileText,
  Loader2,
  Users,
  Maximize2,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";
import { linkify } from "@/components/chat/linkify";
import {
  getConversationsForUser,
  getMessages,
  sendMessage,
  getUnreadCount,
  getMessageUsers,
  getOrCreateDirectConversation,
  uploadAttachment,
  subscribeToConversation,
  subscribeToAllMessages,
  type ConversationSummary,
  type DisplayMessage,
  type MessageUser,
} from "@/lib/api/messages";

function timeLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayNameFor(u: MessageUser): string {
  return (u.analystName?.trim() || u.username).trim();
}

function roleLabel(role: string): string {
  if (role === "analyst") return "Analyst";
  if (role === "admin") return "Admin";
  if (role === "super_admin") return "Super Admin";
  return role;
}

export default function ChatWidget() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // New-message recipient picker.
  const [showNew, setShowNew] = useState(false);
  const [users, setUsers] = useState<MessageUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const activeConversation = conversations.find((c) => c.id === activeId);

  const loadConversations = useCallback(async () => {
    if (userId == null) return;
    try {
      setConversations(await getConversationsForUser(userId));
    } catch (err) {
      console.error(err);
    }
  }, [userId]);

  // Launcher unread badge: refresh on mount + live on any new message. Mirrors
  // the Sidebar badge so the two stay in sync.
  useEffect(() => {
    if (userId == null) return;
    let cancelled = false;
    const refresh = () =>
      getUnreadCount(userId)
        .then((n) => {
          if (!cancelled) setUnread(n);
        })
        .catch(() => {});
    refresh();
    const unsub = subscribeToAllMessages(() => {
      refresh();
      // Keep the inbox previews/order fresh while the panel is open.
      if (!cancelled) loadConversations();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [userId, loadConversations]);

  // Load the conversation list when the panel opens. Deferred via
  // queueMicrotask so the effect only schedules work rather than calling
  // setState synchronously in its body.
  useEffect(() => {
    if (open && userId != null) queueMicrotask(() => loadConversations());
  }, [open, userId, loadConversations]);

  // Open a conversation: load its messages (marks read as a side effect) and
  // clear its unread pill locally.
  const openConversation = useCallback(
    async (id: number) => {
      if (userId == null) return;
      setActiveId(id);
      setLoadingThread(true);
      try {
        setMessages(await getMessages(id, userId));
      } catch (err) {
        console.error(err);
      }
      setLoadingThread(false);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c))
      );
    },
    [userId]
  );

  // Realtime: append new messages to the open thread (dedupe by id).
  useEffect(() => {
    if (activeId == null || userId == null) return;
    const unsub = subscribeToConversation(activeId, (row) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [
          ...prev,
          {
            ...row,
            senderName:
              activeConversation?.members.find(
                (mem) => mem.userId === row.sender_id
              )?.name ?? "User",
            isMine: row.sender_id === userId,
          },
        ];
      });
    });
    return unsub;
  }, [activeId, userId, activeConversation]);

  // Auto-scroll to newest message.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingThread]);

  const handleSend = useCallback(
    async (attachment?: {
      url: string;
      name: string;
      type: "image" | "video" | "document";
    }) => {
      if (activeId == null || userId == null) return;
      const text = composer.trim();
      if (!text && !attachment) return;
      setSending(true);
      try {
        const row = await sendMessage(activeId, userId, text, attachment);
        setMessages((prev) =>
          prev.some((m) => m.id === row.id)
            ? prev
            : [...prev, { ...row, senderName: "You", isMine: true }]
        );
        setComposer("");
        loadConversations();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to send.");
      }
      setSending(false);
    },
    [activeId, userId, composer, loadConversations]
  );

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || activeId == null) return;
    setUploading(true);
    try {
      const attachment = await uploadAttachment(activeId, file);
      await handleSend(attachment);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to upload file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function openPicker() {
    setShowNew(true);
    setUserSearch("");
    if (users.length === 0) {
      try {
        setUsers(await getMessageUsers());
      } catch (err) {
        console.error(err);
      }
    }
  }

  async function startDirect(targetUserId: number) {
    if (userId == null) return;
    setCreating(true);
    try {
      const id = await getOrCreateDirectConversation(userId, targetUserId);
      setShowNew(false);
      await loadConversations();
      openConversation(id);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to start conversation."
      );
    }
    setCreating(false);
  }

  // Who the current user can message. Analysts may only message admins/super
  // admins (dispute feedback); admins can message anyone. Mirrors /messages.
  const directory = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users
      .filter((u) => {
        if (u.id === userId) return false;
        return isAdmin || u.role === "admin" || u.role === "super_admin";
      })
      .filter((u) => {
        if (!q) return true;
        return (
          (u.analystName ?? "").toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q)
        );
      });
  }, [users, userSearch, userId, isAdmin]);

  // Don't render anything until we have a logged-in user.
  if (userId == null) return null;

  return (
    <>
      {/* Launcher button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open chat"
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg shadow-sky-600/30 transition hover:bg-sky-700"
        >
          <MessageCircle size={26} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 flex h-[560px] max-h-[calc(100vh-3rem)] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex shrink-0 items-center gap-2 bg-sky-600 px-4 py-3 text-white">
            {activeId != null ? (
              <button
                onClick={() => setActiveId(null)}
                className="rounded-lg p-1 transition hover:bg-white/15"
                aria-label="Back to chats"
              >
                <ArrowLeft size={18} />
              </button>
            ) : (
              <MessageCircle size={20} />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {activeConversation
                  ? activeConversation.displayName
                  : "Messages"}
              </p>
              {!activeConversation && (
                <p className="text-[11px] text-sky-100">
                  Chat with {isAdmin ? "analysts and admins" : "admins"}
                </p>
              )}
              {activeConversation?.type === "group" && (
                <p className="text-[11px] text-sky-100">
                  {activeConversation.members.length} members
                </p>
              )}
            </div>
            <Link
              href="/messages"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 transition hover:bg-white/15"
              title="Open full messages page"
              aria-label="Open full messages page"
            >
              <Maximize2 size={16} />
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 transition hover:bg-white/15"
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          {activeId == null ? (
            // Conversation list
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Chats
                </span>
                <button
                  onClick={openPicker}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-sky-600 transition hover:bg-sky-50"
                >
                  <Plus size={14} /> New
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-400">
                    No conversations yet.
                    <br />
                    Start one with the New button.
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => openConversation(conv.id)}
                      className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-slate-50"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${
                          conv.type === "group" ? "bg-indigo-600" : "bg-sky-600"
                        }`}
                      >
                        {conv.type === "group" ? (
                          <Users size={16} />
                        ) : (
                          conv.displayName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {conv.displayName}
                          </p>
                          {conv.unread > 0 && (
                            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                              {conv.unread}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-slate-500">
                          {conv.disputeId != null && (
                            <span className="mr-1 text-amber-600">🚩</span>
                          )}
                          {conv.lastMessage
                            ? conv.lastMessage.content ||
                              (conv.lastMessage.attachmentName
                                ? `📎 ${conv.lastMessage.attachmentName}`
                                : "Attachment")
                            : "No messages yet"}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            // Thread
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-slate-50 p-3">
                {loadingThread ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    Loading…
                  </p>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    No messages yet. Say hello!
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${
                        m.isMine ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${
                          m.isMine
                            ? "bg-sky-600 text-white"
                            : "bg-white text-slate-900 shadow-sm"
                        }`}
                      >
                        {!m.isMine &&
                          activeConversation?.type === "group" && (
                            <p className="mb-1 text-xs font-semibold text-indigo-600">
                              {m.senderName}
                            </p>
                          )}
                        {m.attachment_url && (
                          <div className="mb-1.5">
                            {m.attachment_type === "image" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={m.attachment_url}
                                alt={m.attachment_name || ""}
                                className="max-h-52 w-full max-w-[200px] rounded-lg object-cover"
                              />
                            ) : m.attachment_type === "video" ? (
                              <video
                                src={m.attachment_url}
                                controls
                                className="max-h-52 w-full max-w-[220px] rounded-lg"
                              />
                            ) : (
                              <a
                                href={m.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                                  m.isMine ? "bg-white/20" : "bg-slate-100"
                                }`}
                              >
                                <FileText size={16} />
                                {m.attachment_name || "Download file"}
                              </a>
                            )}
                          </div>
                        )}
                        {m.content && (
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {linkify(m.content)}
                          </p>
                        )}
                        <p
                          className={`mt-0.5 text-[10px] ${
                            m.isMine ? "text-white/70" : "text-slate-400"
                          }`}
                        >
                          {timeLabel(m.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={threadEndRef} />
              </div>

              {/* Composer */}
              <div className="shrink-0 border-t border-slate-200 p-2.5">
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || sending}
                    className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                    title="Attach a file"
                  >
                    {uploading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Paperclip size={18} />
                    )}
                  </button>
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={1}
                    placeholder="Type a message…"
                    className="max-h-24 flex-1 resize-none rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={sending || uploading || !composer.trim()}
                    className="rounded-xl bg-sky-600 p-2 text-white transition hover:bg-sky-700 disabled:opacity-50"
                    aria-label="Send"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* New-message recipient picker (overlays the panel) */}
          {showNew && (
            <div className="absolute inset-0 z-10 flex flex-col bg-white">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">
                  {isAdmin ? "New message" : "Message an admin"}
                </p>
                <button
                  onClick={() => setShowNew(false)}
                  className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100"
                  aria-label="Close picker"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="shrink-0 border-b border-slate-200 p-3">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search people…"
                    className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {directory.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-slate-400">
                    No people found.
                  </p>
                ) : (
                  directory.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => startDirect(u.id)}
                      disabled={creating}
                      className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                        {displayNameFor(u).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {displayNameFor(u)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {roleLabel(u.role)}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
