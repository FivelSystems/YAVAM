import { KeybindDefinition } from "../services/keybinds/types";

export const DEFAULT_KEYBINDS: KeybindDefinition[] = [
    // General
    {
        id: "open_settings",
        label: "Open Settings",
        category: "general",
        defaultKeys: ["CTRL", ","]
    },
    {
        id: "toggle_privacy",
        label: "Toggle Privacy Mode",
        category: "privacy",
        defaultKeys: ["V"]
    },

    // Navigation
    {
        id: "toggle_sidebar",
        label: "Toggle Sidebar",
        category: "navigation",
        defaultKeys: ["TAB"]
    },
    {
        id: "focus_search",
        label: "Focus Search",
        category: "navigation",
        defaultKeys: ["CTRL", "F"]
    },

    // Actions
    {
        id: "select_all",
        label: "Select All",
        category: "actions",
        defaultKeys: ["CTRL", "A"]
    },
    {
        id: "delete_selected",
        label: "Delete Selected",
        category: "actions",
        defaultKeys: ["DELETE"]
    },
    {
        id: "clear_selection",
        label: "Clear Selection / Close",
        category: "general",
        defaultKeys: ["ESCAPE"]
    },
    {
        id: "refresh",
        label: "Refresh Library",
        category: "actions",
        defaultKeys: ["F5"]
    },
    {
        id: "toggle_server",
        label: "Toggle Server",
        category: "actions",
        defaultKeys: ["CTRL", "S"]
    }
];
