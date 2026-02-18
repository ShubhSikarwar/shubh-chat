import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { db } from './firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { Chat, UserProfile } from './types';

const MainApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [buzzNotification, setBuzzNotification] = useState<{ senderName: string, id: string } | null>(null);

  // Global Buzz Listener
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'modified') {
          const data = { id: change.doc.id, ...change.doc.data() } as Chat;

          if (data.buzz && data.buzz.senderId !== user.uid) {
            const buzzTime = data.buzz.timestamp?.toMillis() || 0;
            const isFresh = Math.abs(Date.now() - buzzTime) < 5000;

            if (isFresh && !isShaking) {
              // Trigger shake effect globally (2.5 seconds)
              setIsShaking(true);
              const audio = new Audio('/notification.mp3');
              audio.play().catch(e => console.log("Global buzz audio error", e));

              // Find sender name for popup
              const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', data.buzz.senderId)));
              const senderData = userSnap.docs[0]?.data() as UserProfile;

              setBuzzNotification({ senderName: senderData?.displayName || 'Someone', id: data.id });

              setTimeout(() => setBuzzNotification(null), 2500);
              setTimeout(() => setIsShaking(false), 2500);
            }
          }
        }
      });
    });

    return unsubscribe;
  }, [user, isShaking]);

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
      {buzzNotification && (
        <div
          onClick={() => {
            setActiveChatId(buzzNotification.id);
            setBuzzNotification(null);
          }}
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--accent)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '30px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            animation: 'fadeIn 0.3s ease-out'
          }}
        >
          <span style={{ fontSize: '18px' }}>🔔</span>
          <span style={{ fontWeight: 'bold' }}>{buzzNotification.senderName} is buzzing you!</span>
        </div>
      )}
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
