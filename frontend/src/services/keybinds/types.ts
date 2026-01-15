export type ModifierKey = 'CTRL' | 'ALT' | 'SHIFT' | 'META';

export interface KeybindDefinition {
    id: string;
    label: string;
    description?: string;
    defaultKeys: string[]; // e.g. ["CTRL", "S"]
    category: 'general' | 'navigation' | 'actions' | 'privacy';
    hidden?: boolean; // If true, not shown in settings UI
}

export type KeybindMap = Record<string, string[]>; // id -> current keys

export interface KeybindContextType {
    keybinds: KeybindMap;
    register: (def: KeybindDefinition) => void;
    check: (id: string, e: KeyboardEvent) => boolean;
    getLabel: (id: string) => string;
}
