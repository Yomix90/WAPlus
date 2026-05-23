import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  MessageSquare, 
  Send, 
  Search, 
  Loader2, 
  RefreshCw, 
  AlertCircle, 
  Paperclip, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  FileText, 
  X, 
  User,
  Download
} from 'lucide-react';
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

  // Side panels state (Profile & Message Search)
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [showSearchSidebar, setShowSearchSidebar] = useState(false);
  const [searchSidebarQuery, setSearchSidebarQuery] = useState('');

  // File attachments state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentType, setAttachmentType] = useState<'image' | 'video' | 'document' | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Polling timers
  const messagePollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

  // Close attachment menu if clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target as Node)) {
        setShowAttachmentMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Render WhatsApp ticks for outgoing message status
  const renderStatusTicks = (status?: string | number) => {
    // Ack values: 1 = sent (single check), 2 = delivered (double check), 3 = read (double blue check)
    if (status === 'read' || status === 3) {
      return (
        <span className="ticks-container read" title="Lu">
          <svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg" className="tick-svg blue-ticks">
            <path d="M1.5 5.5L5.5 9.5L14.5 1" stroke="#53bdeb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5.5 5.5L8.2 8.2L14.5 2" stroke="#53bdeb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      );
    }
    if (status === 'delivered' || status === 2) {
      return (
        <span className="ticks-container delivered" title="Distribué">
          <svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg" className="tick-svg grey-ticks">
            <path d="M1.5 5.5L5.5 9.5L14.5 1" stroke="#8696a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5.5 5.5L8.2 8.2L14.5 2" stroke="#8696a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      );
    }
    if (status === 'sent' || status === 1) {
      return (
        <span className="ticks-container sent" title="Envoyé">
          <svg width="16" height="11" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg" className="tick-svg grey-ticks">
            <path d="M1.5 5.5L5.5 9.5L14.5 1" stroke="#8696a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      );
    }
    return null;
  };

  // Generate color styles for avatar circles based on chat name/JID
  const getAvatarStyle = (name: string) => {
    const colors = [
      '#059669', '#2563EB', '#D97706', '#DC2626', '#7C3AED', 
      '#0891B2', '#4F46E5', '#DB2777', '#0d9488', '#ea580c'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = colors[Math.abs(hash) % colors.length];
    return {
      background: `linear-gradient(135deg, ${color}dd, ${color})`,
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'bold',
      fontSize: '0.95rem',
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      flexShrink: 0,
    };
  };

  const getInitials = (name: string) => {
    if (!name) return 'WA';
    const cleanName = name.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const parts = cleanName.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase() || 'WA';
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  };

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

  // Direct Attachment Upload Handlers
  const handleAttachmentClick = (type: 'image' | 'video' | 'document') => {
    setAttachmentType(type);
    setShowAttachmentMenu(false);
    if (fileInputRef.current) {
      fileInputRef.current.accept = 
        type === 'image' ? 'image/*' : 
        type === 'video' ? 'video/*' : '*/*';
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSessionId || !activeChatId || !attachmentType) return;

    try {
      setUploadingFile(true);
      
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64String = (reader.result as string).split(',')[1];
          const mimetype = file.type || 'application/octet-stream';
          const filename = file.name;

          const payload = {
            chatId: activeChatId,
            base64: base64String,
            mimetype,
            filename,
            caption: `Fichier : ${file.name}`
          };

          if (attachmentType === 'image') {
            await messageApi.sendImage(selectedSessionId, payload);
          } else if (attachmentType === 'video') {
            await messageApi.sendVideo(selectedSessionId, payload);
          } else {
            await messageApi.sendDocument(selectedSessionId, payload);
          }

          // Add message locally for instant UI update
          const tempMsg = {
            id: Math.random().toString(),
            chatId: activeChatId,
            body: attachmentType === 'image' 
              ? `data:${mimetype};base64,${base64String}` 
              : filename,
            type: attachmentType,
            direction: 'outgoing',
            createdAt: new Date().toISOString(),
            status: 'sent',
            fromMe: true,
            caption: attachmentType === 'image' ? `Photo envoyée` : undefined,
            mimetype: mimetype,
            filename: filename
          };

          setMessages(prev => [tempMsg, ...prev]);
          toast.success("Envoyé !", `${file.name} a été transmis avec succès.`);
          fetchChats(selectedSessionId);
        } catch (err) {
          toast.error("Erreur", err instanceof Error ? err.message : "Une erreur est survenue lors de l'envoi du média.");
        }
      };

      reader.onerror = () => {
        toast.error("Erreur", "Impossible de lire le fichier local.");
      };

      reader.readAsDataURL(file);
    } catch (err) {
      toast.error("Erreur", "Impossible de préparer le fichier.");
      console.error(err);
    } finally {
      setUploadingFile(false);
      setAttachmentType(null);
    }
  };

  // Advanced message search & scroll handler
  const handleScrollToMessage = (messageId: string) => {
    const element = document.getElementById(`msg-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Apply beautiful CSS animation flash highlight class
      element.classList.add('flash-highlight');
      setTimeout(() => {
        element.classList.remove('flash-highlight');
      }, 2000);
    } else {
      toast.error("Non chargé", "Ce message est trop ancien et n'est pas affiché dans la fenêtre courante.");
    }
  };

  // Format timestamp (HH:MM or Date)
  const formatTime = (timestamp?: any) => {
    if (!timestamp) return '';
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

  // Helper to render media or normal text bubble body
  const renderMessageContent = (m: any) => {
    const isImage = m.type === 'image' || (m.body && m.body.startsWith('data:image'));
    const isVideo = m.type === 'video' || (m.body && m.body.startsWith('data:video'));
    const isDocument = m.type === 'document' || m.type === 'document_with_caption' || m.filename;

    if (isImage) {
      const src = m.body.startsWith('data:') ? m.body : `data:${m.mimetype || 'image/jpeg'};base64,${m.body}`;
      return (
        <div className="msg-media-container image-media">
          <img src={src} alt="Média WhatsApp" className="msg-media-img" loading="lazy" />
          {m.caption && <div className="msg-media-caption">{m.caption}</div>}
        </div>
      );
    }

    if (isVideo) {
      const src = m.body.startsWith('data:') ? m.body : `data:${m.mimetype || 'video/mp4'};base64,${m.body}`;
      return (
        <div className="msg-media-container video-media">
          <video src={src} controls className="msg-media-vid" />
          {m.caption && <div className="msg-media-caption">{m.caption}</div>}
        </div>
      );
    }

    if (isDocument) {
      const docName = m.filename || m.body || "Document.pdf";
      return (
        <div className="msg-media-container document-media">
          <div className="doc-card">
            <div className="doc-icon-circle">
              <FileText size={20} className="doc-icon" />
            </div>
            <div className="doc-info">
              <span className="doc-name" title={docName}>{docName}</span>
              <span className="doc-size">{m.mimetype?.split('/')[1]?.toUpperCase() || 'DOCUMENT'}</span>
            </div>
            <button className="doc-download-btn" title="Télécharger le fichier" onClick={() => {
              if (m.body && m.body.startsWith('data:')) {
                const link = document.createElement('a');
                link.href = m.body;
                link.download = docName;
                link.click();
              } else {
                toast.info("Téléchargement", "Ce fichier a été envoyé via l'API.");
              }
            }}>
              <Download size={16} />
            </button>
          </div>
        </div>
      );
    }

    return <div className="msg-text">{m.body}</div>;
  };

  return (
    <div className="chats-page-container fade-in">
      <PageHeader 
        title="Chats & Historique" 
        subtitle="Consultez l'historique complet des conversations et répondez directement aux destinataires de vos campagnes."
      />

      {/* Hidden file input for uploads */}
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleFileChange}
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
            {/* Custom Sidebar Header for WhatsApp Style */}
            <div className="chats-sidebar-header">
              <div className="user-profile-circle">
                <User size={20} />
              </div>
              <div className="sidebar-header-actions">
                <span className="sidebar-brand">WaPlus Web</span>
              </div>
            </div>

            <div className="sidebar-search">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Rechercher ou démarrer une discussion..."
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
                  const chatName = c.name || c.id.split('@')[0];
                  return (
                    <div 
                      key={c.id} 
                      className={`chat-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        setActiveChatId(c.id);
                        setActiveChatName(chatName);
                        setShowProfilePanel(false); // Close panels when switching JIDs
                        setShowSearchSidebar(false);
                      }}
                    >
                      <div className="chat-item-avatar" style={getAvatarStyle(chatName)}>
                        {getInitials(chatName)}
                      </div>
                      <div className="chat-item-content">
                        <div className="chat-item-header">
                          <span className="chat-item-name">{chatName}</span>
                          <span className="chat-item-time">{formatTime(c.timestamp)}</span>
                        </div>
                        <div className="chat-item-body">
                          <span className="chat-item-preview" title={c.lastMessage}>{c.lastMessage || '—'}</span>
                          {c.unreadCount > 0 && (
                            <span className="chat-item-badge">{c.unreadCount}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active conversation window */}
          {activeChatId ? (
            <>
              <div className="chat-window">
                <div className="chat-header">
                  <div 
                    className="chat-header-left" 
                    onClick={() => {
                      setShowProfilePanel(!showProfilePanel);
                      setShowSearchSidebar(false); // Close search sidebar when profile opens
                    }} 
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}
                  >
                    <div className="chat-header-avatar" style={getAvatarStyle(activeChatName)}>
                      {getInitials(activeChatName)}
                    </div>
                    <div className="chat-header-info">
                      <span className="chat-header-name">{activeChatName}</span>
                      <span className="chat-header-status">
                        <span className="status-dot"></span>
                        <span>+{activeChatId.split('@')[0]}</span>
                      </span>
                    </div>
                  </div>
                  <div className="chat-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button 
                      className={`btn-icon ${showSearchSidebar ? 'active' : ''}`}
                      onClick={() => {
                        setShowSearchSidebar(!showSearchSidebar);
                        setShowProfilePanel(false); // Close profile panel when search opens
                        if (!showSearchSidebar) setSearchSidebarQuery('');
                      }}
                      title="Rechercher des messages"
                      style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Search size={16} />
                    </button>
                    <button 
                      className="btn-icon" 
                      onClick={() => fetchMessages(activeChatId)} 
                      title="Rafraîchir les messages"
                      style={{ background: '#f1f5f9', border: 'none', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
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
                    messages.map((m, index) => {
                      const isOutgoing = m.direction === 'outgoing' || m.fromMe === true;
                      
                      // Check if the previous message has the same sender to group bubbles visually
                      const nextMsg = messages[index - 1]; // In reverse, nextMsg is chronologically earlier
                      const isFirstInGroup = !nextMsg || (nextMsg.direction !== m.direction) || (nextMsg.fromMe !== m.fromMe);

                      return (
                        <div 
                          key={m.id} 
                          id={`msg-${m.id}`}
                          className={`msg-wrapper ${isOutgoing ? 'outgoing' : 'incoming'} ${isFirstInGroup ? 'first-in-group' : ''}`}
                        >
                          <div className={`msg-bubble ${isOutgoing ? 'outgoing' : 'incoming'} ${isFirstInGroup ? 'has-tail' : ''}`}>
                            {renderMessageContent(m)}
                            <div className="msg-meta-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px', marginTop: '0.25rem' }}>
                              <span className="msg-time">{formatTime(m.timestamp || m.createdAt)}</span>
                              {isOutgoing && renderStatusTicks(m.status)}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {uploadingFile && (
                    <div className="msg-wrapper outgoing">
                      <div className="msg-bubble outgoing uploading-bubble" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem' }}>
                        <Loader2 className="animate-spin" size={16} />
                        <span style={{ fontSize: '0.85rem' }}>Envoi du fichier...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom reply text input bar */}
                <div className="reply-input-bar">
                  {/* Trombone attachment button */}
                  <div className="attachment-container" ref={attachmentMenuRef}>
                    <button 
                      className={`btn-icon attachment-btn ${showAttachmentMenu ? 'active' : ''}`}
                      onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                      title="Joindre un fichier"
                      disabled={!canWrite || activeSession?.status !== 'ready'}
                      style={{ background: '#f1f5f9', border: 'none', padding: '0.65rem', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Paperclip size={18} className="paperclip-icon" />
                    </button>

                    {/* Attachment menu popover */}
                    {showAttachmentMenu && (
                      <div className="attachment-popover fade-in">
                        <button 
                          className="attachment-option opt-image"
                          onClick={() => handleAttachmentClick('image')}
                          title="Images"
                        >
                          <span className="opt-icon-circle"><ImageIcon size={18} /></span>
                          <span className="opt-label">Photos</span>
                        </button>
                        <button 
                          className="attachment-option opt-video"
                          onClick={() => handleAttachmentClick('video')}
                          title="Vidéos"
                        >
                          <span className="opt-icon-circle"><VideoIcon size={18} /></span>
                          <span className="opt-label">Vidéos</span>
                        </button>
                        <button 
                          className="attachment-option opt-doc"
                          onClick={() => handleAttachmentClick('document')}
                          title="Documents"
                        >
                          <span className="opt-icon-circle"><FileText size={18} /></span>
                          <span className="opt-label">Documents</span>
                        </button>
                      </div>
                    )}
                  </div>

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

              {/* Toggleable Right Contact Profile JID Drawer Panel */}
              {showProfilePanel && (
                <div className="chat-profile-sidebar fade-in" style={{ width: '320px', borderLeft: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem', boxSizing: 'border-box' }}>
                  <div style={{ alignSelf: 'flex-start', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>Infos du contact</span>
                    <button 
                      onClick={() => setShowProfilePanel(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div style={getAvatarStyle(activeChatName)} className="profile-large-avatar-circle">
                    {getInitials(activeChatName)}
                  </div>
                  <h3 style={{ marginTop: '1.25rem', marginBottom: '0.25rem', fontSize: '1.15rem', fontWeight: 800, color: '#1e293b', textAlign: 'center' }}>{activeChatName}</h3>
                  <span style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem' }}>+{activeChatId.split('@')[0]}</span>
                  
                  <hr style={{ width: '100%', border: 'none', borderTop: '1px solid #e2e8f0', margin: '1rem 0' }} />
                  
                  <div className="profile-section" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <h4 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', margin: 0 }}>Détails du Contact</h4>
                    <div className="profile-info-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Identifiant JID</span>
                      <span style={{ fontSize: '0.825rem', color: '#334155', wordBreak: 'break-all', fontFamily: 'monospace', background: '#f1f5f9', padding: '0.375rem 0.5rem', borderRadius: '6px' }}>{activeChatId}</span>
                    </div>
                    <div className="profile-info-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Type de discussion</span>
                      <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 500 }}>
                        {activeChatId.endsWith('@g.us') ? '👥 Discussion de Groupe' : '👤 Contact Individuel'}
                      </span>
                    </div>
                    <div className="profile-info-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Session active</span>
                      <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 500 }}>{activeSession?.name || '—'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Sliding Right Message Search Sidebar (Fidèle à Web WhatsApp) */}
              {showSearchSidebar && (
                <div className="chat-profile-sidebar search-sidebar fade-in" style={{ width: '340px', borderLeft: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', padding: '1.5rem', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>Rechercher des messages</span>
                    <button 
                      onClick={() => setShowSearchSidebar(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="sidebar-search" style={{ padding: 0, marginBottom: '1rem', width: '100%' }}>
                    <Search size={16} className="search-icon" style={{ left: '0.75rem' }} />
                    <input
                      type="text"
                      placeholder="Mots-clés à rechercher..."
                      value={searchSidebarQuery}
                      onChange={e => setSearchSidebarQuery(e.target.value)}
                      style={{ paddingLeft: '2.25rem' }}
                    />
                  </div>

                  <div className="search-results-list" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {searchSidebarQuery.trim() === '' ? (
                      <div className="search-sidebar-empty">
                        <Search size={32} style={{ color: '#94a3b8', marginBottom: '0.5rem' }} />
                        <p style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
                          Recherchez des messages dans cette discussion par mots-clés.
                        </p>
                      </div>
                    ) : (() => {
                      const results = messages.filter(m => 
                        m.body && 
                        typeof m.body === 'string' &&
                        m.body.toLowerCase().includes(searchSidebarQuery.toLowerCase())
                      );
                      
                      if (results.length === 0) {
                        return (
                          <div className="search-sidebar-empty">
                            <p style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
                              Aucun message trouvé pour "{searchSidebarQuery}".
                            </p>
                          </div>
                        );
                      }

                      return results.map(m => {
                        const isMe = m.direction === 'outgoing' || m.fromMe === true;
                        
                        // Highlight matching text helper
                        const highlightText = (text: string, query: string) => {
                          if (!query) return text;
                          const parts = text.split(new RegExp(`(${query})`, 'gi'));
                          return (
                            <span>
                              {parts.map((part, i) => 
                                part.toLowerCase() === query.toLowerCase() 
                                  ? <mark key={i} style={{ background: '#fde047', color: '#000000', padding: '0 2px', borderRadius: '2px' }}>{part}</mark> 
                                  : part
                              )}
                            </span>
                          );
                        };

                        return (
                          <div 
                            key={m.id} 
                            className="search-result-item"
                            onClick={() => handleScrollToMessage(m.id)}
                            style={{ 
                              padding: '0.75rem', 
                              background: '#ffffff', 
                              borderRadius: '8px', 
                              border: '1px solid #e2e8f0', 
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isMe ? '#10b981' : '#475569' }}>
                                {isMe ? 'Vous' : activeChatName}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                {formatTime(m.timestamp || m.createdAt)}
                              </span>
                            </div>
                            <p style={{ fontSize: '0.825rem', color: '#334155', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {highlightText(m.body, searchSidebarQuery)}
                            </p>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </>
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
