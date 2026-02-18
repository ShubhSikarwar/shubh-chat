import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Message, UserProfile } from '../types';
import { Send, Smile, Paperclip, MoreVertical, Search, Phone, Video, Check, CheckCheck } from 'lucide-react';
import { writeBatch } from 'firebase/firestore';

export const ChatWindow: React.FC<{ chatId: string }> = ({ chatId }) => {
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chatId) return;

        // Fetch other user info
        const fetchChatInfo = async () => {
            const chatSnap = await getDoc(doc(db, 'chats', chatId));
            if (chatSnap.exists()) {
                const participants = chatSnap.data().participants as string[];
                const otherId = participants.find(id => id !== user?.uid);
                if (otherId) {
                    const userSnap = await getDoc(doc(db, 'users', otherId));
                    setOtherUser(userSnap.data() as UserProfile);
                }
            }
        };
        fetchChatInfo();

        // Listen to messages
        const q = query(
            collection(db, 'chats', chatId, 'messages'),
            orderBy('timestamp', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
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

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const messageText = newMessage;
        setNewMessage('');

        // Add message to subcollection
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
            text: messageText,
            senderId: user?.uid,
            timestamp: serverTimestamp(),
            type: 'text',
            status: 'sent'
        });

        // Update last message in chat doc
        await updateDoc(doc(db, 'chats', chatId), {
            lastMessage: messageText,
            lastMessageTimestamp: serverTimestamp()
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
                    <img src={otherUser?.photoURL || ''} style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                    <div>
                        <h3 style={{ fontSize: '16px', fontWeight: '500' }}>{otherUser?.displayName}</h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {otherUser?.status === 'online' ? 'online' : 'offline'}
                        </p>
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
                gap: '12px'
            }}>
                <Smile color="var(--text-dim)" style={{ cursor: 'pointer' }} />
                <Paperclip color="var(--text-dim)" style={{ cursor: 'pointer' }} />
                <form onSubmit={handleSend} style={{ flex: 1 }}>
                    <input
                        type="text"
                        placeholder="Type a message"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
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
