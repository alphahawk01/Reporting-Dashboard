"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Send,
  Plus,
  X,
  Search,
  MessageSquare,
  ArrowLeft,
  Paperclip,
  FileText,
  Loader2,
  Users,
  Check,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";
import { linkify } from "@/components/chat/linkify";
import {
  getConversationsForUser,
  getMessages,
  sendMessage,
  uploadAttachment,
  getOrCreateDirectConversation,
  createGroupConversation,
  getMessageUsers,
  subscribeToConversation,
  type ConversationSummary,
  type DisplayMessage,
  type MessageUser,
} from "@/lib/api/messages";

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesInner />
    </Suspense>
  );
}

function MessagesInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const userId = user?.id ?? null;
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);

  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recipient picker (new direct message).
  const [showNew, setShowNew] = useState(false);
  const [users, setUsers] = useState<MessageUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [creating, setCreating] = useState(false);

  // New group modal (admin only).
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembers, setGroupMembers] = useState<Set<number>>(new Set());

  const threadEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeId);

  const loadConversations = useCallback(async () => {
    if (userId == null) return;
    try {
      const list = await getConversationsForUser(userId);
      setConversations(list);
    } catch (err) {
      console.error(err);
    }
  }, [userId]);

  // Open a conversation: load its messages, mark read locally.
  const openConversation = useCallback(
    async (id: number) => {
      if (userId == null) return;
      setActiveId(id);
      setLoadingThread(true);
      try {
        const msgs = await getMessages(id, userId);
        setMessages(msgs);
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

  // Initial load.
  useEffect(() => {
    if (userId == null) return;
    let cancelled = false;
    (async () => {
      await loadConversations();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, loadConversations]);

  // Deep-link: ?c=<conversationId> opens that thread once conversations load
  // (used by the "Message" action on the Disputes page).
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || loading) return;
    const c = searchParams.get("c");
    if (c) {
      const id = Number(c);
      if (!Number.isNaN(id)) {
        deepLinked.current = true;
        // Defer so the effect only schedules work rather than calling setState
        // synchronously in its body.
        queueMicrotask(() => openConversation(id));
      }
    }
  }, [loading, searchParams, openConversation]);

  // Realtime: append new messages to the open thread.
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
      // Refresh the inbox previews/order.
      loadConversations();
    });
    return unsub;
  }, [activeId, userId, activeConversation, loadConversations]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(attachment?: {
    url: string;
    name: string;
    type: "image" | "video" | "document";
  }) {
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
  }

  async function handleFileUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
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
      alert(err instanceof Error ? err.message : "Failed to start conversation.");
    }
    setCreating(false);
  }

  async function openGroupPicker() {
    setShowNewGroup(true);
    setUserSearch("");
    setGroupTitle("");
    setGroupMembers(new Set());
    if (users.length === 0) {
      try {
        setUsers(await getMessageUsers());
      } catch (err) {
        console.error(err);
      }
    }
  }

  function toggleGroupMember(id: number) {
    setGroupMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createGroup() {
    if (userId == null) return;
    if (!groupTitle.trim() || groupMembers.size === 0) return;
    setCreating(true);
    try {
      const id = await createGroupConversation(
        userId,
        groupTitle,
        Array.from(groupMembers)
      );
      setShowNewGroup(false);
      await loadConversations();
      openConversation(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create group.");
    }
    setCreating(false);
  }

  // Who the current user can start a conversation with. Analysts message
  // admins/super-admins only (dispute feedback); admins can message anyone.
  const directory = users.filter((u) => {
    if (u.id === userId) return false;
    if (isAdmin) return true;
    return u.role === "admin" || u.role === "super_admin";
  });
  const matchesSearch = (u: MessageUser) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.analystName ?? "").toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q)
    );
  };
  const filteredDirectory = directory.filter(matchesSearch);
  // Group membership: admins can add anyone (any role) except themselves.
  const groupCandidates = users.filter(
    (u) => u.id !== userId && matchesSearch(u)
  );

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

  if (loading) {
    return (
      <div className="p-8 text-slate-500">Loading messages…</div>
    );
  }

  return (
    <div className="min-h-full bg-slate-100 p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
          <MessageSquare size={26} /> Messages
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          Direct messages with {isAdmin ? "analysts and admins" : "admins"} —
          e.g. about disputes and flag feedback.
        </p>

        <div className="grid h-[calc(100vh-16rem)] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[300px_1fr]">
          {/* Conversation list */}
          <div
            className={`flex flex-col border-r border-slate-200 ${
              activeId != null ? "hidden md:flex" : "flex"
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-900">Chats</h2>
              <div className="flex gap-1">
                <button
                  onClick={openPicker}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  title="New message"
                >
                  <Plus size={18} />
                </button>
                {isAdmin && (
                  <button
                    onClick={openGroupPicker}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                    title="New group"
                  >
                    <Users size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-400">
                  No conversations yet.
                  <br />
                  Start one with the + button.
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv.id)}
                    className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      activeId === conv.id ? "bg-sky-50" : ""
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${
                        conv.type === "group" ? "bg-indigo-600" : "bg-sky-600"
                      }`}
                    >
                      {conv.type === "group" ? (
                        <Users size={18} />
                      ) : (
                        conv.displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {conv.displayName}
                        </p>
                        {conv.unread > 0 && (
                          <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
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

          {/* Thread */}
          <div
            className={`min-h-0 flex-col ${
              activeId != null ? "flex" : "hidden md:flex"
            }`}
          >
            {!activeConversation ? (
              <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
                <MessageSquare size={40} />
                <p className="mt-3 text-sm">Select a conversation</p>
              </div>
            ) : (
              <>
                <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 p-4">
                  <button
                    onClick={() => setActiveId(null)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white ${
                      activeConversation.type === "group"
                        ? "bg-indigo-600"
                        : "bg-sky-600"
                    }`}
                  >
                    {activeConversation.type === "group" ? (
                      <Users size={16} />
                    ) : (
                      activeConversation.displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {activeConversation.displayName}
                    </p>
                    {activeConversation.type === "group" ? (
                      <p className="text-xs text-slate-500">
                        {activeConversation.members.length} members
                      </p>
                    ) : (
                      activeConversation.disputeId != null && (
                        <p className="text-xs text-amber-600">
                          About a flagged instance
                        </p>
                      )
                    )}
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
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
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                            m.isMine
                              ? "bg-sky-600 text-white"
                              : "bg-white text-slate-900 shadow-sm"
                          }`}
                        >
                          {!m.isMine &&
                            activeConversation.type === "group" && (
                              <p className="mb-1 text-xs font-semibold text-indigo-600">
                                {m.senderName}
                              </p>
                            )}
                          {m.attachment_url && (
                            <div className="mb-2">
                              {m.attachment_type === "image" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={m.attachment_url}
                                  alt={m.attachment_name || ""}
                                  className="max-h-64 w-full max-w-[220px] rounded-lg object-cover"
                                />
                              ) : m.attachment_type === "video" ? (
                                <video
                                  src={m.attachment_url}
                                  controls
                                  className="max-h-64 w-full max-w-[260px] rounded-lg"
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
                            className={`mt-1 text-[10px] ${
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

                <div className="shrink-0 border-t border-slate-200 p-3">
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
                      className="rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                      title="Attach a file"
                    >
                      {uploading ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <Paperclip size={20} />
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
                      className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                    />
                    <button
                      onClick={() => handleSend()}
                      disabled={sending || uploading || !composer.trim()}
                      className="rounded-xl bg-sky-600 p-2.5 text-white transition hover:bg-sky-700 disabled:opacity-50"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* New direct message picker */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <h2 className="text-lg font-semibold text-slate-900">
                {isAdmin ? "New message" : "Message an admin"}
              </h2>
              <button
                onClick={() => setShowNew(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="border-b border-slate-200 p-4">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={isAdmin ? "Search people…" : "Search admins…"}
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-sky-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredDirectory.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">
                  No people to message.
                </p>
              ) : (
                filteredDirectory.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => startDirect(u.id)}
                    disabled={creating}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white">
                      {displayNameFor(u).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {displayNameFor(u)}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {roleLabel(u.role)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* New group modal (admin only) */}
      {showNewGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <h2 className="text-lg font-semibold text-slate-900">New group</h2>
              <button
                onClick={() => setShowNewGroup(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3 border-b border-slate-200 p-4">
              <input
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="Group name (e.g. Round 12 review)"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-sky-500"
              />
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search members to add…"
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-sky-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {groupCandidates.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">
                  No people to add.
                </p>
              ) : (
                groupCandidates.map((u) => {
                  const selected = groupMembers.has(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleGroupMember(u.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${
                        selected ? "bg-sky-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white">
                          {displayNameFor(u).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {displayNameFor(u)}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {roleLabel(u.role)}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                          selected
                            ? "border-sky-600 bg-sky-600 text-white"
                            : "border-slate-300"
                        }`}
                      >
                        {selected && <Check size={14} />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 p-4">
              <span className="text-sm text-slate-500">
                {groupMembers.size} selected
              </span>
              <button
                onClick={createGroup}
                disabled={
                  creating || !groupTitle.trim() || groupMembers.size === 0
                }
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                {creating && <Loader2 size={16} className="animate-spin" />}
                Create group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
