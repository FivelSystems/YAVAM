import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, LogIn, AlertCircle, Timer, X } from 'lucide-react';
import { login, AuthError } from '../../services/auth';

interface LoginModalProps {
    isOpen: boolean;
    onClose: (token?: string) => void;
    force?: boolean; // If true, cannot close
    message?: string;
}

export default function LoginModal({ isOpen, onClose, force = false, message }: LoginModalProps) {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<{ message: string, code?: string } | null>(null);
    const [cooldown, setCooldown] = useState(0);

    // Reset state on open
    useEffect(() => {
        if (isOpen) {
            setPassword('');
            setError(null);
        }
    }, [isOpen]);

    // Cooldown Timer
    useEffect(() => {
        if (cooldown > 0) {
            const timer = setInterval(() => setCooldown(c => c - 1), 1000);
            return () => clearInterval(timer);
        }
    }, [cooldown]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (cooldown > 0) return;

        setLoading(true);
        setError(null);

        try {
            const token = await login(password);
            onClose(token); // Success! Pass token to avoid race condition
            navigate('/');
        } catch (err: any) {
            if (err instanceof AuthError) {
                setError({ message: err.message, code: err.code });
                if (err.code === 'RATE_LIMIT') {
                    setCooldown(30);
                }
            } else {
                setError({ message: "An unexpected error occurred.", code: 'UNKNOWN' });
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={force ? undefined : () => onClose()}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    >
                        {/* Modal */}
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-md bg-[#1e1e1e] border border-[#333] rounded-xl shadow-2xl overflow-hidden relative"
                        >
                            {!force && (
                                <button
                                    onClick={() => onClose()}
                                    className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            )}

                            {/* Header */}
                            <div className="bg-[#252525] p-8 text-center border-b border-[#333]">
                                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Lock className="w-8 h-8 text-blue-500" />
                                </div>
                                <h2 className="text-xl font-bold text-white mb-2">
                                    {force ? "Authentication Required" : "Unlock Admin Access"}
                                </h2>
                                <p className="text-gray-400 text-sm">
                                    {message || (force
                                        ? "This server is private. Please authenticate to continue."
                                        : "Enter password to perform this action.")}
                                </p>
                            </div>

                            {/* Form */}
                            <div className="p-8">
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Access Password</label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter password..."
                                            className="w-full bg-[#111] border border-[#333] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
                                            autoFocus
                                            disabled={loading || cooldown > 0}
                                        />
                                    </div>

                                    {error && (
                                        <div className={`flex items-start gap-3 text-sm p-4 rounded-lg ${error.code === 'RATE_LIMIT' ? 'bg-orange-950/30 border border-orange-900/50 text-orange-400' : 'bg-red-950/30 border border-red-900/50 text-red-400'}`}>
                                            {error.code === 'RATE_LIMIT' ? <Timer className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                                            <div>
                                                <div className="font-semibold mb-0.5">
                                                    {error.code === 'RATE_LIMIT' ? "Too Many Attempts" : "Login Failed"}
                                                </div>
                                                <p className="opacity-90">{error.message}</p>
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading || !password || cooldown > 0}
                                        className={`w-full font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg 
                                            ${cooldown > 0
                                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                                            } disabled:opacity-70 disabled:cursor-not-allowed`}
                                    >
                                        {loading ? (
                                            <div className="flex items-center gap-2 text-white/80">
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                <span>Verifying...</span>
                                            </div>
                                        ) : cooldown > 0 ? (
                                            <>
                                                <Timer className="w-4 h-4" />
                                                <span>Try again in {cooldown}s</span>
                                            </>
                                        ) : (
                                            <>
                                                <LogIn className="w-4 h-4" />
                                                <span>Authenticate</span>
                                            </>
                                        )}
                                    </button>
                                </form>
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
