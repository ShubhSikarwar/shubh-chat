import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import SimplePeer from 'simple-peer';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, X, CameraOff } from 'lucide-react';

interface VideoCallReceiverProps {
    chatId: string;
    callerName: string;
    onClose: () => void;
}

/** Try to get user media with graceful fallbacks — never throws */
async function getLocalStream(): Promise<MediaStream | null> {
    if (!navigator.mediaDevices?.getUserMedia) {
        console.warn("getUserMedia not supported (HTTP context?)");
        return null;
    }
    try {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e1) {
        console.warn("Video+Audio failed:", e1);
    }
    try {
        return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    } catch (e2) {
        console.warn("Audio-only also failed:", e2);
    }
    return null;
}

export const VideoCallReceiver: React.FC<VideoCallReceiverProps> = ({
    chatId, callerName, onClose
}) => {
    const [isMuted, setIsMuted] = useState(false);
    const [isCamOff, setIsCamOff] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [status, setStatus] = useState<'connecting' | 'active' | 'ended'>('connecting');
    const [noCamera, setNoCamera] = useState(false);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const peerRef = useRef<SimplePeer.Instance | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const startTimeRef = useRef<number | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const statusRef = useRef<string>('connecting');
    const peerCreatedRef = useRef(false);

    useEffect(() => {
        startReceivingCall();
        return () => cleanup();
    }, []);

    // Listen for call end from caller side
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'chats', chatId), (snap) => {
            const call = snap.data()?.call;
            if (!call) return;
            if ((call.status === 'ended' || call.status === 'missed') && statusRef.current !== 'ended') {
                statusRef.current = 'ended';
                setStatus('ended');
                cleanup();
                setTimeout(onClose, 1500);
            }
        });
        return unsubscribe;
    }, [chatId]);

    const startReceivingCall = async () => {
        // Step 1: Get local media (non-blocking — proceed even if it fails)
        const stream = await getLocalStream();
        if (!stream) {
            setNoCamera(true);
            console.warn("VideoCallReceiver: proceeding without local media");
        } else {
            localStreamRef.current = stream;
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        }

        // Step 2: Watch Firestore for offer to become available, then create peer
        const unsubOffer = onSnapshot(doc(db, 'chats', chatId), async (snap) => {
            const call = snap.data()?.call;

            // Guard: only run once, only when offer is present
            if (!call?.offer || peerCreatedRef.current) return;
            if (call.status === 'ended' || call.status === 'missed') return;

            peerCreatedRef.current = true;
            unsubOffer(); // stop listening for offer changes

            console.log("Receiver: offer available, creating peer");

            const peerConfig: SimplePeer.Options = {
                initiator: false,
                trickle: false,
                ...(stream ? { stream } : {}),
            };
            const peer = new SimplePeer(peerConfig);

            // Step 3: When answer is generated, write it back and set status active
            peer.on('signal', async (answerSignal) => {
                console.log("Receiver: answer generated, writing to Firestore");
                await updateDoc(doc(db, 'chats', chatId), {
                    'call.answer': answerSignal,
                    'call.status': 'active',
                });
                statusRef.current = 'active';
                setStatus('active');
                startTimeRef.current = Date.now();
                timerRef.current = setInterval(() => {
                    setCallDuration(Math.floor((Date.now() - startTimeRef.current!) / 1000));
                }, 1000);
            });

            // Step 4: Receive caller's remote stream
            peer.on('stream', (remoteStream) => {
                console.log("Receiver: got remote stream");
                if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
            });

            peer.on('connect', () => {
                console.log("Receiver: WebRTC connected!");
            });

            peer.on('close', () => { if (statusRef.current !== 'ended') endCall(); });
            peer.on('error', (e) => console.error("Receiver peer error:", e));

            // Step 5: Feed caller's offer into our peer
            console.log("Receiver: signaling peer with caller's offer");
            peer.signal(call.offer);

            peerRef.current = peer;
        });
    };

    const cleanup = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (peerRef.current) { try { peerRef.current.destroy(); } catch (e) { } }
        if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
        if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
    };

    const endCall = async () => {
        if (statusRef.current === 'ended') return;
        statusRef.current = 'ended';
        setStatus('ended');
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
                const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
                screenStreamRef.current = screenStream;
                const screenTrack = screenStream.getVideoTracks()[0];
                const sender = (peerRef.current as any)?._pc?.getSenders()?.find((s: RTCRtpSender) => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
                if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
                screenTrack.onended = () => { setIsScreenSharing(false); };
                setIsScreenSharing(true);
            } catch (e) { console.error("Screen share error:", e); }
        }
    };

    const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {/* Remote Video (full screen) */}
            <video ref={remoteVideoRef} autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: status === 'active' ? 1 : 0, transition: 'opacity 0.5s' }} />
            <div style={{ position: 'absolute', inset: 0, background: status === 'active' ? 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.7) 100%)' : 'linear-gradient(135deg,#0d1117,#1a1f2e)', zIndex: 1 }} />

            {/* Status */}
            {status !== 'active' && (
                <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
                    <h2 style={{ color: 'white', fontSize: '22px', marginBottom: '8px' }}>{callerName}</h2>
                    <p style={{ color: status === 'ended' ? '#ef4444' : '#22c55e', fontSize: '14px' }}>
                        {status === 'connecting' ? 'Connecting...' : 'Call Ended'}
                    </p>
                    {noCamera && <p style={{ color: 'rgba(255,200,0,0.8)', fontSize: '12px', marginTop: '8px' }}>⚠️ No camera/mic — connecting anyway…</p>}
                </div>
            )}
            {status === 'active' && (
                <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 3, textAlign: 'center' }}>
                    <p style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '14px' }}>{fmt(callDuration)}</p>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>{callerName}{noCamera ? ' (no cam)' : ''}</p>
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
        </div>
    );
};
