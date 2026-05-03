import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  fetchChatChannels, fetchChatMessages, sendChatMessage,
  editChatMessage, deleteChatMessage, markChatRead,
  findOrCreateDM, fetchDMUsers,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input } from './ui';

const POLL_MS = 5_000;

// ── Format helpers ──────────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function channelLabel(ch) {
  if (ch.type === 'direct') return ch.other_user_name || ch.name || 'Direct Message';
  if (ch.type === 'team') return ch.name || 'Team';
  if (ch.type === 'org') return ch.name || 'Organization';
  return ch.name || 'Channel';
}

// ══════════════════════════════════════════════════════════════
// Chat — main component
// ══════════════════════════════════════════════════════════════
export default function Chat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [showNewDM, setShowNewDM] = useState(false);

  // Channel list — polled
  const { data: channels = [] } = useQuery({
    queryKey: ['chat-channels'],
    queryFn: fetchChatChannels,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: false,
  });

  // Auto-select first channel
  useEffect(() => {
    if (!activeChannelId && channels.length > 0) {
      setActiveChannelId(channels[0].id);
    }
  }, [channels, activeChannelId]);

  function handleSelectChannel(id) {
    setActiveChannelId(id);
    setShowNewDM(false);
    // Mark as read
    queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
  }

  function handleDMCreated(channelId) {
    setShowNewDM(false);
    setActiveChannelId(channelId);
    queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
  }

  const totalUnread = channels.reduce((sum, ch) => sum + (Number(ch.unread_count) || 0), 0);

  return (
    <div className="flex h-[calc(100vh-6rem)] max-h-200 rounded-xl border border-gray-700 overflow-hidden bg-gray-900">
      {/* ── Sidebar ── */}
      <aside className="w-60 shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-700">
          <h2 className="text-sm font-bold text-chrome-300">
            Chat {totalUnread > 0 && (
              <span className="ml-1 text-[10px] bg-chrome-600 text-white px-1.5 py-0.5 rounded-full">{totalUnread}</span>
            )}
          </h2>
          <button
            type="button"
            title="New Direct Message"
            onClick={() => setShowNewDM(true)}
            className="text-gray-400 hover:text-chrome-300 text-lg leading-none"
          >
            +
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-1">
          {channels.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-500">No channels yet.</p>
          )}
          {channels.map((ch) => (
            <ChannelItem
              key={ch.id}
              channel={ch}
              active={ch.id === activeChannelId}
              onClick={() => handleSelectChannel(ch.id)}
            />
          ))}
        </nav>
      </aside>

      {/* ── Main pane ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {showNewDM ? (
          <NewDMPane onDMCreated={handleDMCreated} onCancel={() => setShowNewDM(false)} />
        ) : activeChannelId ? (
          <MessagePane channelId={activeChannelId} currentUserId={user?.id} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            Select a channel to start chatting
          </div>
        )}
      </div>
    </div>
  );
}

// ── Channel sidebar item ────────────────────────────────────────
function ChannelItem({ channel, active, onClick }) {
  const unread = Number(channel.unread_count) || 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-2 flex items-start gap-2 transition-colors ${
        active ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
      }`}
    >
      <span className="mt-0.5 text-gray-500 text-xs shrink-0">
        {channel.type === 'direct' ? '●' : channel.type === 'team' ? '⚾' : '🏢'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={`text-xs font-medium truncate ${unread > 0 ? 'text-gray-100' : ''}`}>
            {channelLabel(channel)}
          </span>
          {unread > 0 && (
            <span className="text-[10px] bg-chrome-600 text-white px-1.5 py-0.5 rounded-full shrink-0">{unread}</span>
          )}
        </div>
        {channel.last_message && (
          <p className="text-[11px] text-gray-500 truncate">{channel.last_message}</p>
        )}
      </div>
    </button>
  );
}

// ── Message pane ────────────────────────────────────────────────
function MessagePane({ channelId, currentUserId }) {
  const queryClient = useQueryClient();
  const bottomRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [replyTo, setReplyTo] = useState(null); // { id, sender_name, body }
  const [input, setInput] = useState('');
  const [loadedAll, setLoadedAll] = useState(false);
  const [olderMessages, setOlderMessages] = useState([]);

  // Latest messages — polled
  const { data: latestMessages = [] } = useQuery({
    queryKey: ['chat-messages', channelId],
    queryFn: () => fetchChatMessages(channelId),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: false,
  });

  // Mark read when channel becomes active
  useEffect(() => {
    markChatRead(channelId).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
    setOlderMessages([]);
    setLoadedAll(false);
  }, [channelId, queryClient]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [latestMessages]);

  // Combine older + latest, deduplicate by id
  const allIds = new Set(latestMessages.map(m => m.id));
  const uniqueOlder = olderMessages.filter(m => !allIds.has(m.id));
  const messages = [...uniqueOlder, ...latestMessages];

  // Load older messages
  async function loadOlder() {
    if (loadedAll || messages.length === 0) return;
    const oldest = messages[0];
    const older = await fetchChatMessages(channelId, oldest.created_at);
    if (older.length === 0) { setLoadedAll(true); return; }
    setOlderMessages(prev => {
      const ids = new Set(prev.map(m => m.id));
      return [...older.filter(m => !ids.has(m.id)), ...prev];
    });
  }

  const sendMutation = useMutation({
    mutationFn: ({ body, replyToId }) => sendChatMessage(channelId, body, replyToId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', channelId] });
      queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
      setInput('');
      setReplyTo(null);
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }) => editChatMessage(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', channelId] });
      setEditingId(null);
      setEditBody('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChatMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat-messages', channelId] }),
  });

  function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate({ body: input.trim(), replyToId: replyTo?.id });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-700 bg-gray-850 text-sm font-semibold text-gray-200 shrink-0">
        Chat
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {!loadedAll && messages.length > 0 && (
          <button
            type="button"
            onClick={loadOlder}
            className="w-full text-xs text-gray-500 hover:text-gray-300 py-1 text-center"
          >
            Load earlier messages
          </button>
        )}
        {messages.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            isOwn={msg.sender_id === currentUserId}
            editing={editingId === msg.id}
            editBody={editBody}
            onEditStart={() => { setEditingId(msg.id); setEditBody(msg.body); }}
            onEditChange={setEditBody}
            onEditSave={() => editMutation.mutate({ id: msg.id, body: editBody })}
            onEditCancel={() => { setEditingId(null); setEditBody(''); }}
            onDelete={() => deleteMutation.mutate(msg.id)}
            onReply={() => setReplyTo({ id: msg.id, sender_name: msg.sender_name, body: msg.body })}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="px-4 py-1.5 border-t border-gray-700 flex items-center gap-2 bg-gray-800/60 text-xs text-gray-400">
          <span className="text-chrome-400">↩</span>
          <span className="truncate">
            <strong className="text-gray-300">{replyTo.sender_name}</strong>: {replyTo.body}
          </span>
          <button type="button" onClick={() => setReplyTo(null)} className="ml-auto text-gray-500 hover:text-gray-300">✕</button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="px-4 py-3 border-t border-gray-700 flex gap-2 items-end shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="lh-input flex-1 resize-none text-sm min-h-9.5 max-h-30"
          style={{ height: Math.min(1 + (input.match(/\n/g) || []).length, 4) * 24 + 14 + 'px' }}
        />
        <Button type="submit" size="sm" loading={sendMutation.isPending} disabled={!input.trim()}>
          Send
        </Button>
      </form>
    </>
  );
}

// ── Message row ─────────────────────────────────────────────────
function MessageRow({ msg, isOwn, editing, editBody, onEditStart, onEditChange, onEditSave, onEditCancel, onDelete, onReply }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={`group flex gap-2 items-start ${isOwn ? 'flex-row-reverse' : ''}`}
      onMouseLeave={() => setShowMenu(false)}
    >
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
        isOwn ? 'bg-chrome-700 text-chrome-200' : 'bg-gray-700 text-gray-300'
      }`}>
        {(msg.sender_name || msg.sender_username || '?')[0].toUpperCase()}
      </div>

      {/* Bubble */}
      <div className={`max-w-[70%] min-w-0 ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {/* Sender name + time */}
        <div className={`flex items-baseline gap-1.5 text-[11px] text-gray-500 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="font-medium text-gray-400">{msg.sender_name || msg.sender_username}</span>
          <span>{formatTime(msg.created_at)}</span>
          {msg.edited_at && <span className="italic">(edited)</span>}
        </div>

        {/* Reply preview */}
        {msg.reply_body && (
          <div className={`text-[11px] text-gray-500 bg-gray-800 border-l-2 border-gray-600 pl-2 py-0.5 rounded truncate max-w-full ${isOwn ? 'border-r-2 border-l-0 pr-2 pl-0 text-right' : ''}`}>
            <strong className="text-gray-400">{msg.reply_sender_name}</strong>: {msg.reply_body}
          </div>
        )}

        {/* Body */}
        {editing ? (
          <div className="flex gap-1 items-center">
            <input
              className="lh-input text-sm py-1"
              value={editBody}
              onChange={(e) => onEditChange(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onEditSave();
                if (e.key === 'Escape') onEditCancel();
              }}
            />
            <button type="button" onClick={onEditSave} className="text-xs text-green-400 hover:text-green-300">✓</button>
            <button type="button" onClick={onEditCancel} className="text-xs text-gray-400 hover:text-gray-200">✕</button>
          </div>
        ) : (
          <div className={`relative px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap wrap-break-word ${
            isOwn
              ? 'bg-chrome-700/80 text-gray-100 rounded-tr-sm'
              : 'bg-gray-700 text-gray-200 rounded-tl-sm'
          }`}>
            {msg.body}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div className={`opacity-0 group-hover:opacity-100 flex gap-1 mt-1 transition-opacity ${isOwn ? 'flex-row-reverse' : ''}`}>
        <button type="button" onClick={onReply} title="Reply" className="text-gray-500 hover:text-gray-300 text-xs px-1">↩</button>
        {isOwn && (
          <>
            <button type="button" onClick={onEditStart} title="Edit" className="text-gray-500 hover:text-gray-300 text-xs px-1">✎</button>
            <button type="button" onClick={onDelete} title="Delete" className="text-gray-500 hover:text-red-400 text-xs px-1">🗑</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── New DM pane ──────────────────────────────────────────────────
function NewDMPane({ onDMCreated, onCancel }) {
  const [search, setSearch] = useState('');

  const { data: users = [] } = useQuery({
    queryKey: ['dm-users'],
    queryFn: fetchDMUsers,
    staleTime: 60_000,
  });

  const filtered = users.filter(u =>
    !search.trim() ||
    (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.username || '').toLowerCase().includes(search.toLowerCase())
  );

  const createMutation = useMutation({
    mutationFn: (userId) => findOrCreateDM(userId),
    onSuccess: (data) => onDMCreated(data.channel_id),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-200">New Direct Message</span>
        <button type="button" onClick={onCancel} className="ml-auto text-gray-500 hover:text-gray-300">✕</button>
      </div>
      <div className="px-4 py-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search teammates…"
          className="lh-input w-full text-sm"
          autoFocus
        />
      </div>
      <ul className="flex-1 overflow-y-auto divide-y divide-gray-700/50">
        {filtered.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500 italic">No teammates found.</li>
        )}
        {filtered.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => createMutation.mutate(u.id)}
              disabled={createMutation.isPending}
              className="w-full text-left px-4 py-3 hover:bg-gray-700/50 transition-colors"
            >
              <p className="text-sm font-medium text-gray-200">{u.name || u.username}</p>
              <p className="text-xs text-gray-500">{u.username} · {u.role}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
