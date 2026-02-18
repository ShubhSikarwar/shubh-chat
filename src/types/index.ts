import { Timestamp } from "firebase/firestore";

export interface UserProfile {
    uid: string;
    displayName: string | null;
    photoURL: string | null;
    email: string | null;
    lastSeen?: Timestamp;
    status: 'online' | 'offline';
}

export interface Chat {
    id: string;
    participants: string[]; // Array of UIDs
    lastMessage?: string;
    lastMessageTimestamp?: Timestamp;
    status: 'pending' | 'accepted' | 'rejected';
    requestedBy: string; // UID of the person who sent the request
}

export interface Message {
    id: string;
    text: string;
    senderId: string;
    timestamp: Timestamp;
    type: 'text' | 'image';
    status?: 'sent' | 'delivered' | 'seen';
}
