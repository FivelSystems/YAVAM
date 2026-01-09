import { useState } from 'react';
import { motion } from 'framer-motion';
import { Folder, Check } from 'lucide-react';

interface SetupWizardProps {
    onComplete: (libraryPath?: string) => void;
}

const SetupWizard = ({ onComplete }: SetupWizardProps) => {
    const [libraryPath, setLibraryPath] = useState<string>("");
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
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-center">
                    <h1 className="text-2xl font-bold text-white mb-2">Welcome to YAVAM</h1>
                    <p className="text-blue-100 text-sm">Let's get you set up.</p>
                </div>

                <div className="p-8 space-y-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2 text-white">
                            <div className="bg-purple-500/20 p-2 rounded-lg text-purple-400">
                                <Folder size={24} />
                            </div>
                            <h2 className="text-xl font-semibold">First Library</h2>
                        </div>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Select the folder where your <code>.var</code> packages are located. You can add more libraries later.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Library Folder</label>
                        <div className="flex gap-2">
                            <div className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-300 font-mono truncate">
                                {libraryPath || "Select a folder containing .var packages..."}
                            </div>
                            <button
                                onClick={handleSelectLibrary}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium border border-gray-600"
                            >
                                <Folder size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-between items-center">
                        <button
                            onClick={() => handleFinish()} // completing without library is valid (skip)
                            className="text-gray-500 hover:text-white text-sm font-medium transition-colors"
                        >
                            Skip for now
                        </button>
                        <button
                            onClick={handleFinish}
                            disabled={!libraryPath || loading}
                            className="px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-lg shadow-green-900/20 flex items-center gap-2 transition-all"
                        >
                            {loading ? "Saving..." : "Finish"} <Check size={18} />
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default SetupWizard;
