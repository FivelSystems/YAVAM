import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, LogIn, AlertCircle, Timer } from 'lucide-react';
import { login, AuthError } from '../services/auth';

export default function LoginPage() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<{ message: string, code?: string } | null>(null);
    const [cooldown, setCooldown] = useState(0);

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
            await login(password);
            // Redirect to home/dashboard on success
            navigate('/', { replace: true });
        } catch (err: any) {
            if (err instanceof AuthError) {
                setError({ message: err.message, code: err.code });
                if (err.code === 'RATE_LIMIT') {
                    setCooldown(30); // 30s client-side cooldown
                }
            } else {
                setError({ message: "An unexpected error occurred.", code: 'UNKNOWN' });
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-[#1e1e1e] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="bg-[#252525] p-8 text-center border-b border-[#333]">
                    <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Lock className="w-10 h-10 text-blue-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Welcome Back</h1>
                    <p className="text-gray-400">Please authenticate to access the library.</p>
                </div>

                {/* Form */}
                <div className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter Access Password"
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
                                    <span>Unlock Library</span>
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
