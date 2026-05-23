import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Send, CheckCircle, XCircle, Loader2, Play, Users, Check, FileText, 
  AlertCircle, Trash2, Pause, Upload, Sparkles, 
  ChevronDown, ChevronUp, Clock, Info, ShieldAlert, FileUp, Link
} from 'lucide-react';
import { messageApi } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import { 
  useSessionsQuery, 
  useSessionGroupsQuery, 
  useSessionContactsQuery 
} from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { type MessageBatchResponse, type SendMediaPayload } from '../services/api';
import './MessageTester.css';

interface ApiResponse {
  success: boolean;
  messageId?: string;
  timestamp: string;
  error?: string;
}

const messageTypes = ['text', 'image', 'video', 'audio', 'document'] as const;

// Client-side CSV Parser
function parseCSV(text: string): { columns: string[]; rows: Array<Record<string, string>> } {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };
  
  // Detect separator: semicolon (;) or comma (,)
  const firstLine = lines[0];
  const separator = firstLine.includes(';') ? ';' : ',';
  
  const columns = firstLine.split(separator).map(col => col.trim().replace(/^["']|["']$/g, ''));
  const rows: Array<Record<string, string>> = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(separator).map(val => val.trim().replace(/^["']|["']$/g, ''));
    if (values.length === columns.length) {
      const row: Record<string, string> = {};
      columns.forEach((col, idx) => {
        row[col] = values[idx] || '';
      });
      rows.push(row);
    }
  }
  return { columns, rows };
}

export function MessageTester() {
  const { t } = useTranslation();
  useDocumentTitle(t('messageTester.title'));
  const { canWrite } = useRole();
  const { data: allSessions = [], isLoading: loadingSessions } = useSessionsQuery();
  const sessions = allSessions.filter(s => s.status === 'ready');
  
  // Common states
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'history'>('single');
  const [session, setSession] = useState('');

  // Campaign History States
  const [campaignsList, setCampaignsList] = useState<MessageBatchResponse[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);

  // ===========================================================================
  // 1. Single Message Mode States
  // ===========================================================================
  const [recipient, setRecipient] = useState('');
  const [recipientType, setRecipientType] = useState<'personal' | 'group'>('personal');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [messageType, setMessageType] = useState<typeof messageTypes[number]>('text');
  const [content, setContent] = useState('');
  
  // Local File Upload vs Media URL
  const [mediaSource, setMediaSource] = useState<'url' | 'upload'>('upload');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [mediaBase64, setMediaBase64] = useState('');
  const [mediaMimetype, setMediaMimetype] = useState('');
  const [mediaFilename, setMediaFilename] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);

  const { data: groups = [], isLoading: loadingGroups } = useSessionGroupsQuery(
    session,
    activeTab === 'single' && recipientType === 'group',
  );

  // ===========================================================================
  // 2. Bulk Message Mode States
  // ===========================================================================
  const [bulkTargetType, setBulkTargetType] = useState<'manual' | 'contacts' | 'csv'>('manual');
  const [bulkManualNumbers, setBulkManualNumbers] = useState('');
  
  // Contacts Selection
  const { data: sessionContacts = [], isLoading: loadingContacts } = useSessionContactsQuery(
    session,
    activeTab === 'bulk' && bulkTargetType === 'contacts',
  );
  const [bulkSelectedContacts, setBulkSelectedContacts] = useState<string[]>([]);
  const [contactsSearch, setContactsSearch] = useState('');

  // CSV states
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<Array<Record<string, string>>>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [csvPhoneCol, setCsvPhoneCol] = useState('');
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);

  // Bulk Composer States
  const [bulkMediaType, setBulkMediaType] = useState<typeof messageTypes[number]>('text');
  const [bulkMessageContent, setBulkMessageContent] = useState('');
  
  // Bulk Local File Upload vs Media URL
  const [bulkMediaSource, setBulkMediaSource] = useState<'url' | 'upload'>('upload');
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);
  const [bulkMediaBase64, setBulkMediaBase64] = useState('');
  const [bulkMediaMimetype, setBulkMediaMimetype] = useState('');
  const [bulkMediaFilename, setBulkMediaFilename] = useState('');
  const [bulkMediaUrl, setBulkMediaUrl] = useState('');
  
  // Options
  const [bulkDelay, setBulkDelay] = useState(3000);
  const [bulkRandomize, setBulkRandomize] = useState(true);
  const [bulkStopOnError, setBulkStopOnError] = useState(false);
  
  // Live Campaign Monitor
  const [bulkBatchId, setBulkBatchId] = useState<string | null>(null);
  const [campaignProgress, setCampaignProgress] = useState<MessageBatchResponse | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [isLaunchingCampaign, setIsLaunchingCampaign] = useState(false);
  const [logsFilter, setLogsFilter] = useState<'all' | 'sent' | 'failed' | 'pending'>('all');
  const [showLogsTable, setShowLogsTable] = useState(true);
  const pollingTimerRef = useRef<number | null>(null);

  // Fetch Campaign History
  const fetchCampaigns = async () => {
    if (!session) return;
    setIsLoadingCampaigns(true);
    try {
      const data = await messageApi.getBatches(session);
      setCampaignsList(data);
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    } finally {
      setIsLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history' && session) {
      void fetchCampaigns();
    }
  }, [session, activeTab]);

  // Initialize Session
  useEffect(() => {
    if (sessions.length > 0 && !session) {
      setSession(sessions[0].id);
    }
  }, [sessions, session]);

  // Handle selected group in single mode
  useEffect(() => {
    if (groups.length > 0 && !selectedGroup) {
      setSelectedGroup(groups[0].id);
    }
    if (recipientType !== 'group') {
      setSelectedGroup('');
    }
  }, [groups, selectedGroup, recipientType]);

  // Clean polling on unmount
  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, []);

  // Poll Campaign Progress
  const startCampaignPolling = (batchId: string) => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);

    const poll = async () => {
      try {
        const status = await messageApi.getBatchStatus(session, batchId);
        setCampaignProgress(status);
        
        // Stop polling if batch is in a final state
        if (['completed', 'failed', 'cancelled'].includes(status.status)) {
          if (pollingTimerRef.current) {
            clearInterval(pollingTimerRef.current);
            pollingTimerRef.current = null;
          }
        }
      } catch (err) {
        console.error('Error polling batch status:', err);
      }
    };

    // Immediate first poll
    void poll();
    
    // Set Interval (every 2s)
    pollingTimerRef.current = setInterval(poll, 2000) as unknown as number;
  };

  // Convert File to Base64 (Single Mode)
  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setMediaFilename(file.name);
    setMediaMimetype(file.type);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        const base64 = dataUrl.split(',')[1];
        setMediaBase64(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  // Convert File to Base64 (Bulk Mode)
  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkUploadFile(file);
    setBulkMediaFilename(file.name);
    setBulkMediaMimetype(file.type);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        const base64 = dataUrl.split(',')[1];
        setBulkMediaBase64(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Single Send
  const handleSingleSend = async () => {
    const targetId = recipientType === 'group' ? selectedGroup : recipient;
    if (!session || !targetId) return;
    setIsLoading(true);
    setResponse(null);

    const chatId = recipientType === 'group' ? targetId : targetId.replace(/[^0-9]/g, '') + '@c.us';

    try {
      let result;
      if (messageType === 'text') {
        result = await messageApi.sendText(session, chatId, content);
      } else {
        const payload: SendMediaPayload = {
          chatId,
          caption: messageType !== 'audio' ? content : undefined,
        };

        if (mediaSource === 'upload') {
          if (!mediaBase64) {
            throw new Error(t('messageTester.errorNoFile', 'Veuillez sélectionner un fichier à envoyer.'));
          }
          payload.base64 = mediaBase64;
          payload.mimetype = mediaMimetype || 'application/octet-stream';
          payload.filename = mediaFilename;
        } else {
          if (!mediaUrl) {
            throw new Error(t('messageTester.errorNoUrl', 'Veuillez saisir une URL de média.'));
          }
          payload.url = mediaUrl;
          if (messageType === 'document') {
            payload.filename = content || 'document.pdf';
            payload.caption = undefined;
          }
        }

        if (messageType === 'image') {
          result = await messageApi.sendImage(session, payload);
        } else if (messageType === 'video') {
          result = await messageApi.sendVideo(session, payload);
        } else if (messageType === 'audio') {
          result = await messageApi.sendAudio(session, payload);
        } else {
          result = await messageApi.sendDocument(session, payload);
        }
      }

      setResponse({
        success: !!result.messageId,
        messageId: result.messageId,
        timestamp: result.timestamp ? new Date(result.timestamp * 1000).toISOString() : new Date().toISOString(),
      });
    } catch (err) {
      setResponse({
        success: false,
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : t('messageTester.sendFailed'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // CSV File Upload & Parsing
  const handleCsvUpload = (file: File) => {
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        const { columns, rows } = parseCSV(text);
        setCsvColumns(columns);
        setCsvData(rows);
        
        // Auto-detect phone column
        const phoneColName = columns.find(col => 
          /phone|tel|number|numéro/i.test(col)
        ) || columns[0] || '';
        
        setCsvPhoneCol(phoneColName);
      }
    };
    reader.readAsText(file);
  };

  // Launch Bulk Campaign
  const handleLaunchBulk = async () => {
    if (!session || !canWrite) return;
    setIsLaunchingCampaign(true);
    setCampaignError(null);
    setCampaignProgress(null);

    let messagesList: Array<{
      chatId: string;
      type: typeof bulkMediaType;
      content: any;
      variables?: Record<string, string>;
    }> = [];

    try {
      // 1. Manual Entry Parsing
      if (bulkTargetType === 'manual') {
        const numbers = bulkManualNumbers
          .split(/[\n,;]/)
          .map(num => num.replace(/[^0-9]/g, '').trim())
          .filter(num => num.length > 5);

        if (numbers.length === 0) {
          throw new Error(t('messageTester.bulkErrorNoNumbers', 'Aucun numéro de téléphone valide saisi.'));
        }

        messagesList = numbers.map(num => ({
          chatId: `${num}@c.us`,
          type: bulkMediaType,
          content: getBulkMessageContentPayload(),
        }));
      } 
      // 2. WhatsApp Contacts List
      else if (bulkTargetType === 'contacts') {
        if (bulkSelectedContacts.length === 0) {
          throw new Error(t('messageTester.bulkErrorNoContacts', 'Veuillez sélectionner au moins un contact.'));
        }

        messagesList = bulkSelectedContacts.map(contactId => {
          const matchedContact = sessionContacts.find(c => c.id === contactId);
          const variables: Record<string, string> = {
            name: matchedContact?.name || matchedContact?.pushName || '',
            number: matchedContact?.number || '',
            pushName: matchedContact?.pushName || '',
          };
          return {
            chatId: contactId,
            type: bulkMediaType,
            content: getBulkMessageContentPayload(),
            variables,
          };
        });
      } 
      // 3. CSV File Rows
      else if (bulkTargetType === 'csv') {
        if (csvData.length === 0 || !csvPhoneCol) {
          throw new Error(t('messageTester.bulkErrorNoCsv', 'Veuillez charger un fichier CSV valide et configurer la colonne téléphone.'));
        }

        messagesList = csvData.map(row => {
          const rawPhone = row[csvPhoneCol] || '';
          const cleanedPhone = rawPhone.replace(/[^0-9]/g, '');
          if (!cleanedPhone) return null as any;

          // Pass entire row as template variables
          return {
            chatId: `${cleanedPhone}@c.us`,
            type: bulkMediaType,
            content: getBulkMessageContentPayload(),
            variables: row,
          };
        }).filter(item => item !== null);

        if (messagesList.length === 0) {
          throw new Error(t('messageTester.bulkErrorCsvNoValid', 'Aucun numéro valide n\'a pu être extrait du fichier CSV.'));
        }
      }

      // 4. Construct Request DTO
      const campaignPayload = {
        batchId: `bulk_${new Date().getTime().toString().slice(-6)}`,
        messages: messagesList,
        options: {
          delayBetweenMessages: bulkDelay,
          randomizeDelay: bulkRandomize,
          stopOnError: bulkStopOnError,
        }
      };

      // 5. Send POST
      const res = await messageApi.sendBulk(session, campaignPayload);
      setBulkBatchId(res.batchId);
      
      // 6. Start Polling for Live updates
      startCampaignPolling(res.batchId);
    } catch (err) {
      setCampaignError(err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setIsLaunchingCampaign(false);
    }
  };

  // Help compute appropriate message content structure based on type and source
  const getBulkMessageContentPayload = () => {
    if (bulkMediaType === 'text') {
      return { text: bulkMessageContent };
    }

    const payload: any = {
      caption: bulkMediaType !== 'audio' ? bulkMessageContent : undefined,
    };

    if (bulkMediaSource === 'upload') {
      if (!bulkMediaBase64) {
        throw new Error('Veuillez sélectionner un fichier média local pour la campagne.');
      }
      
      payload[bulkMediaType] = {
        base64: bulkMediaBase64,
        mimetype: bulkMediaMimetype || 'application/octet-stream',
        filename: bulkMediaType === 'document' ? bulkMediaFilename : undefined
      };
    } else {
      if (!bulkMediaUrl) {
        throw new Error('Veuillez renseigner l\'URL du fichier média.');
      }
      
      // Auto-detect mimetype fallback
      let mimetype = 'application/octet-stream';
      if (bulkMediaType === 'image') mimetype = 'image/jpeg';
      else if (bulkMediaType === 'video') mimetype = 'video/mp4';
      else if (bulkMediaType === 'audio') mimetype = 'audio/mpeg';

      payload[bulkMediaType] = {
        url: bulkMediaUrl,
        mimetype,
        filename: bulkMediaType === 'document' ? bulkMediaFilename || 'document.pdf' : undefined
      };
    }

    return payload;
  };

  // Cancel Running Campaign
  const handleCancelCampaign = async () => {
    if (!session || !bulkBatchId || !canWrite) return;
    try {
      const res = await messageApi.cancelBatch(session, bulkBatchId);
      setCampaignProgress(prev => prev ? { ...prev, status: 'cancelled', progress: res.progress } : null);
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    } catch (err) {
      console.error('Error cancelling campaign:', err);
    }
  };

  // Filter Campaign Logs
  const filteredResults = campaignProgress?.results?.filter(item => {
    if (logsFilter === 'all') return true;
    return item.status === logsFilter;
  }) || [];

  // Filter Contacts List - Safe & Crashproof
  const filteredContacts = Array.isArray(sessionContacts) ? sessionContacts.filter(c => {
    if (!c || !c.id) return false;
    const search = contactsSearch.toLowerCase();
    const name = (c.name || '').toLowerCase();
    const pushName = (c.pushName || '').toLowerCase();
    const number = (c.id.split('@')[0] || '').toLowerCase();
    const id = c.id.toLowerCase();
    return name.includes(search) || pushName.includes(search) || number.includes(search) || id.includes(search);
  }) : [];

  const toggleContactSelection = (contactId: string) => {
    setBulkSelectedContacts(prev =>
      prev.includes(contactId) ? prev.filter(id => id !== contactId) : [...prev, contactId]
    );
  };

  const selectAllContacts = () => {
    if (bulkSelectedContacts.length === filteredContacts.length) {
      setBulkSelectedContacts([]);
    } else {
      setBulkSelectedContacts(filteredContacts.map(c => c.id));
    }
  };

  // Render Single Mode loading
  if (loadingSessions) {
    return (
      <div
        className="message-tester"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}
      >
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="message-tester">
      <PageHeader title={t('messageTester.title')} subtitle={t('messageTester.subtitle')} />

      {/* Tabs Menu */}
      <div className="tab-menu glass">
        <button 
          className={`tab-btn ${activeTab === 'single' ? 'active' : ''}`}
          onClick={() => setActiveTab('single')}
        >
          <Send size={16} />
          <span>{t('messageTester.compose', 'Message Unique')}</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'bulk' ? 'active' : ''}`}
          onClick={() => setActiveTab('bulk')}
        >
          <Sparkles size={16} />
          <span>{t('messageTester.bulkCampaign', 'Campagne en Masse (Bulk)')}</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('history');
            void fetchCampaigns();
          }}
        >
          <Clock size={16} />
          <span>Historique des Campagnes</span>
        </button>
      </div>

      <div className="tester-panels">
        
        {/* =====================================================================
            LEFT COMPOSER PANEL 
            ===================================================================== */}
        <div className="compose-panel">
          
          {/* Active Session Selection */}
          <div className="form-group">
            <label>{t('messageTester.session')}</label>
            <select value={session} onChange={e => setSession(e.target.value)}>
              {sessions.length === 0 && <option value="">{t('messageTester.noReadySessions')}</option>}
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.phone || t('messageTester.sessionOptionPhoneNone')})
                </option>
              ))}
            </select>
          </div>

          {/* ==================== TAB: SINGLE MODE FORM ==================== */}
          {activeTab === 'single' && (
            <>
              <h2>{t('messageTester.compose')}</h2>

              <div className="form-group">
                <label>{t('messageTester.recipientType')}</label>
                <div className="toggle-group">
                  <button
                    className={recipientType === 'personal' ? 'active' : ''}
                    onClick={() => setRecipientType('personal')}
                  >
                    {t('messageTester.personal')}
                  </button>
                  <button 
                    className={recipientType === 'group' ? 'active' : ''} 
                    onClick={() => setRecipientType('group')}
                  >
                    {t('messageTester.group')}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>{recipientType === 'group' ? t('messageTester.selectGroup') : t('messageTester.recipientPhone')}</label>
                {recipientType === 'group' ? (
                  <>
                    <select
                      value={selectedGroup}
                      onChange={e => setSelectedGroup(e.target.value)}
                      disabled={loadingGroups || groups.length === 0}
                    >
                      {loadingGroups && <option value="">{t('messageTester.loadingGroups')}</option>}
                      {!loadingGroups && groups.length === 0 && <option value="">{t('messageTester.noGroupsFound')}</option>}
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <span className="hint">{t('messageTester.selectGroupHint')}</span>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      value={recipient}
                      onChange={e => setRecipient(e.target.value)}
                      placeholder="+62812345678"
                    />
                    <span className="hint">{t('messageTester.phoneHint')}</span>
                  </>
                )}
              </div>

              <div className="form-group">
                <label>{t('messageTester.messageType')}</label>
                <div className="toggle-group">
                  {messageTypes.map(type => (
                    <button
                      key={type}
                      className={messageType === type ? 'active' : ''}
                      onClick={() => setMessageType(type)}
                    >
                      {t(`messageTester.types.${type}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Media input options for file uploads */}
              {messageType !== 'text' && (
                <div className="form-group fade-in">
                  <label>Source du Média</label>
                  <div className="toggle-group" style={{ marginBottom: '1rem' }}>
                    <button
                      type="button"
                      className={mediaSource === 'upload' ? 'active' : ''}
                      onClick={() => setMediaSource('upload')}
                    >
                      <FileUp size={14} style={{ marginRight: '4px' }} />
                      Fichier local (Upload)
                    </button>
                    <button
                      type="button"
                      className={mediaSource === 'url' ? 'active' : ''}
                      onClick={() => setMediaSource('url')}
                    >
                      <Link size={14} style={{ marginRight: '4px' }} />
                      Lien URL
                    </button>
                  </div>

                  {mediaSource === 'upload' ? (
                    <div className="file-uploader-box fade-in">
                      <input 
                        type="file" 
                        onChange={handleSingleFileChange}
                        id="single-media-picker"
                        style={{ display: 'none' }}
                        accept={
                          messageType === 'image' ? 'image/*' : 
                          messageType === 'video' ? 'video/*' : 
                          messageType === 'audio' ? 'audio/*' : '*/*'
                        }
                      />
                      <label htmlFor="single-media-picker" className="file-upload-label-btn">
                        <Upload size={16} />
                        Choisir un fichier...
                      </label>
                      {uploadFile && (
                        <div className="file-selected-name">
                          <CheckCircle size={14} color="#10B981" />
                          <span>{uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="fade-in">
                      <input
                        type="text"
                        value={mediaUrl}
                        onChange={e => setMediaUrl(e.target.value)}
                        placeholder="https://example.com/file.jpg"
                      />
                    </div>
                  )}
                </div>
              )}

              {messageType === 'text' ? (
                <div className="form-group">
                  <label>{t('messageTester.messageContent')}</label>
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder={t('messageTester.messagePlaceholder')}
                    rows={5}
                  />
                </div>
              ) : (
                <>
                  {messageType !== 'audio' && (
                    <div className="form-group">
                      <label>
                        {messageType === 'document' ? t('messageTester.filename') : t('messageTester.caption')} ({t('common.optional')})
                      </label>
                      <input
                        type="text"
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        placeholder={messageType === 'document' ? t('messageTester.filenamePlaceholder') : t('messageTester.captionPlaceholder')}
                      />
                    </div>
                  )}
                </>
              )}

              <button
                className="send-btn"
                onClick={handleSingleSend}
                disabled={
                  !canWrite || 
                  isLoading || 
                  !session || 
                  (recipientType === 'group' ? !selectedGroup : !recipient) ||
                  (messageType !== 'text' && mediaSource === 'upload' && !mediaBase64) ||
                  (messageType !== 'text' && mediaSource === 'url' && !mediaUrl)
                }
              >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                {isLoading ? t('messageTester.sending') : canWrite ? t('messageTester.send') : t('messageTester.viewOnly')}
              </button>
            </>
          )}

          {/* ==================== TAB: BULK CAMPAIGN FORM ==================== */}
          {activeTab === 'bulk' && (
            <>
              <div className="form-section-title">
                <Users size={16} />
                <span>1. Cibler les Destinataires</span>
              </div>

              <div className="form-group">
                <label>Source des Numéros</label>
                <div className="toggle-group">
                  <button
                    className={bulkTargetType === 'manual' ? 'active' : ''}
                    onClick={() => setBulkTargetType('manual')}
                  >
                    Saisie manuelle
                  </button>
                  <button
                    className={bulkTargetType === 'contacts' ? 'active' : ''}
                    onClick={() => setBulkTargetType('contacts')}
                  >
                    Contacts WhatsApp
                  </button>
                  <button
                    className={bulkTargetType === 'csv' ? 'active' : ''}
                    onClick={() => setBulkTargetType('csv')}
                  >
                    Fichier CSV
                  </button>
                </div>
              </div>

              {/* Mode: Manual */}
              {bulkTargetType === 'manual' && (
                <div className="form-group fade-in">
                  <label>Numéros de Téléphone</label>
                  <textarea
                    value={bulkManualNumbers}
                    onChange={e => setBulkManualNumbers(e.target.value)}
                    placeholder="Saisissez les numéros (ex: +33612345678, +336987654321, etc.). Séparateurs acceptés : virgule, point-virgule ou saut de ligne."
                    rows={4}
                  />
                  <span className="hint">Entrez les numéros au format international. Les doublons et caractères non-numériques seront automatiquement nettoyés.</span>
                </div>
              )}

              {/* Mode: WhatsApp Contacts */}
              {bulkTargetType === 'contacts' && (
                <div className="form-group fade-in">
                  <label>Sélectionner des Contacts ({bulkSelectedContacts.length} sélectionnés)</label>
                  
                  <div className="contacts-search-bar">
                    <input 
                      type="text" 
                      placeholder="Rechercher par nom ou numéro..." 
                      value={contactsSearch}
                      onChange={e => setContactsSearch(e.target.value)}
                    />
                    <button 
                      type="button" 
                      className="select-all-btn"
                      onClick={selectAllContacts}
                    >
                      {bulkSelectedContacts.length === filteredContacts.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>

                  {loadingContacts ? (
                    <div className="contacts-loading">
                      <Loader2 className="animate-spin" size={20} />
                      <span>Chargement de vos contacts WhatsApp...</span>
                    </div>
                  ) : filteredContacts.length === 0 ? (
                    <div className="contacts-empty-list">
                      <span>Aucun contact trouvé.</span>
                    </div>
                  ) : (
                    <div className="contacts-checklist-box">
                      {filteredContacts.map(c => (
                        <label key={c.id} className="contact-checklist-item">
                          <input 
                            type="checkbox"
                            checked={bulkSelectedContacts.includes(c.id)}
                            onChange={() => toggleContactSelection(c.id)}
                          />
                          <div className="contact-details-label">
                            <span className="contact-name">{c.name || c.pushName || 'Nom inconnu'}</span>
                            <span className="contact-phone">+{c.id.split('@')[0]}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Mode: CSV File */}
              {bulkTargetType === 'csv' && (
                <div className="form-group csv-uploader-container fade-in">
                  <label>Charger le fichier CSV</label>
                  
                  <div className="csv-drop-zone">
                    <Upload size={24} className="csv-upload-icon" />
                    <p>Faites glisser votre fichier CSV ici ou</p>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleCsvUpload(file);
                      }}
                      id="csv-file-picker"
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="csv-file-picker" className="csv-pick-btn">Parcourir les fichiers</label>
                  </div>

                  {csvFile && (
                    <div className="csv-uploaded-meta">
                      <div className="csv-meta-title">
                        <FileText size={16} />
                        <span>{csvFile.name} ({csvData.length} contacts chargés)</span>
                        <button type="button" className="csv-delete-btn" onClick={() => {
                          setCsvFile(null);
                          setCsvData([]);
                          setCsvColumns([]);
                          setCsvPhoneCol('');
                        }}>
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="csv-select-group">
                        <label>Colonne Téléphone</label>
                        <select value={csvPhoneCol} onChange={e => setCsvPhoneCol(e.target.value)}>
                          <option value="">Sélectionner la colonne...</option>
                          {csvColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>

                      <button 
                        type="button" 
                        className="csv-preview-toggle"
                        onClick={() => setCsvPreviewOpen(!csvPreviewOpen)}
                      >
                        {csvPreviewOpen ? 'Masquer l\'aperçu' : 'Afficher l\'aperçu des données'}
                        {csvPreviewOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>

                      {csvPreviewOpen && (
                        <div className="csv-preview-table-box scrollbar-thin">
                          <table>
                            <thead>
                              <tr>
                                {csvColumns.map(col => (
                                  <th key={col}>{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {csvData.slice(0, 5).map((row, idx) => (
                                <tr key={idx}>
                                  {csvColumns.map(col => (
                                    <td key={col}>{row[col]}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {csvData.length > 5 && (
                            <div className="csv-preview-more-hint">
                              ... et {csvData.length - 5} autres lignes.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <hr className="composer-divider" />

              <div className="form-section-title">
                <FileText size={16} />
                <span>2. Rédiger le Message</span>
              </div>

              <div className="form-group">
                <label>Type de Message</label>
                <div className="toggle-group">
                  {messageTypes.map(type => (
                    <button
                      key={type}
                      className={bulkMediaType === type ? 'active' : ''}
                      onClick={() => setBulkMediaType(type)}
                    >
                      {t(`messageTester.types.${type}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Media options for file uploads in Bulk Campaign */}
              {bulkMediaType !== 'text' && (
                <div className="form-group fade-in">
                  <label>Source du Média de Campagne</label>
                  <div className="toggle-group" style={{ marginBottom: '1rem' }}>
                    <button
                      type="button"
                      className={bulkMediaSource === 'upload' ? 'active' : ''}
                      onClick={() => setBulkMediaSource('upload')}
                    >
                      <FileUp size={14} style={{ marginRight: '4px' }} />
                      Fichier local (Upload)
                    </button>
                    <button
                      type="button"
                      className={bulkMediaSource === 'url' ? 'active' : ''}
                      onClick={() => setBulkMediaSource('url')}
                    >
                      <Link size={14} style={{ marginRight: '4px' }} />
                      Lien URL
                    </button>
                  </div>

                  {bulkMediaSource === 'upload' ? (
                    <div className="file-uploader-box fade-in">
                      <input 
                        type="file" 
                        onChange={handleBulkFileChange}
                        id="bulk-media-picker"
                        style={{ display: 'none' }}
                        accept={
                          bulkMediaType === 'image' ? 'image/*' : 
                          bulkMediaType === 'video' ? 'video/*' : 
                          bulkMediaType === 'audio' ? 'audio/*' : '*/*'
                        }
                      />
                      <label htmlFor="bulk-media-picker" className="file-upload-label-btn">
                        <Upload size={16} />
                        Choisir un fichier de campagne...
                      </label>
                      {bulkUploadFile && (
                        <div className="file-selected-name">
                          <CheckCircle size={14} color="#10B981" />
                          <span>{bulkUploadFile.name} ({(bulkUploadFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="fade-in">
                      <input
                        type="text"
                        value={bulkMediaUrl}
                        onChange={e => setBulkMediaUrl(e.target.value)}
                        placeholder="https://example.com/document.pdf ou .jpg, .mp4..."
                      />
                    </div>
                  )}
                </div>
              )}

              {bulkMediaType === 'document' && (
                <div className="form-group fade-in">
                  <label>Nom du fichier de destination</label>
                  <input
                    type="text"
                    value={bulkMediaFilename}
                    onChange={e => setBulkMediaFilename(e.target.value)}
                    placeholder="Contrat_Marketing.pdf"
                  />
                </div>
              )}

              {bulkMediaType !== 'audio' && (
                <div className="form-group">
                  <label>Message {bulkMediaType !== 'text' && '(Légende du média)'}</label>
                  <textarea
                    value={bulkMessageContent}
                    onChange={e => setBulkMessageContent(e.target.value)}
                    placeholder={bulkMediaType === 'text' ? "Bonjour {name}, voici votre relance..." : "Voici la pièce jointe pour votre dossier..."}
                    rows={5}
                  />
                  {bulkTargetType === 'csv' && csvColumns.length > 0 && (
                    <div className="csv-variables-tip">
                      <Sparkles size={12} />
                      <span>Variables CSV disponibles : {csvColumns.map(c => `{${c}}`).join(', ')}</span>
                    </div>
                  )}
                  {bulkTargetType === 'contacts' && (
                    <div className="csv-variables-tip">
                      <Sparkles size={12} />
                      <span>Variables de contact disponibles : <code>{'{name}'}</code>, <code>{'{number}'}</code></span>
                    </div>
                  )}
                </div>
              )}

              <hr className="composer-divider" />

              <div className="form-section-title">
                <Clock size={16} />
                <span>3. Paramètres de Diffusion</span>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: '1 1 50%' }}>
                  <label>Délai entre messages (ms)</label>
                  <div className="delay-slider-container">
                    <input 
                      type="range" 
                      min="1000" 
                      max="15000" 
                      step="500"
                      value={bulkDelay}
                      onChange={e => setBulkDelay(parseInt(e.target.value))}
                    />
                    <span className="delay-value-display">{bulkDelay / 1000}s</span>
                  </div>
                </div>

                <div className="form-group" style={{ flex: '1 1 50%', display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center' }}>
                  <label className="toggle-label-checkbox">
                    <input 
                      type="checkbox"
                      checked={bulkRandomize}
                      onChange={e => setBulkRandomize(e.target.checked)}
                    />
                    <div className="toggle-cb-content">
                      <span className="cb-title">Délai aléatoire (+0-2s)</span>
                      <span className="cb-desc">Simule le comportement humain</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="toggle-label-checkbox">
                  <input 
                    type="checkbox"
                    checked={bulkStopOnError}
                    onChange={e => setBulkStopOnError(e.target.checked)}
                  />
                  <div className="toggle-cb-content">
                    <span className="cb-title">Arrêter la campagne en cas d'erreur</span>
                    <span className="cb-desc">Stoppe net la file d'attente sur le premier échec</span>
                  </div>
                </label>
              </div>

              <button
                className="send-btn bulk-launch-btn"
                onClick={handleLaunchBulk}
                disabled={
                  !canWrite || 
                  isLaunchingCampaign || 
                  !session ||
                  (bulkTargetType === 'manual' && !bulkManualNumbers) ||
                  (bulkTargetType === 'contacts' && bulkSelectedContacts.length === 0) ||
                  (bulkTargetType === 'csv' && csvData.length === 0) ||
                  (bulkMediaType !== 'text' && bulkMediaSource === 'upload' && !bulkMediaBase64) ||
                  (bulkMediaType !== 'text' && bulkMediaSource === 'url' && !bulkMediaUrl)
                }
              >
                {isLaunchingCampaign ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} fill="currentColor" />}
                {isLaunchingCampaign ? 'Lancement...' : canWrite ? 'Lancer la Campagne' : t('messageTester.viewOnly')}
              </button>

              {campaignError && (
                <div className="campaign-error-banner fade-in">
                  <AlertCircle size={16} />
                  <span>{campaignError}</span>
                </div>
              )}
            </>
          )}

          {/* ==================== TAB: CAMPAIGN HISTORY ==================== */}
          {activeTab === 'history' && (
            <>
              <div className="form-section-title" style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={16} />
                  <span>Historique des Campagnes</span>
                </div>
                <button
                  type="button"
                  className="filter-chip active"
                  style={{ marginLeft: 'auto', fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                  onClick={fetchCampaigns}
                  disabled={isLoadingCampaigns}
                >
                  {isLoadingCampaigns ? <Loader2 className="animate-spin" size={12} /> : 'Rafraîchir'}
                </button>
              </div>

              {isLoadingCampaigns ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                  <Loader2 className="animate-spin" size={32} />
                </div>
              ) : campaignsList.length === 0 ? (
                <div className="response-empty" style={{ minHeight: '150px', marginTop: '1rem' }}>
                  <p>Aucune campagne d'envoi groupé trouvée pour cette session.</p>
                </div>
              ) : (
                <div className="campaigns-history-list">
                  {campaignsList.map(camp => (
                    <div key={camp.batchId} className={`campaign-history-item ${camp.status}`}>
                      <div className="camp-header">
                        <span className="camp-id mono">{camp.batchId}</span>
                        <span className={`status-badge ${camp.status}`}>{camp.status}</span>
                      </div>
                      <div className="camp-body">
                        <div className="camp-meta-row">
                          <span>Créée le :</span>
                          <span>{camp.startedAt ? new Date(camp.startedAt).toLocaleString() : 'En attente'}</span>
                        </div>
                        <div className="camp-meta-row">
                          <span>Progression :</span>
                          <span>{(camp.progress?.sent || 0) + (camp.progress?.failed || 0)} / {camp.progress?.total || 0}</span>
                        </div>
                        <div className="camp-meta-row">
                          <span>Détails :</span>
                          <span>
                            <span className="sent-count">{camp.progress?.sent || 0} envoyés</span>
                            {' / '}
                            <span className="failed-count">{camp.progress?.failed || 0} échoués</span>
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="camp-view-btn"
                        onClick={() => {
                          setBulkBatchId(camp.batchId);
                          startCampaignPolling(camp.batchId);
                        }}
                      >
                        <Play size={12} fill="currentColor" />
                        <span>Analyser et Suivre</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </div>

        {/* =====================================================================
            RIGHT RESPONSE / PROGRESS MONITOR PANEL 
            ===================================================================== */}
        <div className="response-panel">
          
          {/* ==================== TAB: SINGLE MODE RESPONSE ==================== */}
          {activeTab === 'single' && (
            <>
              <h2>{t('messageTester.responseTitle')}</h2>

              {response ? (
                <>
                  <div className={`response-status ${response.success ? 'success' : 'error'}`}>
                    {response.success ? (
                      <>
                        <CheckCircle size={20} />
                        <span>{t('messageTester.successLabel')}</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={20} />
                        <span>{t('messageTester.failedLabel')}</span>
                      </>
                    )}
                  </div>

                  <div className="response-details">
                    <div className="detail-row">
                      <span className="detail-label">{t('messageTester.response.timestamp')}</span>
                      <span className="detail-value">{response.timestamp}</span>
                    </div>
                    {response.messageId && (
                      <div className="detail-row">
                        <span className="detail-label">{t('messageTester.response.messageId')}</span>
                        <span className="detail-value mono">{response.messageId}</span>
                      </div>
                    )}
                    {response.error && (
                      <div className="detail-row">
                        <span className="detail-label">{t('messageTester.response.error')}</span>
                        <span className="detail-value" style={{ color: '#DC2626' }}>
                          {response.error}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="response-json">
                    <pre>{JSON.stringify(response, null, 2)}</pre>
                  </div>
                </>
              ) : (
                <div className="response-empty">
                  <p>{t('messageTester.responseEmpty')}</p>
                </div>
              )}
            </>
          )}

          {/* ==================== TAB: BULK CAMPAIGN MONITOR ==================== */}
          {(activeTab === 'bulk' || activeTab === 'history') && (
            <>
              <h2>Progression de la Campagne</h2>

              {campaignProgress ? (
                <div className="campaign-monitor fade-in">
                  
                  {/* Campaign Status Card */}
                  <div className={`campaign-status-card ${campaignProgress.status}`}>
                    <div className="campaign-card-header">
                      <div className="campaign-id-group">
                        <span className="batch-label">Campagne active</span>
                        <span className="batch-id mono">{campaignProgress.batchId}</span>
                      </div>
                      
                      {/* Interactive dynamic badge */}
                      <span className={`status-badge ${campaignProgress.status}`}>
                        {campaignProgress.status === 'processing' && <Loader2 className="animate-spin" size={12} />}
                        {campaignProgress.status === 'completed' && <Check size={12} />}
                        {campaignProgress.status === 'cancelled' && <Pause size={12} />}
                        {campaignProgress.status === 'failed' && <AlertCircle size={12} />}
                        {campaignProgress.status}
                      </span>
                    </div>

                    {/* Progress Percentage Display */}
                    {campaignProgress.progress && (
                      <div className="progress-bar-section">
                        <div className="progress-meta-text">
                          <span>
                            {Math.round(
                              ((campaignProgress.progress.sent + campaignProgress.progress.failed) / 
                                campaignProgress.progress.total) * 100
                            )}% complété
                          </span>
                          <span className="progress-ratio">
                            {campaignProgress.progress.sent + campaignProgress.progress.failed} / {campaignProgress.progress.total} messages
                          </span>
                        </div>

                        {/* Premium Gradient Track */}
                        <div className="campaign-progress-track">
                          <div 
                            className={`campaign-progress-fill ${campaignProgress.status}`}
                            style={{ 
                              width: `${((campaignProgress.progress.sent + campaignProgress.progress.failed) / campaignProgress.progress.total) * 100}%` 
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Meta Row Counters */}
                    <div className="campaign-stats-grid">
                      <div className="stat-box">
                        <span className="stat-label">Réussis</span>
                        <span className="stat-num sent">{campaignProgress.progress.sent}</span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-label">Échoués</span>
                        <span className="stat-num failed">{campaignProgress.progress.failed}</span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-label">En attente</span>
                        <span className="stat-num pending">{campaignProgress.progress.pending}</span>
                      </div>
                      {campaignProgress.progress.cancelled > 0 && (
                        <div className="stat-box">
                          <span className="stat-label">Annulés</span>
                          <span className="stat-num cancelled">{campaignProgress.progress.cancelled}</span>
                        </div>
                      )}
                    </div>

                    {/* Currently sending details */}
                    {campaignProgress.status === 'processing' && campaignProgress.results && (
                      <div className="campaign-active-status-bar animate-pulse">
                        <Info size={14} />
                        <span>Envoi en cours à vos destinataires...</span>
                      </div>
                    )}

                    {/* Cancel button if running */}
                    {campaignProgress.status === 'processing' && (
                      <button 
                        type="button" 
                        className="campaign-cancel-btn"
                        onClick={handleCancelCampaign}
                      >
                        <Pause size={14} />
                        <span>Arrêter et annuler la campagne</span>
                      </button>
                    )}
                  </div>

                  {/* Rules of Meta Banner */}
                  <div className="meta-rules-alert">
                    <ShieldAlert size={16} />
                    <div className="rules-content">
                      <h4>Règles de diffusion Meta</h4>
                      <p>Respectez l'opt-out : les numéros marqués comme désabonnés sont filtrés. L'API impose des fenêtres de 24h pour les messages non sollicités.</p>
                    </div>
                  </div>

                  {/* Detailed Log Table Section */}
                  <div className="campaign-logs-section">
                    <div className="logs-section-header">
                      <h3>Journal détaillé des envois</h3>
                      <button 
                        type="button" 
                        className="logs-toggle-btn"
                        onClick={() => setShowLogsTable(!showLogsTable)}
                      >
                        {showLogsTable ? 'Masquer le journal' : 'Afficher le journal'}
                        {showLogsTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>

                    {showLogsTable && (
                      <>
                        <div className="logs-filters">
                          <button 
                            className={`filter-chip ${logsFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setLogsFilter('all')}
                          >
                            Tous ({campaignProgress.results?.length || 0})
                          </button>
                          <button 
                            className={`filter-chip sent ${logsFilter === 'sent' ? 'active' : ''}`}
                            onClick={() => setLogsFilter('sent')}
                          >
                            Réussis ({campaignProgress.progress.sent})
                          </button>
                          <button 
                            className={`filter-chip failed ${logsFilter === 'failed' ? 'active' : ''}`}
                            onClick={() => setLogsFilter('failed')}
                          >
                            Échoués ({campaignProgress.progress.failed})
                          </button>
                          <button 
                            className={`filter-chip pending ${logsFilter === 'pending' ? 'active' : ''}`}
                            onClick={() => setLogsFilter('pending')}
                          >
                            En attente ({campaignProgress.progress.pending})
                          </button>
                        </div>

                        {filteredResults.length === 0 ? (
                          <div className="logs-empty">
                            <span>Aucune ligne correspondante dans le journal.</span>
                          </div>
                        ) : (
                          <div className="logs-table-wrapper scrollbar-thin">
                            <table>
                              <thead>
                                <tr>
                                  <th>Destinataire</th>
                                  <th>Statut</th>
                                  <th>Message ID / Erreur</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredResults.map((item, idx) => (
                                  <tr key={idx}>
                                    <td className="mono">{item.chatId.replace('@c.us', '')}</td>
                                    <td>
                                      <span className={`log-status-badge ${item.status}`}>
                                        {item.status}
                                      </span>
                                    </td>
                                    <td>
                                      {item.status === 'sent' && (
                                        <span className="log-msg-id mono">{item.messageId || 'N/A'}</span>
                                      )}
                                      {item.status === 'failed' && (
                                        <span className="log-msg-error">{item.error?.message || 'Erreur inconnue'}</span>
                                      )}
                                      {item.status === 'pending' && (
                                        <span className="log-msg-pending">En file d'attente</span>
                                      )}
                                      {item.status === 'cancelled' && (
                                        <span className="log-msg-cancelled">Opération annulée</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                </div>
              ) : (
                <div className="response-empty">
                  {activeTab === 'history' ? (
                    <p>Sélectionnez une campagne dans l'historique à gauche pour afficher sa progression et ses logs.</p>
                  ) : (
                    <p>Configurez et lancez une campagne d'envoi en masse pour suivre la progression ici.</p>
                  )}
                </div>
              )}
            </>
          )}

        </div>

      </div>
    </div>
  );
}
