import React, { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_KEYBINDS } from '../config/defaultKeybinds';
import { KeybindDefinition, KeybindMap } from '../services/keybinds/types';

interface KeybindContextType {
    isListening: boolean;
    setListening: (val: boolean) => void;
    check: (id: string, e: KeyboardEvent) => boolean;
    register: (def: KeybindDefinition) => void;
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

        return e.key.toUpperCase() === primaryKey.toUpperCase();
    };

    const register = (def: KeybindDefinition) => {
        setDefinitions(prev => {
            if (prev.find(p => p.id === def.id)) return prev;
            return [...prev, def];
        });
    };

    return (
        <KeybindContext.Provider value={{ isListening, setListening, check, register, definitions }}>
            {children}
        </KeybindContext.Provider>
    );
};

export const useKeybind = () => {
    const context = useContext(KeybindContext);
    if (!context) throw new Error("useKeybind must be used within KeybindProvider");
    return context;
};
