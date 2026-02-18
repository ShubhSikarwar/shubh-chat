import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { db } from './firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Chat } from './types';

const MainApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);

  // Global Buzz Listener: When someone buzzes User A, User A is moved to that chat automatically.
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const data = { id: change.doc.id, ...change.doc.data() } as Chat;

          if (data.buzz && data.buzz.senderId !== user.uid) {
            const buzzTime = data.buzz.timestamp?.toMillis() || 0;
            // Use a wider window (5s) for freshness to account for potential clock skew
            const isFresh = Math.abs(Date.now() - buzzTime) < 5000;

            if (isFresh) {
              // Trigger shake effect globally
              setIsShaking(true);
              const audio = new Audio('/notification.mp3');
              audio.play().catch(e => console.log("Global buzz audio error", e));
              setTimeout(() => setIsShaking(false), 1000);

              if (activeChatId !== data.id) {
                setActiveChatId(data.id);
              }
            }
          }
        }
      });
    });

    return unsubscribe;
  }, [user, activeChatId]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ width: '50px', height: '50px', border: '3px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className={`app-container ${isShaking ? 'shake' : ''}`}>
      <Sidebar onSelectChat={(id) => setActiveChatId(id)} />
      <ChatWindow chatId={activeChatId || ''} />
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
