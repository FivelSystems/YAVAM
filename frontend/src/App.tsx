import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Dashboard from './Dashboard';
import LoginPage from './pages/LoginPage';
import { isAuthenticated } from './services/auth';

function RequireAuth({ children }: { children: JSX.Element }) {
    let location = useLocation();

    // @ts-ignore
    if (window.go) {
        return children;
    }

    if (!isAuthenticated()) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
}

function App() {
    return (
        <HashRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={
                    <RequireAuth>
                        <Dashboard />
                    </RequireAuth>
                } />
            </Routes>
        </HashRouter>
    );
}

export default App;
