import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getStoredToken, logout as serviceLogout } from '../../services/auth';
import { fetchWithAuth } from '../../services/api';

interface AuthContextType {
    isAuthenticated: boolean; // Has valid Admin Token
    isGuest: boolean;         // Has Public Access (Read Only)
    isLoading: boolean;

    // Modal Control
    isLoginModalOpen: boolean;
    isLoginForced: boolean;
    loginMessage?: string;
    openLoginModal: (force?: boolean, message?: string) => void;
    closeLoginModal: () => void;

    // Actions
    logout: () => void;
    checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isGuest, setIsGuest] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [isLoginForced, setIsLoginForced] = useState(false);
    const [loginMessage, setLoginMessage] = useState<string | undefined>(undefined);

    // Verify Token or Public Access
    const checkAuth = async () => {
        try {
            // @ts-ignore
            if (window.go) {
                // Desktop Mode: Always Authenticated as Owner
                setIsAuthenticated(true);
                setIsGuest(false);
                setIsLoginModalOpen(false);
                isLoginForced && setIsLoginForced(false); // Reset force if previously set
                return;
            }

            // 1. Check Token
            const token = getStoredToken();
            if (token) {
                // Validate token with server to ensure it is still valid/not revoked
                // We must use a strictly protected endpoint that is NOT allowed for guests
                const res = await fetchWithAuth('/api/auth/verify');
                if (res.ok) {
                    setIsAuthenticated(true);
                    setIsGuest(false);
                    setIsLoginModalOpen(false);
                    setIsLoginForced(false);
                } else if (res.status === 401) {
                    // Token invalid/expired/revoked
                    serviceLogout(); // Clear from storage
                    setIsAuthenticated(false);
                    setIsGuest(false);
                    // If we have a token but it failed, it might be revoked. Open modal.
                    openLoginModal(true, "Your session has been revoked by the server.");
                } else {
                    // Server error, keep authenticated if token exists? Or risk it?
                    // Better to assume valid unless 401.
                    setIsAuthenticated(true);
                    setIsGuest(false);
                    setIsLoginModalOpen(false);
                }
            } else {
                setIsAuthenticated(false);

                // 2. Check Public Access
                const res = await fetchWithAuth('/api/config');
                if (res.ok) {
                    const cfg = await res.json();
                    if (cfg.publicAccess) {
                        setIsGuest(true);
                        setIsLoginModalOpen(false); // Ensure closed
                    } else {
                        // Private + No Token -> Force Login
                        setIsGuest(false);
                        openLoginModal(true);
                    }
                } else {
                    // Server unreachable or error -> Assume private
                    setIsGuest(false);
                    openLoginModal(true);
                }
            }
        } catch (error) {
            console.error("Auth Check Failed:", error);
            // Fallback
            setIsAuthenticated(false);
            setIsGuest(false);
            openLoginModal(true);
        }
    };

    const [pollInterval, setPollInterval] = useState(15000); // Default 15s

    // 1. Initial Check & Event Listeners
    useEffect(() => {
        // Run check on mount
        const init = async () => {
            // Fetch Config for Polling Interval
            try {
                const res = await fetch('/api/config');
                if (res.ok) {
                    const cfg = await res.json();
                    if (cfg.authPollInterval && cfg.authPollInterval > 0) {
                        setPollInterval(cfg.authPollInterval * 1000);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch auth config", e);
            }

            await checkAuth();
            setIsLoading(false);
        };
        init();

        // Listen for local logout events
        const handleLogout = () => {
            setIsAuthenticated(false);
            checkAuth();
        };
        window.addEventListener('auth:logout', handleLogout);

        return () => {
            window.removeEventListener('auth:logout', handleLogout);
        };
    }, []);

    // 2. Polling for Revocation (Only when active)
    useEffect(() => {
        if (!isAuthenticated && !isGuest) return;

        const interval = setInterval(() => {
            checkAuth();
        }, pollInterval);

        return () => clearInterval(interval);
    }, [isAuthenticated, isGuest, pollInterval]);

    const openLoginModal = (force = false, message?: string) => {
        if (isLoginModalOpen) return;
        setIsLoginForced(force);
        setLoginMessage(message);
        setIsLoginModalOpen(true);
    };

    const closeLoginModal = () => {
        // If forced, cannot close unless we are authenticated or guest
        // Ideally the Modal component handles the "X" button logic based on force.
        // Here we just set state.
        setIsLoginModalOpen(false);
        // If we just logged in, we should re-check auth
        checkAuth();
    };

    const logout = () => {
        serviceLogout();
        // checkAuth will be triggered by event listener
    };

    return (
        <AuthContext.Provider value={{
            isAuthenticated,
            isGuest,
            isLoading,
            isLoginModalOpen,
            isLoginForced,
            loginMessage,
            openLoginModal,
            closeLoginModal,
            logout,
            checkAuth
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
