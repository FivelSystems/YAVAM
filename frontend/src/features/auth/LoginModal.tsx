import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, LogIn, AlertCircle, Timer, X, KeyRound, Smartphone } from 'lucide-react';
import {
    login,
    pairWithCode,
    getAuthStatus,
    formatPairingCodeInput,
    isCompletePairingCode,
    AuthError,
    AuthStatus,
} from '../../services/auth';

const COOLDOWN_TICK_MS = 1000;
const FALLBACK_COOLDOWN_SECONDS = 30;

interface LoginModalProps {
    isOpen: boolean;
    onClose: (token?: string) => void;
    force?: boolean; // If true, cannot close
    message?: string;
}

interface FormError {
    message: string;
    code?: string;
}

const INPUT_CLASS = "w-full bg-[#111] border border-[#333] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50";

function errorTitle(code?: string): string {
    switch (code) {
        case 'RATE_LIMIT': return "Please Wait a Moment";
        case 'INVALID_CODE': return "Code Not Accepted";
        default: return "Sign-in Failed";
    }
}

function FormErrorNotice({ error }: { error: FormError }) {
    const isRateLimit = error.code === 'RATE_LIMIT';
    return (
        <div
            role="alert"
            className={`flex items-start gap-3 text-sm p-4 rounded-lg ${isRateLimit ? 'bg-orange-950/30 border border-orange-900/50 text-orange-400' : 'bg-red-950/30 border border-red-900/50 text-red-400'}`}
        >
            {isRateLimit ? <Timer className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <div>
                <div className="font-semibold mb-0.5">{errorTitle(error.code)}</div>
                <p className="opacity-90">{error.message}</p>
            </div>
        </div>
    );
}

interface SubmitButtonProps {
    loading: boolean;
    cooldown: number;
    disabled: boolean;
    idleLabel: string;
    idleIcon: React.ReactNode;
}

function SubmitButton({ loading, cooldown, disabled, idleLabel, idleIcon }: SubmitButtonProps) {
    return (
        <button
            type="submit"
            disabled={loading || disabled || cooldown > 0}
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
                    {idleIcon}
                    <span>{idleLabel}</span>
                </>
            )}
        </button>
    );
}

interface SignInFormProps {
    cooldown: number;
    onCooldown: (seconds: number) => void;
    onSignedIn: (token: string) => void;
}

function useSubmit(
    action: () => Promise<string>,
    { onCooldown, onSignedIn }: Pick<SignInFormProps, 'onCooldown' | 'onSignedIn'>
) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<FormError | null>(null);

    const submit = async () => {
        setLoading(true);
        setError(null);
        try {
            onSignedIn(await action());
        } catch (err) {
            if (err instanceof AuthError) {
                setError({ message: err.message, code: err.code });
                if (err.code === 'RATE_LIMIT') onCooldown(err.retryAfter ?? FALLBACK_COOLDOWN_SECONDS);
            } else {
                setError({ message: "An unexpected error occurred.", code: 'UNKNOWN' });
            }
        } finally {
            setLoading(false);
        }
    };

    return { loading, error, submit };
}

function PairingCodeForm(props: SignInFormProps) {
    const [code, setCode] = useState('');
    const { loading, error, submit } = useSubmit(() => pairWithCode(code), props);

    return (
        <form
            onSubmit={(e) => { e.preventDefault(); if (props.cooldown === 0) submit(); }}
            className="space-y-4"
        >
            <div>
                <label htmlFor="pairing-code" className="flex items-center gap-2 text-sm font-medium text-gray-400 mb-2">
                    <Smartphone className="w-4 h-4" /> Pairing Code
                </label>
                <input
                    id="pairing-code"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={9}
                    value={code}
                    onChange={(e) => setCode(formatPairingCodeInput(e.target.value))}
                    placeholder="XXXX-XXXX"
                    className={`${INPUT_CLASS} text-center text-2xl font-mono tracking-widest`}
                    autoFocus
                    disabled={loading || props.cooldown > 0}
                />
                <p className="text-xs text-gray-500 mt-2">
                    The code is shown in the desktop app under Settings &gt; Network.
                </p>
            </div>

            {error && <FormErrorNotice error={error} />}

            <SubmitButton
                loading={loading}
                cooldown={props.cooldown}
                disabled={!isCompletePairingCode(code)}
                idleLabel="Pair this device"
                idleIcon={<KeyRound className="w-4 h-4" />}
            />
        </form>
    );
}

function PasswordForm(props: SignInFormProps) {
    const [password, setPassword] = useState('');
    const { loading, error, submit } = useSubmit(() => login(password), props);

    return (
        <form
            onSubmit={(e) => { e.preventDefault(); if (props.cooldown === 0) submit(); }}
            className="space-y-4"
        >
            <div>
                <label htmlFor="access-password" className="block text-sm font-medium text-gray-400 mb-2">Access Password</label>
                <input
                    id="access-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password..."
                    className={INPUT_CLASS}
                    disabled={loading || props.cooldown > 0}
                />
            </div>

            {error && <FormErrorNotice error={error} />}

            <SubmitButton
                loading={loading}
                cooldown={props.cooldown}
                disabled={!password}
                idleLabel="Authenticate"
                idleIcon={<LogIn className="w-4 h-4" />}
            />
        </form>
    );
}

interface StatusNoticeProps {
    title: string;
    body: string;
    onRetry: () => void;
    retryLabel: string;
}

function StatusNotice({ title, body, onRetry, retryLabel }: StatusNoticeProps) {
    return (
        <div className="text-center space-y-4">
            <h3 className="text-white font-semibold">{title}</h3>
            <p className="text-sm text-gray-400">{body}</p>
            <button
                type="button"
                onClick={onRetry}
                className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
                {retryLabel}
            </button>
        </div>
    );
}

export default function LoginModal({ isOpen, onClose, force = false, message }: LoginModalProps) {
    const navigate = useNavigate();
    const [status, setStatus] = useState<AuthStatus | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(0);

    // One probe per open or manual retry; never polled.
    const loadStatus = useCallback(async () => {
        setStatus(null);
        setStatusError(null);
        try {
            setStatus(await getAuthStatus());
        } catch (err) {
            setStatusError(err instanceof Error ? err.message : "Could not load sign-in options.");
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            setCooldown(0);
            loadStatus();
        }
    }, [isOpen, loadStatus]);

    useEffect(() => {
        if (cooldown > 0) {
            const timer = setInterval(() => setCooldown(c => Math.max(0, c - 1)), COOLDOWN_TICK_MS);
            return () => clearInterval(timer);
        }
    }, [cooldown > 0]);

    const handleSignedIn = (token: string) => {
        onClose(token); // Pass token to avoid race condition
        navigate('/');
    };

    const formProps: SignInFormProps = { cooldown, onCooldown: setCooldown, onSignedIn: handleSignedIn };

    const renderBody = () => {
        if (statusError) {
            return <StatusNotice title="Can't reach the server" body={statusError} onRetry={loadStatus} retryLabel="Try again" />;
        }
        if (!status) {
            return (
                <div className="flex justify-center py-6" aria-label="Loading sign-in options">
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
            );
        }
        if (status.setupRequired) {
            return (
                <StatusNotice
                    title="Setup required"
                    body="An administrator password must be set from the desktop app first."
                    onRetry={loadStatus}
                    retryLabel="Check again"
                />
            );
        }
        return (
            <div className="space-y-6">
                {status.pairingAvailable && <PairingCodeForm {...formProps} />}
                {status.pairingAvailable && status.passwordLoginAllowed && (
                    <div className="flex items-center gap-3 text-xs text-gray-500 uppercase">
                        <div className="flex-1 h-px bg-[#333]" />
                        <span>or use the password</span>
                        <div className="flex-1 h-px bg-[#333]" />
                    </div>
                )}
                {status.passwordLoginAllowed && <PasswordForm {...formProps} />}
            </div>
        );
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
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
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
                                    aria-label="Close"
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
                                        : "Sign in to perform this action.")}
                                </p>
                            </div>

                            <div className="p-8">{renderBody()}</div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
