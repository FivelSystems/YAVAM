import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, Check, KeyRound, Globe, ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';

interface SetupWizardProps {
    onComplete: (libraryPath?: string) => void;
}

const SetupWizard = ({ onComplete }: SetupWizardProps) => {
    const [step, setStep] = useState(1);
    const [libraryPath, setLibraryPath] = useState<string>("");

    // Step 2: Password
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Step 3: Network
    const [enableServer, setEnableServer] = useState(false);

    const [loading, setLoading] = useState(false);

    const handleSelectLibrary = async () => {
        // @ts-ignore
        if (window.go) {
            try {
                // @ts-ignore
                const path = await window.go.main.App.SelectDirectory();
                if (path) setLibraryPath(path);
            } catch (e) {
                console.error(e);
            }
        }
    };

    const handleFinish = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            if (window.go && window.go.main && window.go.main.App) {
                // Save Password if set
                if (password) {
                    // @ts-ignore
                    await window.go.main.App.UpdatePassword(password);
                }

                // Save Server Config
                if (enableServer) {
                    // @ts-ignore
                    await window.go.main.App.SetServerEnabled(true);
                }

                // @ts-ignore
                await window.go.main.App.FinishSetup();
            }
            onComplete(libraryPath);
        } catch (e) {
            console.error("Setup failed:", e);
            alert("Failed to complete setup: " + e);
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-gray-900 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-700"
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-center relative overflow-hidden">
                    <div className="relative z-10">
                        <h1 className="text-2xl font-bold text-white mb-2">Welcome to YAVAM</h1>
                        <p className="text-blue-100 text-sm">Initial Setup • Step {step} of 3</p>
                    </div>
                </div>

                <div className="p-8">
                    <AnimatePresence mode='wait'>
                        {/* STEP 1: LIBRARY */}
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div>
                                    <div className="flex items-center gap-3 mb-2 text-white">
                                        <div className="bg-purple-500/20 p-2 rounded-lg text-purple-400">
                                            <Folder size={24} />
                                        </div>
                                        <h2 className="text-xl font-semibold">Content Library</h2>
                                    </div>
                                    <p className="text-gray-400 text-sm leading-relaxed">
                                        Select the folder containing your <code>.var</code> packages.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Library Folder</label>
                                    <div className="flex gap-2">
                                        <div className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-300 font-mono truncate">
                                            {libraryPath || "Select a folder..."}
                                        </div>
                                        <button
                                            onClick={handleSelectLibrary}
                                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors border border-gray-600"
                                        >
                                            <Folder size={18} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4">
                                    <button
                                        onClick={() => setStep(2)}
                                        disabled={!libraryPath}
                                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 flex items-center gap-2 transition-all"
                                    >
                                        Next <ArrowRight size={18} />
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 2: PASSWORD */}
                        {step === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div>
                                    <div className="flex items-center gap-3 mb-2 text-white">
                                        <div className="bg-yellow-500/20 p-2 rounded-lg text-yellow-400">
                                            <KeyRound size={24} />
                                        </div>
                                        <h2 className="text-xl font-semibold">Secure Access</h2>
                                    </div>
                                    <p className="text-gray-400 text-sm leading-relaxed">
                                        Set a password to protect your library and remote connections.
                                        <br /><span className="text-xs text-gray-500 italic">(Leave empty to skip - Not Recommended)</span>
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-500 uppercase">Administrator Password</label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                                            placeholder="Enter password"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-500 uppercase">Confirm Password</label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                                            placeholder="Repeat password"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-between pt-4">
                                    <button
                                        onClick={() => setStep(1)}
                                        className="text-gray-500 hover:text-white text-sm font-medium transition-colors flex items-center gap-2"
                                    >
                                        <ArrowLeft size={16} /> Back
                                    </button>
                                    <button
                                        onClick={() => setStep(3)}
                                        disabled={password !== confirmPassword}
                                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 flex items-center gap-2 transition-all"
                                    >
                                        Next <ArrowRight size={18} />
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 3: NETWORK */}
                        {step === 3 && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div>
                                    <div className="flex items-center gap-3 mb-2 text-white">
                                        <div className="bg-green-500/20 p-2 rounded-lg text-green-400">
                                            <Globe size={24} />
                                        </div>
                                        <h2 className="text-xl font-semibold">Remote Access</h2>
                                    </div>
                                    <p className="text-gray-400 text-sm leading-relaxed">
                                        Access your library from other devices via web browser.
                                    </p>
                                </div>

                                <div className="bg-gray-700/30 rounded-xl p-4 border border-gray-700/50">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-base font-medium text-white">Enable Web Server</h4>
                                            <p className="text-xs text-gray-500">Run HTTP server on startup (Port 8080)</p>
                                        </div>
                                        <button
                                            onClick={() => setEnableServer(!enableServer)}
                                            className={clsx(
                                                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                                enableServer ? "bg-green-600" : "bg-gray-700"
                                            )}
                                        >
                                            <span className={clsx(
                                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200",
                                                enableServer ? "translate-x-6" : "translate-x-1"
                                            )} />
                                        </button>
                                    </div>

                                    {enableServer && (
                                        <div className="mt-4 pt-4 border-t border-gray-700/50">
                                            <div className="flex items-start gap-3 text-orange-400 bg-orange-500/10 p-3 rounded-lg text-xs">
                                                <ShieldCheck size={16} className="shrink-0 mt-0.5" />
                                                <p>
                                                    Remote access requires the password set in the previous step.
                                                    {!password && <strong className="block mt-1 text-orange-300">Warning: No password set! Anyone on your network can access your files. Go back and set a password.</strong>}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-between pt-4">
                                    <button
                                        onClick={() => setStep(2)}
                                        className="text-gray-500 hover:text-white text-sm font-medium transition-colors flex items-center gap-2"
                                    >
                                        <ArrowLeft size={16} /> Back
                                    </button>
                                    <button
                                        onClick={handleFinish}
                                        disabled={loading || (enableServer && !password)}
                                        className="px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-lg shadow-green-900/20 flex items-center gap-2 transition-all"
                                    >
                                        {loading ? "Finishing..." : "Finish Setup"} <Check size={18} />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};

export default SetupWizard;
