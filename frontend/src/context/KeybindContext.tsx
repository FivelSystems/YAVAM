import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { DEFAULT_KEYBINDS } from '../config/defaultKeybinds';
import { KeybindDefinition } from '../services/keybinds/types';

type KeybindCallback = (e: KeyboardEvent) => void;
type Unsubscribe = () => void;

interface KeybindContextType {
    isListening: boolean;
    setListening: (val: boolean) => void;
    register: (def: KeybindDefinition) => void;
    rebind: (id: string, keys: string[]) => void;
    reset: (id: string) => void;
    definitions: KeybindDefinition[];
    subscribe: (actionId: string, callback: KeybindCallback) => Unsubscribe;
}

const KeybindContext = createContext<KeybindContextType | undefined>(undefined);

export const KeybindProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isListening, setListening] = useState(true);
    const [definitions, setDefinitions] = useState(DEFAULT_KEYBINDS);
    const subscribersRef = useRef<Record<string, KeybindCallback[]>>({});

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

    const subscribe = useCallback((id: string, cb: KeybindCallback): Unsubscribe => {
        if (!subscribersRef.current[id]) {
            subscribersRef.current[id] = [];
        }
        subscribersRef.current[id].push(cb);

        return () => {
            if (subscribersRef.current[id]) {
                subscribersRef.current[id] = subscribersRef.current[id].filter(fn => fn !== cb);
            }
        };
    }, []);

    const check = (id: string, e: KeyboardEvent): boolean => {
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

    // Global Listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isListening) return;

            // Iterate definitions to find match
            // We use the order of definitions as priority if needed, or just find first match.
            // Dashboard used if-else chain.
            for (const def of definitions) {
                if (check(def.id, e)) {
                    const subs = subscribersRef.current[def.id];
                    if (subs && subs.length > 0) {
                        subs.forEach(cb => cb(e));
                        // We do NOT automatically preventDefault here to allow flexibility, 
                        // but usually keybinds consume the event.
                        // If specific subscribers want to prevent default they can.
                        return; // Stop propagation/checking other keybinds
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [definitions, isListening]);

    // Load overrides from Config
    useEffect(() => {
        // @ts-ignore
        if (window.go && window.go.main && window.go.main.App) {
            // @ts-ignore
            window.go.main.App.GetConfig().then((cfg: any) => {
                if (cfg.keybinds) {
                    setDefinitions(prev => prev.map(def => {
                        if (cfg.keybinds[def.id]) {
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
                const overrides: Record<string, string[]> = {};
                newDefs.forEach(d => {
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
        <KeybindContext.Provider value={{ isListening, setListening, register, rebind, reset, definitions, subscribe }}>
            {children}
        </KeybindContext.Provider>
    );
};

export const useKeybind = () => {
    const context = useContext(KeybindContext);
    if (!context) throw new Error("useKeybind must be used within KeybindProvider");
    return context;
};

// Hook for components to subscribe
export const useKeybindSubscription = (actionId: string, callback: KeybindCallback, deps: React.DependencyList = []) => {
    const { subscribe } = useKeybind();

    useEffect(() => {
        const unsubscribe = subscribe(actionId, callback);
        return unsubscribe;
    }, [subscribe, actionId, ...deps]);
};
