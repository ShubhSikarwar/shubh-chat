import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, writeBatch, Timestamp } from 'firebase/firestore';
import { Message, UserProfile } from '../types';
import { Send, Smile, Paperclip, MoreVertical, Search, Phone, Video, Check, CheckCheck, Clock, Hourglass } from 'lucide-react';
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
    const scrollRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const prevMessagesLength = useRef(0);

    // Listens to Chat Metadata (participants, lastMessage, typing status)
    useEffect(() => {
        if (!chatId || !user) return;

        const unsubscribe = onSnapshot(doc(db, 'chats', chatId), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                setChatData(data);
                const participants = data.participants as string[];
                const otherId = participants.find(id => id !== user.uid);

                // Typing status
                if (otherId) {
                    const typingStatus = data.typing || {};
                    setIsOtherTyping(!!typingStatus[otherId]);
                }
            }
        });

        // Set activeChatId for heartbeat pulse
        const userRef = doc(db, 'users', user.uid);
        updateDoc(userRef, { activeChatId: chatId });

        return () => {
            unsubscribe();
            updateDoc(userRef, { activeChatId: null });
        };
    }, [chatId, user]);

    // Listens to Other User's Profile (presence, photo, name)
    useEffect(() => {
        if (!chatId || !user) return;

        let unsubscribeUser: () => void = () => { };

        const unsubscribeChat = onSnapshot(doc(db, 'chats', chatId), (snapshot) => {
            if (snapshot.exists()) {
                const participants = snapshot.data().participants as string[];
                const otherId = participants.find(id => id !== user.uid);

                if (otherId) {
                    unsubscribeUser(); // Cleanup previous listener if any
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
        if (!chatId) return;

        const q = query(
            collection(db, 'chats', chatId, 'messages'),
            orderBy('timestamp', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));

            // Play sound for incoming message if a new one is added by the other user
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
                    batch.update(msgRef, { status: 'seen' });
                });
                await batch.commit();
            }
        };

        markAsSeen();
    }, [chatId, user, messages]);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const onEmojiClick = (emojiData: any) => {
        setNewMessage(prev => prev + emojiData.emoji);
    };

    const EMOJI_MAP: { [key: string]: string } = {
        ':)': '😊',
        ':(': '😟',
        ':D': '😃',
        ';)': '😉',
        '<3': '❤️',
        ':P': '😛',
        ':p': '😛',
        'B)': '😎',
        ':/': '😕',
        ':O': '😲',
        ':o': '😲',
    };

    const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;

        // Convert text emoticons to emojis
        Object.entries(EMOJI_MAP).forEach(([emoticon, emoji]) => {
            // Only replace if it's the end of a word or separated by spaces
            const escapedEmoticon = emoticon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`${escapedEmoticon}(?=\\s|$)`, 'g');
            value = value.replace(regex, emoji);
        });

        setNewMessage(value);

        if (!user || !chatId) return;

        // Set typing status to true
        await updateDoc(doc(db, 'chats', chatId), {
            [`typing.${user.uid}`]: true
        });

        // Clear existing timeout
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

        // Set timeout to set typing status to false after 2 seconds
        typingTimeoutRef.current = setTimeout(async () => {
            if (chatId) {
                await updateDoc(doc(db, 'chats', chatId), {
                    [`typing.${user.uid}`]: false
                });
            }
        }, 2000);
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user || !chatId) return;

        const messageText = newMessage;
        setNewMessage('');

        // Stop typing immediately on send
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        await updateDoc(doc(db, 'chats', chatId), {
            [`typing.${user.uid}`]: false
        });

        // Add message to subcollection
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
            text: messageText,
            senderId: user.uid,
            timestamp: serverTimestamp(),
            type: 'text',
            status: 'sent'
        });

        // Update last message in chat doc and clear reply promise
        await updateDoc(doc(db, 'chats', chatId), {
            lastMessage: messageText,
            lastMessageTimestamp: serverTimestamp(),
            replyPromise: null
        });

        // Play sent sound
        const audio = new Audio('/sent.mp3');
        audio.play().catch(e => console.log("Audio sent error", e));
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
            <div style={{
                padding: '10px 16px',
                background: 'var(--bg-header)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                height: '60px',
                borderBottom: '1px solid var(--border)'
            }}>
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
                <div style={{ display: 'flex', gap: '20px', color: 'var(--text-dim)' }}>
                    <Video size={20} />
                    <Phone size={20} />
                    <Search size={20} />
                    <MoreVertical size={20} />
                </div>
            </div>

            {/* Messages Map Area */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 5%',
                backgroundImage: 'linear-gradient(rgba(11, 20, 26, 0.95), rgba(11, 20, 26, 0.95)), url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
            }}>
                {messages.map(msg => (
                    <div key={msg.id} style={{
                        display: 'flex',
                        justifyContent: msg.senderId === user?.uid ? 'flex-end' : 'flex-start',
                        marginBottom: '4px'
                    }}>
                        <div style={{
                            maxWidth: '65%',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            fontSize: '14.5px',
                            position: 'relative',
                            background: msg.senderId === user?.uid ? 'var(--message-sent)' : 'var(--message-received)',
                            boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
                        }}>
                            {msg.text}
                            <div style={{
                                fontSize: '10px',
                                color: 'rgba(255,255,255,0.5)',
                                textAlign: 'right',
                                marginTop: '4px'
                            }}>
                                {msg.timestamp && new Date(msg.timestamp.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {msg.senderId === user?.uid && (
                                    <span style={{ marginLeft: '4px' }}>
                                        {msg.status === 'seen' ? (
                                            <CheckCheck size={16} color="#53bdeb" />
                                        ) : (
                                            <Check size={16} color="rgba(255,255,255,0.5)" />
                                        )}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={scrollRef} />
            </div>

            {/* Input Area */}
            <div style={{
                padding: '8px 16px',
                background: 'var(--bg-header)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                position: 'relative'
            }}>
                {showPromiseMenu && (
                    <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '16px',
                        background: 'var(--bg-sidebar)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '8px',
                        boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        zIndex: 10
                    }}>
                        <p style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '4px 8px' }}>Promise to reply:</p>
                        {[
                            { label: 'in 10 mins', mins: 10 },
                            { label: 'in 1 hour', mins: 60 },
                            { label: 'tonight', mins: 240 },
                            { label: 'Clear', mins: 0 }
                        ].map(opt => (
                            <button
                                key={opt.label}
                                onClick={async () => {
                                    if (opt.mins === 0) {
                                        await updateDoc(doc(db, 'chats', chatId), { replyPromise: null });
                                    } else {
                                        const deadline = new Date(Date.now() + opt.mins * 60000);
                                        await updateDoc(doc(db, 'chats', chatId), {
                                            replyPromise: {
                                                uid: user?.uid,
                                                deadline: Timestamp.fromDate(deadline),
                                                label: opt.label
                                            }
                                        });
                                    }
                                    setShowPromiseMenu(false);
                                }}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    textAlign: 'left',
                                    fontSize: '13px',
                                    color: 'var(--text-primary)',
                                    background: 'transparent',
                                    cursor: 'pointer'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-active)'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                )}
                <Clock
                    color={chatData?.replyPromise?.uid === user?.uid ? 'var(--accent)' : "var(--text-dim)"}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setShowPromiseMenu(!showPromiseMenu)}
                />
                <div style={{ position: 'relative' }}>
                    <Smile
                        color={showEmojiPicker ? 'var(--accent)' : "var(--text-dim)"}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    />
                    {showEmojiPicker && (
                        <div ref={emojiPickerRef} style={{ position: 'absolute', bottom: '50px', left: '0', zIndex: 1000 }}>
                            <EmojiPicker onEmojiClick={onEmojiClick} theme={'dark' as any} />
                        </div>
                    )}
                </div>
                <Paperclip color="var(--text-dim)" style={{ cursor: 'pointer' }} />
                <form onSubmit={handleSend} style={{ flex: 1 }}>
                    <input
                        type="text"
                        placeholder="Type a message"
                        value={newMessage}
                        onChange={handleInputChange}
                        style={{
                            width: '100%',
                            background: 'var(--bg-active)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '10px 16px',
                            color: 'var(--text-primary)',
                            fontSize: '15px'
                        }}
                    />
                </form>
                <button onClick={handleSend}>
                    <Send color={newMessage.trim() ? 'var(--accent)' : 'var(--text-dim)'} />
                </button>
            </div>
        </div>
    );
};
