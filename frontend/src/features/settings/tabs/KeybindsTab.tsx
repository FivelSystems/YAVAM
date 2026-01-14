import { useState, useEffect } from 'react';
import { SettingGroup } from '../components/SettingGroup';
import { SettingItem } from '../components/SettingItem';
import { motion } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05
        }
    }
};

const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
};

interface KeybindsTabProps {
    keybinds: { [key: string]: string };
    setKeybinds: (binds: { [key: string]: string }) => void;
}

const KeybindsTab = ({ keybinds, setKeybinds }: KeybindsTabProps) => {
    const [listening, setListening] = useState<string | null>(null);

    useEffect(() => {
        if (!listening) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            // Allow canceling with Escape (unless rebind is Escape itself, but usually Escape is cancel)
            if (e.key === 'Escape') {
                setListening(null);
                return;
            }

            // Update Keybind
            // const newKey = e.key.toUpperCase(); // Store as uppercase usually better for display

            // Validate? (e.g. don't allow special keys if needed, but for now allow all)

            const newKeybinds = { ...keybinds, [listening]: e.key }; // Store raw key
            setKeybinds(newKeybinds);
            localStorage.setItem('keybinds', JSON.stringify(newKeybinds));
            setListening(null);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [listening, keybinds, setKeybinds]);

    return (
        <motion.div
            className="space-y-6"
            variants={container}
            initial="hidden"
            animate="show"
        >
            <div>
                <h4 className="text-lg font-medium text-white mb-1">Keyboard Layout</h4>
                <p className="text-sm text-gray-500 mb-6">Customize application shortcuts.</p>

                <div className="space-y-6">
                    <SettingGroup title="General Shortcuts" variants={item}>
                        <SettingItem
                            title="Toggle Privacy Mode"
                            tooltip="Quickly enable/disable all privacy filters."
                        >
                            <button
                                onClick={() => setListening('togglePrivacy')}
                                className={`
                                    relative px-3 py-1.5 rounded-lg border text-sm font-mono transition-all min-w-[80px] flex items-center justify-center gap-2
                                    ${listening === 'togglePrivacy'
                                        ? "bg-blue-600 border-blue-500 text-white animate-pulse"
                                        : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white"
                                    }
                                `}
                            >
                                {listening === 'togglePrivacy' ? (
                                    <span>Press Key...</span>
                                ) : (
                                    <>
                                        <Keyboard size={14} className="opacity-50" />
                                        <span>{(keybinds.togglePrivacy || 'V').toUpperCase()}</span>
                                    </>
                                )}

                                {listening === 'togglePrivacy' && <X size={14} className="absolute right-[-24px] text-gray-400" />}
                            </button>
                        </SettingItem>
                    </SettingGroup>

                    <SettingGroup variant="info" variants={item}>
                        <p className="text-xs text-blue-300">
                            Press <span className="font-bold bg-blue-900/40 px-1 rounded border border-blue-900/60">Esc</span> to cancel rebinding. System keys (e.g. F5, Ctrl+R) cannot be overridden.
                        </p>
                    </SettingGroup>
                </div>
            </div>
        </motion.div>
    );
};

export default KeybindsTab;
