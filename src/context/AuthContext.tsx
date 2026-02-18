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

                // Handle presence
                const setStatus = async (status: 'online' | 'offline') => {
                    await setDoc(userRef, {
                        status,
                        lastSeen: serverTimestamp()
                    }, { merge: true });
                };

                const handleVisibilityChange = () => {
                    setStatus(document.visibilityState === 'visible' ? 'online' : 'offline');
                };

                const handleBeforeUnload = () => {
                    // Note: This is best-effort. Browsers may not complete the request.
                    setStatus('offline');
                };

                document.addEventListener('visibilitychange', handleVisibilityChange);
                window.addEventListener('beforeunload', handleBeforeUnload);

                return () => {
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                    window.removeEventListener('beforeunload', handleBeforeUnload);
                };
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

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
