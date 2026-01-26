import React, { createContext, useContext } from 'react';
import { useLibrary } from '../hooks/useLibrary';

interface LibraryContextType {
    libraries: string[];
    setLibraries: (l: string[]) => void;
    activeLibraryPath: string;
    setActiveLibraryPath: (l: string) => void;
    activeLibIndex: number;
    setActiveLibIndex: (i: number) => void;
    needsSetup: boolean;
    setNeedsSetup: (v: boolean) => void;
    selectLibrary: (pathOrIndex: string | number) => void;
    addLibrary: (path: string) => void;
    removeLibrary: (path: string) => void;
    reorderLibraries: (order: string[]) => void;
    browseAndAdd: () => Promise<void>;
    activeLibIndexRef: React.MutableRefObject<number>;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const libraryLogic = useLibrary();

    // Future keybinds: 'next_library', 'prev_library' could go here

    return (
        <LibraryContext.Provider value={libraryLogic}>
            {children}
        </LibraryContext.Provider>
    );
};

export const useLibraryContext = () => {
    const context = useContext(LibraryContext);
    if (!context) throw new Error("useLibraryContext must be used within LibraryProvider");
    return context;
};
