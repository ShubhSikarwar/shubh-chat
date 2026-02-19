import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import {
    doc,
    updateDoc,
    onSnapshot,
    addDoc,
    collection,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';
import SimplePeer from 'simple-peer';
import {
    Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, X, PhoneMissed, CameraOff
} from 'lucide-react';
import { UserProfile } from '../types';
import { User } from 'firebase/auth';

interface VideoCallProps {
    chatId: string;
    currentUser: User;
    otherUser: UserProfile;
    onClose: () => void;
}

/** Try to get user media with graceful fallbacks */
async function getLocalStream(): Promise<MediaStream | null> {
    // 1. Try video + audio
    try {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e1) {
        console.warn("Video+Audio failed:", e1);
    }
    // 2. Try audio only
    try {
        return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    } catch (e2) {
        console.warn("Audio-only also failed:", e2);
    }
    // 3. Return null — proceed without local media
    return null;
}

export const VideoCall: React.FC<VideoCallProps> = ({ chatId, currentUser, otherUser, onClose }) => {
    const [callStatus, setCallStatus] = useState<'calling' | 'active' | 'ended' | 'missed'>('calling');
    const [isMuted, setIsMuted] = useState(false);
    const [isCamOff, setIsCamOff] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [noCamera, setNoCamera] = useState(false);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const peerRef = useRef<SimplePeer.Instance | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const callStartTimeRef = useRef<number | null>(null);
    const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
    const missedCallTimerRef = useRef<NodeJS.Timeout | null>(null);
    const callStatusRef = useRef<string>('calling');
    const peerAnsweredRef = useRef(false);

    useEffect(() => {
        const init = async () => {
            const stream = await getLocalStream();
            if (!stream) {
                setNoCamera(true);
                console.warn("Proceeding without local media stream.");
            } else {
                localStreamRef.current = stream;
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            }
            await initiateCall(stream);
        };
        init();
        return () => cleanup();
    }, []);

    // Listen for answer from receiver
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'chats', chatId), (snap) => {
            const data = snap.data();
            if (!data?.call) return;
            const call = data.call;

            // Receiver answered — apply their SDP answer to our peer
            if (call.status === 'active' && call.answer && peerRef.current && !peerAnsweredRef.current) {
                peerAnsweredRef.current = true;
                if (missedCallTimerRef.current) clearTimeout(missedCallTimerRef.current);
                try {
                    console.log("Caller: applying receiver's answer");
                    peerRef.current.signal(call.answer);
                } catch (e) {
                    console.error("Signal answer error:", e);
                }
            }

            if (call.status === 'ended' && callStatusRef.current !== 'ended') {
                callStatusRef.current = 'ended';
                setCallStatus('ended');
                cleanup();
                setTimeout(onClose, 1500);
            }
            if (call.status === 'missed' && callStatusRef.current !== 'missed') {
                callStatusRef.current = 'missed';
                setCallStatus('missed');
                cleanup();
                setTimeout(onClose, 2500);
            }
        });
        return unsubscribe;
    }, [chatId]);

    const formatDuration = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const initiateCall = async (stream: MediaStream | null) => {
        // Write call metadata first (no offer yet)
        await updateDoc(doc(db, 'chats', chatId), {
            call: {
                callerId: currentUser.uid,
                callerName: currentUser.displayName || 'Someone',
                status: 'calling',
                offer: null,
                answer: null,
                timestamp: Timestamp.now(),
            }
        });

        // Create WebRTC peer
        const peerConfig: SimplePeer.Options = {
            initiator: true,
            trickle: false,
            ...(stream ? { stream } : {}),
        };
        const peer = new SimplePeer(peerConfig);

        // When offer is ready, write to Firestore
        peer.on('signal', async (offerSignal) => {
            console.log("Caller: offer generated, writing to Firestore");
            await updateDoc(doc(db, 'chats', chatId), { 'call.offer': offerSignal });
        });

        peer.on('stream', (remoteStream) => {
            console.log("Caller: received remote stream");
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
            if (callStatusRef.current !== 'active') {
                callStatusRef.current = 'active';
                setCallStatus('active');
                callStartTimeRef.current = Date.now();
                durationTimerRef.current = setInterval(() => {
                    setCallDuration(Math.floor((Date.now() - callStartTimeRef.current!) / 1000));
                }, 1000);
            }
        });

        peer.on('connect', () => {
            console.log("Caller: WebRTC connected!");
            if (callStatusRef.current !== 'active') {
                callStatusRef.current = 'active';
                setCallStatus('active');
                callStartTimeRef.current = Date.now();
                durationTimerRef.current = setInterval(() => {
                    setCallDuration(Math.floor((Date.now() - callStartTimeRef.current!) / 1000));
                }, 1000);
            }
        });

        peer.on('close', () => { if (callStatusRef.current !== 'ended') endCall(); });
        peer.on('error', (err) => { console.error("Caller peer error:", err); });

        peerRef.current = peer;

        // 30-second missed call timer
        missedCallTimerRef.current = setTimeout(async () => {
            if (callStatusRef.current === 'calling') {
                console.log("No answer — marking as missed");
                await addDoc(collection(db, 'chats', chatId, 'messages'), {
                    text: `📹 Missed video call from ${currentUser.displayName}`,
                    senderId: currentUser.uid,
                    timestamp: serverTimestamp(),
                    type: 'text',
                    status: 'sent',
                });
                await updateDoc(doc(db, 'chats', chatId), {
                    'call.status': 'missed',
                    lastMessage: '📹 Missed video call',
                    lastMessageTimestamp: serverTimestamp(),
                });
                callStatusRef.current = 'missed';
                setCallStatus('missed');
                cleanup();
                setTimeout(onClose, 2500);
            }
        }, 30000);
    };

    const cleanup = () => {
        if (durationTimerRef.current) clearInterval(durationTimerRef.current);
        if (missedCallTimerRef.current) clearTimeout(missedCallTimerRef.current);
        if (peerRef.current) { try { peerRef.current.destroy(); } catch (e) { } }
        if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
        if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
    };

    const endCall = async () => {
        if (callStatusRef.current === 'ended') return;
        callStatusRef.current = 'ended';
        setCallStatus('ended');
        try { await updateDoc(doc(db, 'chats', chatId), { 'call.status': 'ended' }); } catch (e) { }
        cleanup();
        setTimeout(onClose, 1500);
    };

    const toggleMute = () => {
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = isMuted; });
        setIsMuted(!isMuted);
    };

    const toggleCamera = () => {
        localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = isCamOff; });
        setIsCamOff(!isCamOff);
    };

    const toggleScreenShare = async () => {
        if (isScreenSharing) {
            screenStreamRef.current?.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
            const videoTrack = localStreamRef.current?.getVideoTracks()[0];
            const sender = (peerRef.current as any)?._pc?.getSenders()?.find((s: RTCRtpSender) => s.track?.kind === 'video');
            if (sender && videoTrack) sender.replaceTrack(videoTrack);
            if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
            setIsScreenSharing(false);
        } else {
            try {
                const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
                screenStreamRef.current = screenStream;
                const screenTrack = screenStream.getVideoTracks()[0];
                const sender = (peerRef.current as any)?._pc?.getSenders()?.find((s: RTCRtpSender) => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
                if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
                screenTrack.onended = () => toggleScreenShare();
                setIsScreenSharing(true);
            } catch (e) { console.error("Screen share failed:", e); }
        }
    };

    const statusColors: Record<string, string> = { calling: '#ffc107', active: '#22c55e', ended: '#ef4444', missed: '#ef4444' };

    return (
        <div style={{ position: 'absolute', inset: 0, background: '#0a0a0f', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
            <video ref={remoteVideoRef} autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: callStatus === 'active' ? 1 : 0, transition: 'opacity 0.5s' }} />
            <div style={{ position: 'absolute', inset: 0, background: callStatus === 'active' ? 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.7) 100%)' : 'linear-gradient(135deg, #0d1117 0%, #1a1f2e 100%)', zIndex: 1 }} />

            {callStatus !== 'active' && (
                <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
                    <div style={{ width: '100px', height: '100px', borderRadius: '50%', margin: '0 auto 16px', border: `3px solid ${statusColors[callStatus]}`, overflow: 'hidden', animation: callStatus === 'calling' ? 'callPulse 1.5s ease-in-out infinite' : 'none' }}>
                        <img src={otherUser.photoURL || ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <h2 style={{ color: 'white', fontSize: '22px', marginBottom: '8px' }}>{otherUser.displayName}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                        {callStatus === 'missed' && <PhoneMissed size={14} color={statusColors[callStatus]} />}
                        <p style={{ color: statusColors[callStatus], fontSize: '14px' }}>
                            {callStatus === 'calling' ? `Calling ${otherUser.displayName}...` : callStatus === 'missed' ? 'No Answer' : 'Call Ended'}
                        </p>
                    </div>
                    {noCamera && <p style={{ color: 'rgba(255,200,0,0.8)', fontSize: '12px', marginTop: '8px' }}>⚠️ No camera/mic — connecting anyway…</p>}
                </div>
            )}

            {callStatus === 'active' && (
                <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 3, textAlign: 'center' }}>
                    <p style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '14px' }}>{formatDuration(callDuration)}</p>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>{otherUser.displayName}{noCamera ? ' (no cam)' : ''}</p>
                </div>
            )}

            {/* Local PiP */}
            <div style={{ position: 'absolute', bottom: '120px', right: '20px', width: '130px', height: '180px', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)', zIndex: 3, background: '#1a1f2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {noCamera
                    ? <CameraOff size={28} color="rgba(255,255,255,0.3)" />
                    : <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                }
            </div>

            {/* Controls */}
            <div style={{ position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)', zIndex: 3, display: 'flex', gap: '16px', alignItems: 'center' }}>
                {[
                    { icon: isMuted ? <MicOff size={20} /> : <Mic size={20} />, label: isMuted ? 'Unmute' : 'Mute', action: toggleMute, color: '#374151' },
                    { icon: isCamOff ? <VideoOff size={20} /> : <Video size={20} />, label: isCamOff ? 'Cam On' : 'Cam Off', action: toggleCamera, color: '#374151' },
                    { icon: <Monitor size={20} />, label: isScreenSharing ? 'Stop Share' : 'Share Screen', action: toggleScreenShare, color: isScreenSharing ? '#3b82f6' : '#374151' },
                    { icon: <PhoneOff size={22} />, label: 'End Call', action: endCall, color: '#ef4444' },
                ].map((btn, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <button onClick={btn.action} style={{ width: '52px', height: '52px', borderRadius: '50%', background: btn.color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', transition: 'transform 0.15s', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}
                            onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.1)')}
                            onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}>
                            {btn.icon}
                        </button>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>{btn.label}</span>
                    </div>
                ))}
            </div>

            <button onClick={endCall} style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 5, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} />
            </button>

            <style>{`
                @keyframes callPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.5); }
                    50% { box-shadow: 0 0 0 16px rgba(99, 102, 241, 0); }
                }
            `}</style>
        </div>
    );
};
