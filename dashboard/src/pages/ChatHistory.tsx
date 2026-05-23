import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Send, Search, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { sessionApi, messageApi, type Session } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useRole } from '../hooks/useRole';
import { useToast } from '../components/Toast';
import { PageHeader } from '../components/PageHeader';
import './ChatHistory.css';

export function ChatHistory() {
  const toast = useToast();
  const { canWrite } = useRole();

  // Sessions list
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Chats list
  const [chats, setChats] = useState<any[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatsSearch, setChatsSearch] = useState('');

  // Active chat & messages
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [activeChatName, setActiveChatName] = useState<string>('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Polling timers
  const messagePollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load WhatsApp sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      try {
        setLoadingSessions(true);
        const data = await sessionApi.list();
        setSessions(data);
        
        // Auto select first ready/active session
        const activeSess = data.find(s => s.status === 'ready');
        if (activeSess) {
          setSelectedSessionId(activeSess.id);
        } else if (data.length > 0) {
          setSelectedSessionId(data[0].id);
        }
      } catch (err) {
        toast.error("Erreur", "Impossible de charger les sessions WhatsApp.");
      } finally {
        setLoadingSessions(false);
      }
    };
    loadSessions();
  }, [toast]);

  // Load chats when selected session changes
  const fetchChats = useCallback(async (sessId = selectedSessionId) => {
    if (!sessId) return;
    try {
      setLoadingChats(true);
      const data = await messageApi.getChats(sessId);
      setChats(data || []);
    } catch (err) {
      console.error("Failed to fetch chats:", err);
    } finally {
      setLoadingChats(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    if (selectedSessionId) {
      fetchChats(selectedSessionId);
      setMessages([]);
      setActiveChatId('');
    }
  }, [selectedSessionId, fetchChats]);

  // Load message history for active chat
  const fetchMessages = useCallback(async (chatId = activeChatId) => {
    if (!selectedSessionId || !chatId) return;
    try {
      setLoadingMessages(true);
      const data = await messageApi.getMessages(selectedSessionId, chatId, 100);
      // Backend returns messages descending (newest first).
      setMessages(data.messages || []);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setLoadingMessages(false);
    }
  }, [selectedSessionId, activeChatId]);

  useEffect(() => {
    if (activeChatId) {
      fetchMessages(activeChatId);

      // Set up simple fallback pulling polling every 4 seconds for message synchronization
      if (messagePollInterval.current) clearInterval(messagePollInterval.current);
      messagePollInterval.current = setInterval(() => {
        // Silently pull messages in background
        messageApi.getMessages(selectedSessionId, activeChatId, 100)
          .then(data => {
            setMessages(data.messages || []);
          })
          .catch(err => console.log('Silently polling messages failed:', err));
      }, 4000);
    }

    return () => {
      if (messagePollInterval.current) {
        clearInterval(messagePollInterval.current);
        messagePollInterval.current = null;
      }
    };
  }, [activeChatId, fetchMessages, selectedSessionId]);

  // WebSocket message receiver
  const handleWebSocketMessage = useCallback((event: any) => {
    if (event.sessionId !== selectedSessionId) return;
    const newMsg = event.message;

    // Check if new message belongs to currently active chat JID
    if (newMsg.chatId === activeChatId) {
      setMessages(prev => {
        // Prevent duplicate appends
        if (prev.some(m => m.id === newMsg.id || m.waMessageId === newMsg.waMessageId)) {
          return prev;
        }
        return [newMsg, ...prev]; // Prepend since scroller has column-reverse
      });
    }

    // Refresh chats preview
    fetchChats(selectedSessionId);
  }, [selectedSessionId, activeChatId, fetchChats]);

  useWebSocket({
    onMessage: handleWebSocketMessage
  });

  // Send Reply
  const handleSendReply = async () => {
    if (!replyText.trim() || !activeChatId || !selectedSessionId) return;
    try {
      setSendingReply(true);
      await messageApi.sendText(selectedSessionId, activeChatId, replyText.trim());
      
      // Append manually in outgoing format for instant UI responsiveness
      const tempMsg = {
        id: Math.random().toString(),
        chatId: activeChatId,
        body: replyText.trim(),
        type: 'text',
        direction: 'outgoing',
        createdAt: new Date().toISOString(),
        status: 'sent',
        fromMe: true
      };
      setMessages(prev => [tempMsg, ...prev]);
      setReplyText('');
      
      // Refresh chat list preview
      fetchChats(selectedSessionId);
    } catch (err) {
      toast.error("Erreur d'envoi", err instanceof Error ? err.message : "Une erreur est survenue lors de l'envoi.");
    } finally {
      setSendingReply(false);
    }
  };

  // Format timestamp (HH:MM or Date)
  const formatTime = (timestamp?: any) => {
    if (!timestamp) return '';
    // If timestamp is unix seconds, multiply by 1000
    const d = new Date(typeof timestamp === 'number' && timestamp < 99999999999 ? timestamp * 1000 : timestamp);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Filter conversations
  const filteredChats = chats.filter(c => {
    const search = chatsSearch.toLowerCase();
    const id = (c.id || '').toLowerCase();
    const name = (c.name || '').toLowerCase();
    return id.includes(search) || name.includes(search);
  });

  const activeSession = sessions.find(s => s.id === selectedSessionId);

  return (
    <div className="chats-page-container fade-in">
      <PageHeader 
        title="Chats & Historique" 
        subtitle="Consultez l'historique complet des conversations et répondez directement aux destinataires de vos campagnes."
      />

      {/* WhatsApp accounts session selector */}
      <div className="sessions-selector-box">
        <label>Compte WhatsApp :</label>
        {loadingSessions ? (
          <Loader2 className="animate-spin" size={18} />
        ) : (
          <select 
            value={selectedSessionId} 
            onChange={e => setSelectedSessionId(e.target.value)}
          >
            <option value="">-- Sélectionnez une session --</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status === 'ready' ? 'Connecté' : 'Hors ligne'})
              </option>
            ))}
          </select>
        )}
        {activeSession && (
          <span style={{ fontSize: '0.85rem', color: activeSession.status === 'ready' ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
            ● Statut : {activeSession.status === 'ready' ? 'Prêt à l\'envoi' : 'Déconnecté / QR en attente'}
          </span>
        )}
      </div>

      {selectedSessionId ? (
        <div className="chat-interface-box">
          {/* Chats sidebar */}
          <div className="chats-sidebar">
            <div className="sidebar-search">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Rechercher une discussion..."
                value={chatsSearch}
                onChange={e => setChatsSearch(e.target.value)}
              />
            </div>
            
            {loadingChats && chats.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '0.5rem', color: '#64748b' }}>
                <Loader2 className="animate-spin" size={24} />
                <span>Chargement des conversations...</span>
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="chats-empty-state" style={{ padding: '2rem' }}>
                <MessageSquare size={32} />
                <p style={{ fontSize: '0.85rem' }}>Aucune conversation trouvée.</p>
              </div>
            ) : (
              <div className="chats-list">
                {filteredChats.map(c => {
                  const isActive = c.id === activeChatId;
                  return (
                    <div 
                      key={c.id} 
                      className={`chat-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        setActiveChatId(c.id);
                        setActiveChatName(c.name || c.id.split('@')[0]);
                      }}
                    >
                      <div className="chat-item-header">
                        <span className="chat-item-name">{c.name || c.id.split('@')[0]}</span>
                        <span className="chat-item-time">{formatTime(c.timestamp)}</span>
                      </div>
                      <div className="chat-item-body">
                        <span className="chat-item-preview">{c.lastMessage || '—'}</span>
                        {c.unreadCount > 0 && (
                          <span className="chat-item-badge">{c.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active conversation window */}
          {activeChatId ? (
            <div className="chat-window">
              <div className="chat-header">
                <div className="chat-header-info">
                  <span className="chat-header-name">{activeChatName}</span>
                  <span className="chat-header-status">
                    <span className="status-dot"></span>
                    <span>+{activeChatId.split('@')[0]}</span>
                  </span>
                </div>
                <button 
                  className="btn-icon" 
                  onClick={() => fetchMessages(activeChatId)} 
                  title="Rafraîchir les messages"
                  style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer' }}
                >
                  <RefreshCw size={16} />
                </button>
              </div>

              {/* Message scroll scroller pane */}
              <div className="messages-scroller">
                {loadingMessages && messages.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Loader2 className="animate-spin" size={28} />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chats-empty-state">
                    <MessageSquare size={36} />
                    <h3>Aucun message</h3>
                    <p>Démarrez la conversation en envoyant un message ci-dessous.</p>
                  </div>
                ) : (
                  messages.map(m => {
                    const isOutgoing = m.direction === 'outgoing' || m.fromMe === true;
                    return (
                      <div key={m.id} className={`msg-wrapper ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                        <div className={`msg-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                          <div className="msg-text">{m.body}</div>
                          <span className="msg-time">{formatTime(m.timestamp || m.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom reply text input bar */}
              <div className="reply-input-bar">
                <input
                  type="text"
                  placeholder="Tapez votre réponse ici..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendReply()}
                  disabled={!canWrite || activeSession?.status !== 'ready'}
                />
                <button
                  className="reply-send-btn"
                  onClick={handleSendReply}
                  disabled={sendingReply || !replyText.trim() || activeSession?.status !== 'ready'}
                  title="Envoyer le message"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className="chats-empty-state" style={{ flex: 1 }}>
              <MessageSquare size={48} />
              <h3>Aucune conversation sélectionnée</h3>
              <p>Sélectionnez une discussion dans la colonne latérale de gauche pour afficher l'historique complet et répondre en direct.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="chats-empty-state" style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '4rem' }}>
          <AlertCircle size={48} color="#f59e0b" />
          <h3>Aucun compte WhatsApp sélectionné</h3>
          <p>Pour consulter vos discussions, veuillez sélectionner une session active et connectée dans le bouton déroulant ci-dessus.</p>
        </div>
      )}
    </div>
  );
}
