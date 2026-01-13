import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getStoredToken, logout as serviceLogout } from '../../services/auth';

interface AuthContextType {
    isAuthenticated: boolean; // Has valid Admin Token
    isGuest: boolean;         // Has Public Access (Read Only)
    isLoading: boolean;

    // Modal Control
    isLoginModalOpen: boolean;
    isLoginForced: boolean;
    openLoginModal: (force?: boolean) => void;
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

    // Initial Check
    const checkAuth = async () => {
        setIsLoading(true);
        try {
            // @ts-ignore
            if (window.go) {
                // Desktop Mode: Always Authenticated as Owner
                setIsAuthenticated(true);
                setIsGuest(false);
                setIsLoginModalOpen(false);
                setIsLoading(false);
                isLoginForced && setIsLoginForced(false); // Reset force if previously set
                return;
            }

            // 1. Check Token
            const token = getStoredToken();
            if (token) {
                // Validate token with server to ensure it is still valid/not revoked
                const res = await fetch('/api/config'); // Protected endpoint
                if (res.ok) {
                    setIsAuthenticated(true);
                    setIsGuest(false);
                    setIsLoginModalOpen(false);
                    setIsLoginForced(false);
                } else if (res.status === 401) {
                    // Token invalid/expired
                    setIsAuthenticated(false);
                    setIsGuest(false);
                    // If we have a token but it failed, it might be revoked. Open modal.
                    openLoginModal(true);
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
                const res = await fetch('/api/config');
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
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Run check on mount
        checkAuth();

        // Listen for 401 events or Logout events
        const handleLogout = () => {
            setIsAuthenticated(false);
            checkAuth(); // Re-evaluate (might fall back to guest)
        };

        // Custom event disaptched by auth service on specific failures?
        // Or we can intercept fetch globally? 
        // For now, services/auth.ts dispatches 'auth:logout'
        window.addEventListener('auth:logout', handleLogout);
        // Listen for server revocation check
        window.addEventListener('auth:check', () => checkAuth());

        return () => {
            window.removeEventListener('auth:logout', handleLogout);
            window.removeEventListener('auth:check', () => checkAuth());
        };
    }, []);

    const openLoginModal = (force = false) => {
        setIsLoginForced(force);
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
