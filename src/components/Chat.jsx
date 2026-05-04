import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  fetchChatChannels, fetchChatMessages, sendChatMessage,
  editChatMessage, deleteChatMessage, markChatRead,
  findOrCreateDM, fetchDMUsers, fetchChatTeams, findOrCreateTeamChannel,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input } from './ui';

// Adaptive polling for the channel LIST only (less time-sensitive).
// Message poll always runs at 2s — it's cheap (?after= returns [] on no activity)
// and chat must feel real-time even when the tab is not focused.
const CHAN_POLL_ACTIVE_MS = 4_000;
const CHAN_POLL_BG_MS     = 30_000;
const MSG_POLL_MS        = 2_000;

function usePollInterval(active = CHAN_POLL_ACTIVE_MS, background = CHAN_POLL_BG_MS) {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
  return visible ? active : background;
}

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
export default function Chat({ initialChannelId = null }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeChannelId, setActiveChannelId] = useState(initialChannelId);
  const [showNewChat, setShowNewChat] = useState(false);
  // Mobile navigation: 'list' shows channel list, 'messages' shows message pane
  const [mobileView, setMobileView] = useState(initialChannelId ? 'messages' : 'list');

  const pollMs = usePollInterval(); // channel list only

  // Channel list — polled
  const { data: channels = [] } = useQuery({
    queryKey: ['chat-channels'],
    queryFn: fetchChatChannels,
    refetchInterval: pollMs,
    staleTime: 0,
    retry: false,
  });

  // Auto-select first channel for desktop pre-loading — does NOT navigate on mobile
  useEffect(() => {
    if (!activeChannelId && channels.length > 0) {
      setActiveChannelId(channels[0].id);
    }
  }, [channels, activeChannelId]);

  function handleSelectChannel(id) {
    setActiveChannelId(id);
    setShowNewChat(false);
    setMobileView('messages');
    queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
  }

  function handleChannelReady(channelId) {
    setShowNewChat(false);
    setActiveChannelId(channelId);
    setMobileView('messages');
    queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
  }

  function handleBack() {
    setMobileView('list');
  }

  const activeChannel = channels.find(ch => ch.id === activeChannelId);
  const totalUnread = channels.reduce((sum, ch) => sum + (Number(ch.unread_count) || 0), 0);

  return (
    <div className="relative flex h-[calc(100dvh-6rem)] max-h-200 rounded-xl border border-gray-700 overflow-hidden bg-gray-900">

      {/*
        Desktop: normal flex row — sidebar w-60, message pane flex-1. No tricks.
        Mobile:  sidebar becomes absolute (full-screen overlay), slides off to the
                 left when a channel is selected. Message pane stays in flow always.
      */}

      {/* ── Sidebar ── */}
      <aside
        className={[
          'shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col',
          // Desktop: static, fixed width — nothing else needed
          'sm:w-60',
          // Mobile only: absolute overlay so it sits on top of the message pane
          'max-sm:absolute max-sm:inset-0 max-sm:w-full max-sm:z-10',
          // Slide transition (no-op on desktop since no transform is ever applied there)
          'transition-transform duration-300 ease-in-out',
          mobileView === 'messages' ? 'max-sm:-translate-x-full' : '',
        ].join(' ')}
      >
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-700 shrink-0">
          <h2 className="text-sm font-bold text-chrome-300">
            Chat {totalUnread > 0 && (
              <span className="ml-1 text-[10px] bg-chrome-600 text-white px-1.5 py-0.5 rounded-full">{totalUnread}</span>
            )}
          </h2>
          <button
            type="button"
            title="New Direct Message"
            onClick={() => { setShowNewChat(true); setMobileView('messages'); }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-chrome-300 hover:bg-gray-700 text-lg leading-none transition-colors"
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

      {/* ── Message pane — always a normal flex child, never transforms ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-900">
        {showNewChat ? (
          <NewChatPane
            onChannelReady={handleChannelReady}
            onCancel={() => { setShowNewChat(false); setMobileView('list'); }}
          />
        ) : activeChannelId ? (
          <MessagePane
            key={activeChannelId}
            channelId={activeChannelId}
            currentUserId={user?.id}
            currentUserName={user?.name || user?.username}
            channelName={activeChannel ? channelLabel(activeChannel) : 'Chat'}
            channelType={activeChannel?.type}
            onBack={handleBack}
          />
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
      className={`w-full text-left px-4 py-3 sm:py-2 flex items-start gap-2 transition-colors ${
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
function MessagePane({ channelId, currentUserId, currentUserName, channelName, channelType, onBack }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  // Ref (not state) so poll queryFn always reads the freshest value without re-subscribing.
  // Initialize to mount time so empty channels still poll — initial load covers existing messages,
  // poll only needs to find anything newer than when we opened the channel.
  const newestAtRef = useRef(new Date().toISOString());
  const [initialized, setInitialized] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [replyTo, setReplyTo] = useState(null); // { id, sender_name, body }
  const [input, setInput] = useState('');
  const [loadedAll, setLoadedAll] = useState(false);
  const [messages, setMessages] = useState([]);
  const pollMs = usePollInterval();

  // ── Initial load ──────────────────────────────────────────────
  // key={channelId} on this component guarantees a fresh mount on channel switch,
  // so no explicit reset effect is needed.
  useQuery({
    queryKey: ['chat-messages', channelId],
    queryFn: async () => {
      const msgs = await fetchChatMessages(channelId);
      setMessages(msgs);
      if (msgs.length) {
        newestAtRef.current = msgs[msgs.length - 1].created_at;
        // Snap to bottom instantly on first load (no animation)
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }));
      }
      setInitialized(true);
      return msgs;
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Mark read when channel becomes active
  useEffect(() => {
    markChatRead(channelId).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
  }, [channelId, queryClient]);

  // ── Incremental poll ──────────────────────────────────────────
  // Only fetches messages newer than the last seen timestamp → returns [] most of the time
  // → minimal payload, minimal DB work, ~70–140x less data than full refetch per poll.
  // refetchIntervalInBackground:true keeps polling even when the tab loses focus —
  // critical for chat so messages arrive without needing to switch back to the tab.
  useQuery({
    queryKey: ['chat-messages-poll', channelId],
    queryFn: async () => {
      const after = newestAtRef.current;
      const newMsgs = await fetchChatMessages(channelId, undefined, after);
      if (!newMsgs.length) return [];

      const el = containerRef.current;
      const wasNearBottom = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 120);

      setMessages(prev => {
        const ids = new Set(prev.map(m => m.id));
        // Exclude IDs that are already present (including our own optimistic messages
        // which were already replaced in onSuccess)
        const realNew = newMsgs.filter(m => !ids.has(m.id));
        if (!realNew.length) return prev;
        newestAtRef.current = newMsgs[newMsgs.length - 1].created_at;
        return [...prev, ...realNew];
      });

      if (wasNearBottom) {
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
      }
      return newMsgs;
    },
    refetchInterval: MSG_POLL_MS,
    refetchIntervalInBackground: true,   // ← keep polling even when tab is not focused
    enabled: initialized,
  });

  // ── Load older messages ───────────────────────────────────────
  async function loadOlder() {
    if (loadedAll || !messages.length) return;
    // Find oldest real (non-optimistic) message to use as cursor
    const oldest = messages.find(m => typeof m.id === 'number');
    if (!oldest) return;
    const older = await fetchChatMessages(channelId, oldest.created_at);
    if (!older.length) { setLoadedAll(true); return; }
    setMessages(prev => {
      const ids = new Set(prev.map(m => m.id));
      return [...older.filter(m => !ids.has(m.id)), ...prev];
    });
  }

  // ── Send with optimistic update ───────────────────────────────
  const sendMutation = useMutation({
    mutationFn: ({ body, replyToId }) => sendChatMessage(channelId, body, replyToId),
    onMutate: async ({ body, replyToId }) => {
      const tempId = `temp-${Date.now()}`;
      const optimisticMsg = {
        id: tempId,
        channel_id: channelId,
        sender_id: currentUserId,
        sender_name: currentUserName || 'You',
        sender_username: user?.username,
        body,
        reply_to_id: replyToId || null,
        reply_body: replyTo?.body || null,
        reply_sender_name: replyTo?.sender_name || null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        _optimistic: true,
      };
      setMessages(prev => [...prev, optimisticMsg]);
      setInput('');
      setReplyTo(null);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
      return { tempId };
    },
    onSuccess: (serverMsg, _vars, ctx) => {
      // Replace the optimistic placeholder with the confirmed server message
      setMessages(prev => prev.map(m => m.id === ctx.tempId ? { ...serverMsg } : m));
      newestAtRef.current = serverMsg.created_at;
      queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
    },
    onError: (_err, _vars, ctx) => {
      // Roll back — remove the placeholder so the user can retry
      setMessages(prev => prev.filter(m => m.id !== ctx.tempId));
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }) => editChatMessage(id, body),
    onSuccess: (updated) => {
      setMessages(prev =>
        prev.map(m => m.id === updated.id ? { ...m, body: updated.body, edited_at: updated.edited_at } : m)
      );
      setEditingId(null);
      setEditBody('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChatMessage,
    onSuccess: (_data, msgId) => {
      setMessages(prev => prev.filter(m => m.id !== msgId));
    },
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
      <div className="px-3 py-2.5 border-b border-gray-700 bg-gray-850 flex items-center gap-2 shrink-0">
        {/* Back button — mobile only (hidden on desktop via sm:hidden) */}
        <button
          type="button"
          onClick={onBack}
          className="sm:hidden flex items-center justify-center w-8 h-8 -ml-1 rounded-lg text-gray-400 active:text-gray-200 active:bg-gray-700 transition-colors shrink-0"
          aria-label="Back to channels"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-xs shrink-0 text-gray-500">
          {channelType === 'direct' ? '●' : channelType === 'team' ? '⚾' : '🏢'}
        </span>
        <span className="text-sm font-semibold text-gray-200 truncate">{channelName || 'Chat'}</span>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {!loadedAll && messages.some(m => typeof m.id === 'number') && (
          <button
            type="button"
            onClick={loadOlder}
            className="w-full text-xs text-gray-500 hover:text-gray-300 py-1 text-center"
          >
            Load earlier messages
          </button>
        )}
        {messages.length === 0 && !initialized && (
          <p className="text-sm text-gray-500 text-center py-8">Loading…</p>
        )}
        {messages.length === 0 && initialized && (
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
  const isPending = !!msg._optimistic;

  return (
    <div
      className={`group flex gap-2 items-start ${isOwn ? 'flex-row-reverse' : ''} ${isPending ? 'opacity-60' : ''}`}
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

// ── New chat pane (individual DM or team channel) ────────────────
function NewChatPane({ onChannelReady, onCancel }) {
  const [tab, setTab] = useState('individual'); // 'individual' | 'team'
  const [search, setSearch] = useState('');

  // Individual DM users
  const { data: users = [] } = useQuery({
    queryKey: ['dm-users'],
    queryFn: fetchDMUsers,
    staleTime: 60_000,
  });

  // Teams
  const { data: teams = [] } = useQuery({
    queryKey: ['chat-teams'],
    queryFn: fetchChatTeams,
    staleTime: 60_000,
  });

  const filteredUsers = users.filter(u =>
    !search.trim() ||
    (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.username || '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredTeams = teams.filter(t =>
    !search.trim() || (t.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const dmMutation = useMutation({
    mutationFn: (userId) => findOrCreateDM(userId),
    onSuccess: (data) => onChannelReady(data.channel_id),
  });

  const teamMutation = useMutation({
    mutationFn: (teamId) => findOrCreateTeamChannel(teamId),
    onSuccess: (data) => onChannelReady(data.channel_id),
  });

  const isPending = dmMutation.isPending || teamMutation.isPending;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-700 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="sm:hidden flex items-center justify-center w-8 h-8 -ml-1 rounded-lg text-gray-400 active:text-gray-200 active:bg-gray-700 transition-colors shrink-0"
          aria-label="Back to channels"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-200">New Chat</span>
        <button type="button" onClick={onCancel} className="hidden sm:block ml-auto text-gray-500 hover:text-gray-300">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 shrink-0">
        <button
          type="button"
          onClick={() => { setTab('individual'); setSearch(''); }}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
            tab === 'individual'
              ? 'text-chrome-300 border-b-2 border-chrome-400 -mb-px'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Individual
        </button>
        <button
          type="button"
          onClick={() => { setTab('team'); setSearch(''); }}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
            tab === 'team'
              ? 'text-chrome-300 border-b-2 border-chrome-400 -mb-px'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Team
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3 shrink-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === 'individual' ? 'Search teammates…' : 'Search teams…'}
          className="lh-input w-full text-sm"
          autoFocus
        />
      </div>

      {/* List */}
      {tab === 'individual' ? (
        <ul className="flex-1 overflow-y-auto divide-y divide-gray-700/50">
          {filteredUsers.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500 italic">No teammates found.</li>
          )}
          {filteredUsers.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => dmMutation.mutate(u.id)}
                disabled={isPending}
                className="w-full text-left px-4 py-3 hover:bg-gray-700/50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-200">{u.name || u.username}</p>
                <p className="text-xs text-gray-500">{u.username} · {u.role}</p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-gray-700/50">
          {filteredTeams.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500 italic">No teams found.</li>
          )}
          {filteredTeams.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => teamMutation.mutate(t.id)}
                disabled={isPending}
                className="w-full text-left px-4 py-3 hover:bg-gray-700/50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-200">⚾ {t.name}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
