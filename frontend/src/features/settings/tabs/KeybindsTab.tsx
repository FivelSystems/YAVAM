import { useState, useEffect } from 'react';
import { useKeybind } from '../../../context/KeybindContext';
import { SettingGroup } from '../components/SettingGroup';
import { SettingItem } from '../components/SettingItem';
import { motion } from 'framer-motion';
import { RotateCcw, Loader2 } from 'lucide-react';
import { DEFAULT_KEYBINDS } from '../../../config/defaultKeybinds';

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

const KeybindsTab = () => {
    const { definitions, rebind, reset } = useKeybind();
    const [recordingId, setRecordingId] = useState<string | null>(null);

    // Recording Logic
    useEffect(() => {
        if (!recordingId) return;

        const handleRecordData = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            // Ignore modifier-only presses for finalization, but we can't really visualize them easily without complex logic.
            // Simplified: Wait for a non-modifier key OR just accept modifiers + key.
            const modifiers: string[] = [];
            if (e.ctrlKey) modifiers.push('CTRL');
            if (e.shiftKey) modifiers.push('SHIFT');
            if (e.altKey) modifiers.push('ALT');
            if (e.metaKey) modifiers.push('META');

            const key = e.key.toUpperCase();

            // If just modifier, wait.
            if (['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key)) return;

            // Finalize
            let finalKey = key;
            if (key === ' ') finalKey = 'SPACE';

            const newKeys = [...modifiers, finalKey];
            rebind(recordingId, newKeys);
            setRecordingId(null);
        };

        window.addEventListener('keydown', handleRecordData, { capture: true });
        // We also need to capture mousedown to click away/cancel?
        const handleClick = (_e: MouseEvent) => {
            // If clicking outside, cancel
            setRecordingId(null);
        };
        window.addEventListener('mousedown', handleClick); // simplified

        return () => {
            window.removeEventListener('keydown', handleRecordData, { capture: true });
            window.removeEventListener('mousedown', handleClick);
        };
    }, [recordingId, rebind]);


    // Group by Category
    const categories = {
        general: definitions.filter(d => d.category === 'general'),
        navigation: definitions.filter(d => d.category === 'navigation'),
        actions: definitions.filter(d => d.category === 'actions'),
        privacy: definitions.filter(d => d.category === 'privacy'),
    };

    const isModified = (id: string, currentKeys: string[]) => {
        const def = DEFAULT_KEYBINDS.find(d => d.id === id);
        if (!def) return false;
        return JSON.stringify(def.defaultKeys) !== JSON.stringify(currentKeys);
    };

    const renderKey = (id: string, keys: string[]) => {
        const isRecording = recordingId === id;

        if (isRecording) {
            return (
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-500/50 rounded text-blue-300 animate-pulse text-xs font-mono">
                    <Loader2 size={12} className="animate-spin" /> Press Keys...
                </div>
            );
        }

        const modified = isModified(id, keys);

        return (
            <div className="flex items-center gap-2">
                {modified && (
                    <button
                        onClick={(e) => { e.stopPropagation(); reset(id); }}
                        className="p-1 text-gray-500 hover:text-yellow-400 transition-colors"
                        title="Reset to Default"
                    >
                        <RotateCcw size={14} />
                    </button>
                )}
                <button
                    onClick={() => setRecordingId(id)}
                    className={`flex gap-1 justify-end hover:scale-105 transition-transform ${modified ? 'text-yellow-400' : ''}`}
                >
                    {keys.map((k, i) => (
                        <span key={i} className={`px-2 py-1 border rounded text-xs font-mono min-w-[24px] text-center ${modified ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                            {k}
                        </span>
                    ))}
                    {keys.length === 0 && <span className="text-xs text-gray-600 italic">None</span>}
                </button>
            </div>
        );
    };

    return (
        <motion.div
            className="space-y-6"
            variants={container}
            initial="hidden"
            animate="show"
        >
            <div>
                <h4 className="text-lg font-medium text-white mb-1">Keyboard Shortcuts</h4>
                <p className="text-sm text-gray-500 mb-6">Click a shortcut to rebind it.</p>

                <div className="space-y-6">
                    {Object.entries(categories).map(([cat, defs]) => {
                        if (defs.length === 0) return null;
                        return (
                            <SettingGroup key={cat} title={cat.charAt(0).toUpperCase() + cat.slice(1)} variants={item}>
                                {defs.map(def => (
                                    <SettingItem
                                        key={def.id}
                                        title={def.label}
                                        tooltip={def.description}
                                    >
                                        {renderKey(def.id, def.defaultKeys)}
                                    </SettingItem>
                                ))}
                            </SettingGroup>
                        );
                    })}
                </div>
            </div>
        </motion.div>
    );
};

export default KeybindsTab;
