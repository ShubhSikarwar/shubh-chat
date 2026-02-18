import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../firebase';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    doc,
    updateDoc,
    writeBatch,
    Timestamp,
    deleteDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Message, UserProfile } from '../types';
import {
    Send,
    Smile,
    Paperclip,
    MoreVertical,
    Search,
    Phone,
    Video,
    Check,
    CheckCheck,
    Clock,
    Hourglass,
    Flame,
    BellRing
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

export const ChatWindow: React.FC<{ chatId: string }> = ({ chatId }) => {
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
    const [isOtherTyping, setIsOtherTyping] = useState(false);
    const [chatData, setChatData] = useState<any>(null);
    const [showPromiseMenu, setShowPromiseMenu] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isSelfDestructActive, setIsSelfDestructActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [activeReactionId, setActiveReactionId] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const scrollRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const prevMessagesLength = useRef(0);

    // Update current time every second for countdowns
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Listens to Chat Metadata
    useEffect(() => {
        if (!chatId || !user) return;

        const unsubscribe = onSnapshot(doc(db, 'chats', chatId), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                setChatData(data);
                const participants = data.participants as string[];
                const otherId = participants.find(id => id !== user.uid);

                if (otherId) {
                    const typingStatus = data.typing || {};
                    setIsOtherTyping(!!typingStatus[otherId]);
                }
            }
        });

        const userRef = doc(db, 'users', user.uid);
        updateDoc(userRef, { activeChatId: chatId });

        return () => {
            unsubscribe();
            updateDoc(userRef, { activeChatId: null });
        };
    }, [chatId, user]);

    // Listens to Other User's Profile
    useEffect(() => {
        if (!chatId || !user) return;

        let unsubscribeUser: () => void = () => { };

        const unsubscribeChat = onSnapshot(doc(db, 'chats', chatId), (snapshot) => {
            if (snapshot.exists()) {
                const participants = snapshot.data().participants as string[];
                const otherId = participants.find(id => id !== user.uid);

                if (otherId) {
                    unsubscribeUser();
                    unsubscribeUser = onSnapshot(doc(db, 'users', otherId), (userSnap) => {
                        setOtherUser(userSnap.data() as UserProfile);
                    });
                }
            }
        });

        return () => {
            unsubscribeChat();
            unsubscribeUser();
        };
    }, [chatId, user]);

    // Listens to Messages
    useEffect(() => {
        if (!chatId || !user) return;

        const q = query(
            collection(db, 'chats', chatId, 'messages'),
            orderBy('timestamp', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));

            if (newMessages.length > prevMessagesLength.current && prevMessagesLength.current > 0) {
                const lastMsg = newMessages[newMessages.length - 1];
                if (lastMsg.senderId !== user?.uid) {
                    const audio = new Audio('/notification.mp3');
                    audio.play().catch(e => console.log("Audio receive error", e));
                }
            }

            setMessages(newMessages);
            prevMessagesLength.current = newMessages.length;
        });

        return unsubscribe;
    }, [chatId, user]);

    // Mark messages as seen
    useEffect(() => {
        if (!chatId || !user || messages.length === 0) return;

        const markAsSeen = async () => {
            const unseenMessages = messages.filter(
                (msg) => msg.senderId !== user.uid && msg.status !== 'seen'
            );

            if (unseenMessages.length > 0) {
                const batch = writeBatch(db);
                unseenMessages.forEach((msg) => {
                    const msgRef = doc(db, 'chats', chatId, 'messages', msg.id);
                    batch.update(msgRef, {
                        status: 'seen',
                        seenAt: serverTimestamp()
                    });
                });
                await batch.commit();
            }
        };

        markAsSeen();
    }, [chatId, user, messages]);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle self-destruct background deletion
    useEffect(() => {
        const interval = setInterval(() => {
            messages.forEach(async (msg) => {
                if (msg.isSelfDestruct && msg.seenAt) {
                    const elapsed = (Date.now() - msg.seenAt.toMillis()) / 1000;
                    if (elapsed >= (msg.selfDestructTime || 20)) {
                        await deleteDoc(doc(db, 'chats', chatId, 'messages', msg.id));
                    }
                }
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [messages, chatId]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
            if (!(event.target as HTMLElement).closest('.reaction-picker')) {
                setActiveReactionId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const onEmojiClick = (emojiData: any) => {
        setNewMessage(prev => prev + emojiData.emoji);
    };

    const EMOJI_MAP: { [key: string]: string } = {
        ':)': '😊', ':(': '😟', ':D': '😃', ';)': '😉', '<3': '❤️', ':P': '😛', ':p': '😛', 'B)': '😎', ':/': '😕', ':O': '😲', ':o': '😲',
    };

    const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;
        Object.entries(EMOJI_MAP).forEach(([emoticon, emoji]) => {
            const escapedEmoticon = emoticon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`${escapedEmoticon}(?=\\s|$)`, 'g');
            value = value.replace(regex, emoji);
        });
        setNewMessage(value);

        if (!user || !chatId) return;
        await updateDoc(doc(db, 'chats', chatId), { [`typing.${user.uid}`]: true });
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(async () => {
            if (chatId) await updateDoc(doc(db, 'chats', chatId), { [`typing.${user.uid}`]: false });
        }, 2000);
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user || !chatId) return;

        const messageText = newMessage;
        setNewMessage('');
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        await updateDoc(doc(db, 'chats', chatId), { [`typing.${user.uid}`]: false });

        await addDoc(collection(db, 'chats', chatId, 'messages'), {
            text: messageText,
            senderId: user.uid,
            timestamp: serverTimestamp(),
            type: 'text',
            status: 'sent',
            isSelfDestruct: isSelfDestructActive,
            selfDestructTime: isSelfDestructActive ? 20 : null
        });

        await updateDoc(doc(db, 'chats', chatId), {
            lastMessage: isSelfDestructActive ? '🔥 Secret Message' : messageText,
            lastMessageTimestamp: serverTimestamp(),
            replyPromise: null
        });

        const audio = new Audio('/sent.mp3');
        audio.play().catch(e => console.log("Audio sent error", e));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user || !chatId) return;
        setUploading(true);
        try {
            const fileRef = ref(storage, `chats/${chatId}/${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            const url = await getDownloadURL(fileRef);
            await addDoc(collection(db, 'chats', chatId, 'messages'), {
                text: '📷 Photo',
                senderId: user.uid,
                timestamp: serverTimestamp(),
                type: 'image',
                status: 'sent',
                fileUrl: url,
                fileName: file.name
            });
            await updateDoc(doc(db, 'chats', chatId), {
                lastMessage: '📷 Photo',
                lastMessageTimestamp: serverTimestamp()
            });
        } catch (error) {
            console.error("Upload failed", error);
        } finally {
            setUploading(false);
        }
    };

    const handleReaction = async (msgId: string, emoji: string) => {
        if (!user || !chatId) return;
        const msgRef = doc(db, 'chats', chatId, 'messages', msgId);
        await updateDoc(msgRef, { [`reactions.${user.uid}`]: emoji });
        setActiveReactionId(null);
    };

    const handleBuzz = async () => {
        if (!user || !chatId) return;

        const now = Timestamp.now();
        const oneMinAgo = now.toMillis() - 1 * 60 * 1000;

        const myLastBuzzes = chatData?.lastBuzzes?.[user.uid] || [];
        const recentBuzzes = myLastBuzzes.filter((t: any) => (t.toMillis ? t.toMillis() : t.seconds * 1000) > oneMinAgo);

        if (recentBuzzes.length >= 1) {
            alert("Slow down! You can only buzz once per minute.");
            return;
        }

        const newBuzzes = [...recentBuzzes, now];

        await updateDoc(doc(db, 'chats', chatId), {
            buzz: {
                senderId: user.uid,
                timestamp: now
            },
            [`lastBuzzes.${user.uid}`]: newBuzzes
        });
    };

    if (!chatId) return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-chat)' }}>
            <div style={{ textAlign: 'center', opacity: 0.5 }}>
                <img src="https://abs.twimg.com/emoji/v2/72x72/1f4ac.png" alt="Select chat" width="100" />
                <h2>Shubh Chat</h2>
                <p>Select a chat to start messaging</p>
            </div>
        </div>
    );

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-chat)', position: 'relative' }}>
            {/* Chat Header */}
            <div style={{ padding: '10px 16px', background: 'var(--bg-header)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '60px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className={otherUser?.activeChatId === chatId ? 'pulse-avatar' : ''} style={{ borderRadius: '50%', padding: '2px' }}>
                        <img src={otherUser?.photoURL || ''} style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'block' }} />
                    </div>
                    <div>
                        <h3 style={{ fontSize: '16px', fontWeight: '500' }}>{otherUser?.displayName}</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <p style={{ fontSize: '12px', color: isOtherTyping ? 'var(--accent)' : 'var(--text-secondary)' }}>
                                {isOtherTyping ? 'typing...' : (otherUser?.status === 'online' ? 'online' : 'offline')}
                            </p>
                            {chatData?.replyPromise && chatData.replyPromise.uid === otherUser?.uid && (
                                <div className="focus-bridge-badge">
                                    <Hourglass size={12} />
                                    <span>Will reply {chatData.replyPromise.label}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '20px', color: 'var(--text-dim)', alignItems: 'center' }}>
                    <button
                        onClick={handleBuzz}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(255, 193, 7, 0.1)',
                            color: '#ffc107',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            border: '1px solid rgba(255, 193, 7, 0.3)',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 193, 7, 0.2)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 193, 7, 0.1)'}
                    >
                        <BellRing size={16} />
                        BUZZ
                    </button>
                    <Video size={20} /> <Phone size={20} /> <Search size={20} /> <MoreVertical size={20} />
                </div>
            </div>

            {/* Messages Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 5%', backgroundImage: 'linear-gradient(rgba(11, 20, 26, 0.95), rgba(11, 20, 26, 0.95)), url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}>
                {messages.map(msg => (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: msg.senderId === user?.uid ? 'flex-end' : 'flex-start', marginBottom: '15px', position: 'relative' }}>
                        <div
                            onDoubleClick={() => setActiveReactionId(msg.id)}
                            style={{ maxWidth: '65%', padding: '6px 10px', borderRadius: '8px', fontSize: '14.5px', position: 'relative', background: msg.senderId === user?.uid ? 'var(--message-sent)' : 'var(--message-received)', boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)' }}
                        >
                            {activeReactionId === msg.id && (
                                <div className="reaction-picker" style={{ left: msg.senderId === user?.uid ? 'auto' : '0', right: msg.senderId === user?.uid ? '0' : 'auto' }}>
                                    {['❤️', '👍', '😂', '😮', '😢', '🔥'].map(emoji => (
                                        <span key={emoji} className="reaction-item" onClick={() => handleReaction(msg.id, emoji)}>{emoji}</span>
                                    ))}
                                </div>
                            )}
                            {msg.isSelfDestruct && msg.seenAt && (
                                <div className="self-destruct-timer">
                                    <Flame size={12} />
                                    <span>Destructing in {Math.max(0, Math.floor(20 - (currentTime - msg.seenAt.toMillis()) / 1000))}s</span>
                                </div>
                            )}
                            {msg.type === 'image' && msg.fileUrl && (
                                <img src={msg.fileUrl} alt="sent" className="message-image" onClick={() => window.open(msg.fileUrl)} />
                            )}
                            <div style={{ wordBreak: 'break-word' }}>{msg.text}</div>
                            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                <div className="reaction-container">
                                    {Object.entries(msg.reactions).slice(0, 3).map(([uid, emoji]) => <span key={uid}>{emoji as React.ReactNode}</span>)}
                                    {Object.keys(msg.reactions).length > 1 && <span style={{ fontSize: '10px', marginLeft: '2px' }}>{Object.keys(msg.reactions).length}</span>}
                                </div>
                            )}
                            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textAlign: 'right', marginTop: '4px' }}>
                                {msg.timestamp && new Date(msg.timestamp.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {msg.senderId === user?.uid && (
                                    <span style={{ marginLeft: '4px' }}>
                                        {msg.status === 'seen' ? <CheckCheck size={16} color="#53bdeb" /> : <Check size={16} color="rgba(255,255,255,0.5)" />}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={scrollRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: '8px 16px', background: 'var(--bg-header)', display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
                {showPromiseMenu && (
                    <div style={{ position: 'absolute', bottom: '100%', left: '16px', background: 'var(--bg-sidebar)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', boxShadow: '0 -4px 12px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 10 }}>
                        {[{ label: 'in 10 mins', mins: 10 }, { label: 'in 1 hour', mins: 60 }, { label: 'tonight', mins: 240 }, { label: 'Clear', mins: 0 }].map(opt => (
                            <button key={opt.label} onClick={async () => {
                                if (opt.mins === 0) await updateDoc(doc(db, 'chats', chatId), { replyPromise: null });
                                else {
                                    const deadline = new Date(Date.now() + opt.mins * 60000);
                                    await updateDoc(doc(db, 'chats', chatId), { replyPromise: { uid: user?.uid, deadline: Timestamp.fromDate(deadline), label: opt.label } });
                                }
                                setShowPromiseMenu(false);
                            }} style={{ padding: '8px 12px', borderRadius: '4px', textAlign: 'left', fontSize: '13px', color: 'var(--text-primary)', background: 'transparent', cursor: 'pointer' }}>{opt.label}</button>
                        ))}
                    </div>
                )}
                <Clock color={chatData?.replyPromise?.uid === user?.uid ? 'var(--accent)' : "var(--text-dim)"} style={{ cursor: 'pointer' }} onClick={() => setShowPromiseMenu(!showPromiseMenu)} />
                <Flame size={22} className={isSelfDestructActive ? 'self-destruct-toggle' : ''} style={{ cursor: 'pointer', color: isSelfDestructActive ? '#ff4b4b' : 'var(--text-dim)' }} onClick={() => setIsSelfDestructActive(!isSelfDestructActive)} />
                <div style={{ position: 'relative' }}>
                    <Smile color={showEmojiPicker ? 'var(--accent)' : "var(--text-dim)"} style={{ cursor: 'pointer' }} onClick={() => setShowEmojiPicker(!showEmojiPicker)} />
                    {showEmojiPicker && <div ref={emojiPickerRef} style={{ position: 'absolute', bottom: '50px', left: '0', zIndex: 1000 }}><EmojiPicker onEmojiClick={onEmojiClick} theme={'dark' as any} /></div>}
                </div>
                <div style={{ position: 'relative' }}>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*" />
                    <Paperclip color={uploading ? 'var(--accent)' : "var(--text-dim)"} style={{ cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()} />
                </div>
                <form onSubmit={handleSend} style={{ flex: 1 }}>
                    <input type="text" placeholder={isSelfDestructActive ? "Secret Message (20s)" : "Type a message"} value={newMessage} onChange={handleInputChange} style={{ width: '100%', background: 'var(--bg-active)', border: 'none', borderRadius: '8px', padding: '10px 16px', color: isSelfDestructActive ? '#ff4b4b' : 'var(--text-primary)', fontSize: '15px' }} />
                </form>
                <button onClick={handleSend}><Send color={newMessage.trim() ? 'var(--accent)' : 'var(--text-dim)'} /></button>
            </div>
        </div>
    );
};
