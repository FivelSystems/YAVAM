import React, { createContext, useContext } from 'react';
import { useServer } from '../hooks/useServer'; // Logic hook
import { useToasts } from './ToastContext';


// Extract return type from the hook manually or use logic
// Ideally interface matches useServer return
interface ServerContextType {
    serverEnabled: boolean;
    setServerEnabled: (v: boolean) => void;
    serverPort: string;
    setServerPort: (v: string) => void;
    localIP: string;
    setLocalIP: (v: string) => void;
    serverLogs: string[];
    setServerLogs: (v: string[]) => void;
    isTogglingServer: boolean;
    setIsTogglingServer: (v: boolean) => void;
    publicAccess: boolean;
    setPublicAccess: (v: boolean) => void;
    authPollInterval: number;
    setAuthPollInterval: (v: number) => void;

    toggleServer: () => Promise<void>;
    togglePublicAccess: () => Promise<void>;
    updateAuthPollInterval: (val: number) => Promise<void>;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

export const ServerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // We use the hook for state logic
    const serverLogic = useServer();
    const { addToast } = useToasts();

    // Keybinds
    // We wrap the toggleServer call to inject addToast automatically


    // Wrappers to hide addToast from consumers
    const wrappedLogic = {
        ...serverLogic,
        toggleServer: () => serverLogic.toggleServer(addToast),
        togglePublicAccess: () => serverLogic.togglePublicAccess(addToast),
        updateAuthPollInterval: (val: number) => serverLogic.updateAuthPollInterval(val, addToast)
    };

    return (
        <ServerContext.Provider value={wrappedLogic}>
            {children}
        </ServerContext.Provider>
    );
};

export const useServerContext = () => {
    const context = useContext(ServerContext);
    if (!context) throw new Error("useServerContext must be used within ServerProvider");
    return context;
};
