import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
            try {
                if (authenticatedUser) {
                    const userRef = doc(db, 'users', authenticatedUser.uid);
                    await setDoc(userRef, {
                        uid: authenticatedUser.uid,
                        displayName: authenticatedUser.displayName,
                        photoURL: authenticatedUser.photoURL,
                        email: authenticatedUser.email,
                        lastSeen: serverTimestamp(),
                        status: 'online'
                    }, { merge: true });
                    setUser(authenticatedUser);
                } else {
                    setUser(null);
                }
            } catch (error) {
                console.error("Auth initialization error:", error);
            } finally {
                setLoading(false);
            }
        });

        return unsubscribe;
    }, []);

    // Presence Logic
    useEffect(() => {
        if (!user) return;

        const userRef = doc(db, 'users', user.uid);

        const setStatus = async (status: 'online' | 'offline') => {
            try {
                await setDoc(userRef, {
                    status,
                    lastSeen: serverTimestamp()
                }, { merge: true });
            } catch (e) {
                console.error("Presence update failed", e);
            }
        };

        const handleVisibilityChange = () => {
            setStatus(document.visibilityState === 'visible' ? 'online' : 'offline');
        };

        const handleBeforeUnload = () => {
            // navigator.sendBeacon could be used here for more reliability in production
            setStatus('offline');
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);

        // Set online initially
        setStatus('online');

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            setStatus('offline');
        };
    }, [user]);

    const login = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Login failed", error);
        }
    };

    const logout = async () => {
        try {
            if (user) {
                const userRef = doc(db, 'users', user.uid);
                await setDoc(userRef, { status: 'offline', lastSeen: serverTimestamp() }, { merge: true });
            }
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
