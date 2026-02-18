import React from 'react';
import { useAuth } from '../context/AuthContext';
import { MessageSquare } from 'lucide-react';

export const Login: React.FC = () => {
    const { login } = useAuth();

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, #00a884 0%, #005c4b 100%)',
            padding: '20px'
        }}>
            <div className="fade-in" style={{
                background: 'var(--bg-sidebar)',
                padding: '40px',
                borderRadius: '16px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                textAlign: 'center',
                maxWidth: '400px',
                width: '100%'
            }}>
                <div style={{
                    background: 'var(--accent)',
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 24px'
                }}>
                    <MessageSquare size={40} color="white" />
                </div>
                <h1 style={{ marginBottom: '8px', fontSize: '24px' }}>WhatsApp Clone</h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
                    Connect with your friends and family instantly.
                </p>

                <button
                    onClick={login}
                    style={{
                        background: 'white',
                        color: '#111',
                        padding: '12px 24px',
                        borderRadius: '8px',
                        fontSize: '16px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        width: '100%',
                        transition: 'transform 0.2s, background 0.2s',
                        border: 'none'
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.background = '#f1f1f1';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.transform = 'translateY(0)';
                    }}
                >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="20" />
                    Continue with Google
                </button>

                <p style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-dim)' }}>
                    Safe, secure and private messaging.
                </p>
            </div>
        </div >
    );
};
