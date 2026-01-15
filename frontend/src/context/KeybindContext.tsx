import React, { createContext, useContext, useState, useEffect } from 'react';
import { DEFAULT_KEYBINDS } from '../config/defaultKeybinds';
import { KeybindDefinition } from '../services/keybinds/types';

interface KeybindContextType {
    isListening: boolean;
    setListening: (val: boolean) => void;
    check: (id: string, e: KeyboardEvent) => boolean;
    register: (def: KeybindDefinition) => void;
    rebind: (id: string, keys: string[]) => void;
    reset: (id: string) => void;
    definitions: KeybindDefinition[];
}

const KeybindContext = createContext<KeybindContextType | undefined>(undefined);

export const KeybindProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isListening, setListening] = useState(true);
    const [definitions, setDefinitions] = useState(DEFAULT_KEYBINDS);

    // In v1.3.1 we only support defaults. v1.4.0 will add localStorage remapping.
    const getKeys = (id: string) => {
        const def = definitions.find(d => d.id === id);
        return def ? def.defaultKeys : [];
    };

    const register = (def: KeybindDefinition) => {
        setDefinitions(prev => {
            if (prev.find(p => p.id === def.id)) return prev;
            return [...prev, def];
        });
    };

    const check = (id: string, e: KeyboardEvent): boolean => {
        if (!isListening) return false;

        // Ignore inputs generally, unless specific allow-list (to be implemented)
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            // Exceptions: ESC causes blur?
            if (e.key === 'Escape') return true;
            return false;
        }

        const requiredKeys = getKeys(id);
        if (requiredKeys.length === 0) return false;

        // Check Modifiers
        const needsCtrl = requiredKeys.includes('CTRL');
        const needsShift = requiredKeys.includes('SHIFT');
        const needsAlt = requiredKeys.includes('ALT');
        const needsMeta = requiredKeys.includes('META');

        if (e.ctrlKey !== needsCtrl) return false;
        if (e.shiftKey !== needsShift) return false;
        if (e.altKey !== needsAlt) return false;
        if (e.metaKey !== needsMeta) return false;

        // Check Primary Key
        const primaryKey = requiredKeys.find(k => !['CTRL', 'SHIFT', 'ALT', 'META'].includes(k));
        if (!primaryKey) return false; // Modifier only?

        if (primaryKey.toUpperCase() === 'SPACE' && e.code === 'Space') return true;
        if (primaryKey.toUpperCase() === 'DELETE' && e.key === 'Delete') return true;
        if (primaryKey.toUpperCase() === 'ESCAPE' && e.key === 'Escape') return true;
        if (primaryKey.toUpperCase() === 'TAB' && e.key === 'Tab') return true;
        if (primaryKey.toUpperCase() === 'LEFT' && e.key === 'ArrowLeft') return true;
        if (primaryKey.toUpperCase() === 'RIGHT' && e.key === 'ArrowRight') return true;
        if (primaryKey.toUpperCase() === 'UP' && e.key === 'ArrowUp') return true;
        if (primaryKey.toUpperCase() === 'DOWN' && e.key === 'ArrowDown') return true;

        return e.key.toUpperCase() === primaryKey.toUpperCase();
    };

    // Load overrides from Config? We need initial state. 
    // Actually, wails init happens before react, we can fetch config or assume passed via props?
    // For now, let's load from localStorage as a fallback, but we should sync with backend.
    // Ideally, App.tsx fetches config and passes it down.
    // BUT to keep it simple, we can fetch on mount.

    useEffect(() => {
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            window.go.main.App.GetConfig().then((cfg: any) => {
                if (cfg.keybinds) {
                    // Merge Overrides
                    setDefinitions(prev => prev.map(def => {
                        if (cfg.keybinds[def.id]) {
                            // Convert ["CTRL", "F"] to internal structure if needed?
                            // Our definition uses defaultKeys string array.
                            return { ...def, defaultKeys: cfg.keybinds[def.id] };
                        }
                        return def;
                    }));
                }
            });
        }
    }, []);



    const rebind = (id: string, keys: string[]) => {
        setDefinitions(prev => {
            const newDefs = prev.map(d => d.id === id ? { ...d, defaultKeys: keys } : d);

            // Persist to Backend
            // @ts-ignore
            if (window.go && window.go.main && window.go.main.App) {
                // Construct map
                const overrides: Record<string, string[]> = {};
                newDefs.forEach(d => {
                    // Start with defaults, if different, add to map. 
                    // Or just save all? Saving all is safer for now.
                    // Actually, we should only save diffs to keep config clean, but simple is better.
                    if (JSON.stringify(d.defaultKeys) !== JSON.stringify(DEFAULT_KEYBINDS.find(k => k.id === d.id)?.defaultKeys)) {
                        overrides[d.id] = d.defaultKeys;
                    }
                });
                // @ts-ignore
                window.go.main.App.SaveKeybinds(overrides);
            }

            return newDefs;
        });
    };

    const reset = (id: string) => {
        const original = DEFAULT_KEYBINDS.find(d => d.id === id);
        if (original) rebind(id, original.defaultKeys);
    };

    return (
        <KeybindContext.Provider value={{ isListening, setListening, check, register, rebind, reset, definitions }}>
            {children}
        </KeybindContext.Provider>
    );
};

export const useKeybind = () => {
    const context = useContext(KeybindContext);
    if (!context) throw new Error("useKeybind must be used within KeybindProvider");
    return context;
};
