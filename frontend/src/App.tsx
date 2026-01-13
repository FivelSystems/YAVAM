import { HashRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './Dashboard';
import LoginModal from './features/auth/LoginModal';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { Loader2 } from 'lucide-react';

function AppContent() {
    const { isLoginModalOpen, closeLoginModal, isLoginForced, isLoading } = useAuth();

    // While checking auth, show a simple loader
    if (isLoading) {
        return (
            <div className="h-screen w-screen bg-[#1b2636] flex items-center justify-center text-white">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <HashRouter>
            <Routes>
                {/* Dashboard is always rendered. Access control is handled by AuthContext (Modal) and Backend (401s) */}
                <Route path="/" element={<Dashboard />} />
            </Routes>

            {/* Global Login Modal */}
            <LoginModal
                isOpen={isLoginModalOpen}
                onClose={closeLoginModal}
                force={isLoginForced}
            />
        </HashRouter>
    );
}

function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

export default App;
