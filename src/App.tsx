import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { VideoCallReceiver } from './components/VideoCallReceiver';
import { db } from './firebase';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Chat, UserProfile } from './types';
import { Phone, PhoneOff, Video } from 'lucide-react';

const MainApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [buzzNotification, setBuzzNotification] = useState<{ senderName: string, id: string } | null>(null);

  // Incoming call state
  const [incomingCall, setIncomingCall] = useState<{
    chatId: string;
    callerName: string;
    callerUid: string;
    offer: any;
  } | null>(null);
  const [acceptedCall, setAcceptedCall] = useState<typeof incomingCall | null>(null);
  const incomingRingRef = useRef<HTMLAudioElement | null>(null);

  // Global Buzz + Incoming Call Listener
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

          // Handle buzz
          if (data.buzz && data.buzz.senderId !== user.uid) {
            const buzzTime = data.buzz.timestamp?.toMillis() || 0;
            const isFresh = Math.abs(Date.now() - buzzTime) < 5000;
            if (isFresh && !isShaking) {
              setIsShaking(true);
              const audio = new Audio('/notification.mp3');
              audio.play().catch(() => { });
              const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', data.buzz.senderId)));
              const senderData = userSnap.docs[0]?.data() as UserProfile;
              setBuzzNotification({ senderName: senderData?.displayName || 'Someone', id: data.id });
              setTimeout(() => setBuzzNotification(null), 2500);
              setTimeout(() => setIsShaking(false), 2500);
            }
          }

          // Handle incoming call
          if (data.call &&
            data.call.status === 'calling' &&
            data.call.callerId !== user.uid &&
            !incomingCall &&
            !acceptedCall
          ) {
            const callTime = data.call.timestamp?.toMillis() || 0;
            const isRecentCall = Math.abs(Date.now() - callTime) < 35000;
            if (isRecentCall) {
              setIncomingCall({
                chatId: data.id,
                callerName: data.call.callerName || 'Someone',
                callerUid: data.call.callerId,
                offer: data.call.offer,
              });
              incomingRingRef.current = new Audio('/notification.mp3');
              incomingRingRef.current.loop = true;
              incomingRingRef.current.play().catch(() => { });
            }
          }

          // Auto-dismiss popup if caller hung up
          if (incomingCall && data.id === incomingCall.chatId) {
            if (data.call?.status === 'ended' || data.call?.status === 'missed') {
              setIncomingCall(null);
              incomingRingRef.current?.pause();
            }
          }
        }
      });
    });

    return unsubscribe;
  }, [user, isShaking, incomingCall, acceptedCall]);

  const acceptCall = () => {
    if (!incomingCall) return;
    incomingRingRef.current?.pause();
    setAcceptedCall(incomingCall);
    setActiveChatId(incomingCall.chatId);
    setIncomingCall(null);
  };

  const declineCall = async () => {
    if (!incomingCall || !user) return;
    incomingRingRef.current?.pause();
    await updateDoc(doc(db, 'chats', incomingCall.chatId), { 'call.status': 'missed' });
    await addDoc(collection(db, 'chats', incomingCall.chatId, 'messages'), {
      text: `📹 Missed video call from ${incomingCall.callerName}`,
      senderId: incomingCall.callerUid,
      timestamp: serverTimestamp(),
      type: 'text',
      status: 'sent',
    });
    setIncomingCall(null);
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ width: '50px', height: '50px', border: '3px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className={`app-container ${isShaking ? 'shake' : ''}`}>
      {/* Buzz Notification */}
      {buzzNotification && (
        <div
          onClick={() => { setActiveChatId(buzzNotification.id); setBuzzNotification(null); }}
          style={{
            position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--accent)', color: 'white', padding: '12px 24px',
            borderRadius: '30px', boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
            zIndex: 9999, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '18px' }}>🔔</span>
          <span style={{ fontWeight: 'bold' }}>{buzzNotification.senderName} is buzzing you!</span>
        </div>
      )}

      {/* Incoming Call Popup */}
      {incomingCall && (
        <div style={{
          position: 'absolute', top: '20px', right: '20px',
          background: '#1a1f2e', borderRadius: '16px', padding: '20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 9999,
          minWidth: '260px', border: '1px solid rgba(255,255,255,0.1)',
          animation: 'slideInRight 0.3s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #6366f1', animation: 'callPulse 1.5s ease-in-out infinite', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Video size={20} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 'bold', color: 'white', fontSize: '15px' }}>{incomingCall.callerName}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>Incoming video call...</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button onClick={declineCall} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 'bold' }}>
              <PhoneOff size={16} /> Decline
            </button>
            <button onClick={acceptCall} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: '#22c55e', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 'bold' }}>
              <Phone size={16} /> Accept
            </button>
          </div>
        </div>
      )}

      {/* Receiver Video Call Screen */}
      {acceptedCall && (
        <VideoCallReceiver
          chatId={acceptedCall.chatId}
          currentUser={user}
          callerName={acceptedCall.callerName}
          offer={acceptedCall.offer}
          onClose={() => setAcceptedCall(null)}
        />
      )}

      <Sidebar onSelectChat={(id) => setActiveChatId(id)} />
      <ChatWindow chatId={activeChatId || ''} />

      <style>{`
                @keyframes callPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.5); }
                    50% { box-shadow: 0 0 0 10px rgba(99,102,241,0); }
                }
                @keyframes slideInRight {
                    from { transform: translateX(120%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
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
