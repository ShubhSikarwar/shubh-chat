import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import SimplePeer from 'simple-peer';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, X } from 'lucide-react';
import { User } from 'firebase/auth';

interface VideoCallReceiverProps {
    chatId: string;
    currentUser: User;
    callerName: string;
    offer: any;
    onClose: () => void;
}

export const VideoCallReceiver: React.FC<VideoCallReceiverProps> = ({
    chatId, callerName, offer, onClose
}) => {
    const [isMuted, setIsMuted] = useState(false);
    const [isCamOff, setIsCamOff] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [status, setStatus] = useState<'connecting' | 'active' | 'ended'>('connecting');

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const peerRef = useRef<SimplePeer.Instance | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const startTimeRef = useRef<number | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        startReceivingCall();
        return () => cleanup();
    }, []);

    const startReceivingCall = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream;
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;

            const peer = new SimplePeer({ initiator: false, trickle: false, stream });

            peer.on('signal', async (signal) => {
                await updateDoc(doc(db, 'chats', chatId), {
                    'call.answer': signal,
                    'call.status': 'active',
                });
                setStatus('active');
                startTimeRef.current = Date.now();
                timerRef.current = setInterval(() => {
                    setCallDuration(Math.floor((Date.now() - startTimeRef.current!) / 1000));
                }, 1000);
            });

            peer.on('stream', (remoteStream) => {
                if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
            });

            peer.on('close', () => endCall());
            peer.on('error', (e) => console.error("Peer error", e));

            if (offer) peer.signal(offer);
            peerRef.current = peer;
        } catch (e) {
            console.error("Receiver media error", e);
            onClose();
        }
    };

    const cleanup = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (peerRef.current) { try { peerRef.current.destroy(); } catch (e) { } }
        if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
        if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
    };

    const endCall = async () => {
        setStatus('ended');
        await updateDoc(doc(db, 'chats', chatId), { 'call.status': 'ended' });
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
                const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
                screenStreamRef.current = screenStream;
                const screenTrack = screenStream.getVideoTracks()[0];
                const sender = (peerRef.current as any)?._pc?.getSenders()?.find((s: RTCRtpSender) => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
                if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
                screenTrack.onended = () => { setIsScreenSharing(false); };
                setIsScreenSharing(true);
            } catch (e) { console.error(e); }
        }
    };

    const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {/* Remote Video */}
            <video ref={remoteVideoRef} autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: status === 'active' ? 1 : 0, transition: 'opacity 0.5s' }} />
            <div style={{ position: 'absolute', inset: 0, background: status === 'active' ? 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.7) 100%)' : 'linear-gradient(135deg,#0d1117,#1a1f2e)', zIndex: 1 }} />

            {/* Status */}
            {status !== 'active' && (
                <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
                    <h2 style={{ color: 'white', fontSize: '22px', marginBottom: '8px' }}>{callerName}</h2>
                    <p style={{ color: status === 'ended' ? '#ef4444' : '#ffc107', fontSize: '14px' }}>
                        {status === 'connecting' ? 'Connecting...' : 'Call Ended'}
                    </p>
                </div>
            )}
            {status === 'active' && (
                <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 3, textAlign: 'center' }}>
                    <p style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '14px' }}>{fmt(callDuration)}</p>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>{callerName}</p>
                </div>
            )}

            {/* Local PiP */}
            <div style={{ position: 'absolute', bottom: '120px', right: '20px', width: '130px', height: '180px', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)', zIndex: 3, background: '#1a1f2e' }}>
                <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
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
        </div>
    );
};
