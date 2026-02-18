import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { UserProfile, Chat } from '../types';
import { LogOut, Search, MessageSquarePlus, UserPlus, Check, X } from 'lucide-react';

export const Sidebar: React.FC<{ onSelectChat: (chatId: string) => void }> = ({ onSelectChat }) => {
    const { user, logout } = useAuth();
    const [chats, setChats] = useState<(Chat & { otherUser?: UserProfile })[]>([]);
    const [searchEmail, setSearchEmail] = useState('');
    const [searchResults, setSearchResults] = useState<UserProfile[]>([]);


    useEffect(() => {
        if (!user) return;

        // Listen to chats where user is a participant
        const q = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', user.uid)
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const chatData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Chat));

            // Fetch details for other participants
            const chatsWithUsers = await Promise.all(chatData.map(async (chat) => {
                const otherId = chat.participants.find(id => id !== user.uid);
                if (!otherId) return chat;

                // This is a bit inefficient (N queries), but for this demo it's fine.
                // In production, you'd cache user profiles or denormalize data.
                const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', otherId)));
                const otherUser = userSnap.docs[0]?.data() as UserProfile;
                return { ...chat, otherUser };
            }));

            setChats(chatsWithUsers.sort((a, b) =>
                (b.lastMessageTimestamp?.toMillis() || 0) - (a.lastMessageTimestamp?.toMillis() || 0)
            ));
        });

        return unsubscribe;
    }, [user]);

    const handleSearch = async () => {
        if (!searchEmail.trim() || searchEmail === user?.email) return;

        const q = query(collection(db, 'users'), where('email', '==', searchEmail));
        const snap = await getDocs(q);
        setSearchResults(snap.docs.map(doc => doc.data() as UserProfile));

    };

    const sendRequest = async (targetUser: UserProfile) => {
        // Check if chat already exists
        const existing = chats.find(c => c.participants.includes(targetUser.uid));
        if (existing) {
            alert("Chat/Request already exists!");
            return;
        }

        await addDoc(collection(db, 'chats'), {
            participants: [user!.uid, targetUser.uid],
            status: 'pending',
            requestedBy: user!.uid,
            lastMessage: 'Chat request sent',
            lastMessageTimestamp: serverTimestamp()
        });
        setSearchEmail('');
        setSearchResults([]);
    };

    const approveRequest = async (chatId: string) => {
        await updateDoc(doc(db, 'chats', chatId), {
            status: 'accepted',
            lastMessage: 'Request accepted',
            lastMessageTimestamp: serverTimestamp()
        });
    };

    return (
        <div style={{
            width: '30%',
            minWidth: '350px',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-sidebar)'
        }}>
            {/* Header */}
            <div style={{
                padding: '10px 16px',
                background: 'var(--bg-header)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                height: '60px'
            }}>
                <img src={user?.photoURL || ''} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                <div style={{ display: 'flex', gap: '16px', color: 'var(--text-secondary)' }}>
                    <MessageSquarePlus size={24} style={{ cursor: 'pointer' }} />
                    <LogOut size={24} onClick={logout} style={{ cursor: 'pointer' }} />
                </div>
            </div>

            {/* Search */}
            <div style={{ padding: '8px 12px' }}>
                <div style={{
                    background: 'var(--bg-active)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    height: '35px'
                }}>
                    <Search size={18} color="var(--text-dim)" />
                    <input
                        type="text"
                        placeholder="Search email to start chat..."
                        value={searchEmail}
                        onChange={(e) => setSearchEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-primary)',
                            marginLeft: '12px',
                            width: '100%',
                            fontSize: '14px'
                        }}
                    />
                </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
                <div style={{ padding: '10px', background: 'var(--bg-active)' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>User found:</p>
                    {searchResults.map(u => (
                        <div key={u.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <img src={u.photoURL || ''} style={{ width: '30px', height: '30px', borderRadius: '50%' }} />
                                <span style={{ fontSize: '14px' }}>{u.displayName}</span>
                            </div>
                            <button onClick={() => sendRequest(u)} style={{ color: 'var(--accent)' }}>
                                <UserPlus size={20} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Chat List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {chats.map(chat => (
                    <div
                        key={chat.id}
                        onClick={() => chat.status === 'accepted' && onSelectChat(chat.id)}
                        style={{
                            padding: '12px 16px',
                            display: 'flex',
                            gap: '12px',
                            cursor: chat.status === 'accepted' ? 'pointer' : 'default',
                            borderBottom: '1px solid var(--border)',
                            transition: 'background 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-active)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <img src={chat.otherUser?.photoURL || ''} style={{ width: '48px', height: '48px', borderRadius: '50%' }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: '500' }}>{chat.otherUser?.displayName}</span>
                                {chat.lastMessageTimestamp && (
                                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                                        {new Date(chat.lastMessageTimestamp.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {chat.status === 'pending' ? (chat.requestedBy === user?.uid ? 'Pending approval' : 'Wants to chat') : chat.lastMessage}
                                </p>
                                {chat.status === 'pending' && chat.requestedBy !== user?.uid && (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={(e) => { e.stopPropagation(); approveRequest(chat.id); }} style={{ color: 'var(--accent)' }}>
                                            <Check size={18} />
                                        </button>
                                        <button style={{ color: '#ef4444' }}>
                                            <X size={18} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
