import { Timestamp } from "firebase/firestore";

export interface UserProfile {
    uid: string;
    displayName: string | null;
    photoURL: string | null;
    email: string | null;
    lastSeen?: Timestamp;
    status: 'online' | 'offline';
    activeChatId?: string | null;
}

export interface Chat {
    id: string;
    participants: string[]; // Array of UIDs
    lastMessage?: string;
    lastMessageTimestamp?: Timestamp;
    status: 'pending' | 'accepted' | 'rejected';
    requestedBy: string; // UID of the person who sent the request
    typing?: { [uid: string]: boolean };
    replyPromise?: {
        uid: string;
        deadline: Timestamp;
        label: string;
    } | null;
}

export interface Message {
    id: string;
    text: string;
    senderId: string;
    timestamp: Timestamp;
    type: 'text' | 'image' | 'video' | 'file';
    status: 'sent' | 'delivered' | 'seen';
    reactions?: { [uid: string]: string };
    isSelfDestruct?: boolean;
    selfDestructTime?: number; // In seconds
    seenAt?: Timestamp | null;
    fileUrl?: string;
    fileName?: string;
}
