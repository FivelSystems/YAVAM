import { FC, ReactNode } from 'react';
import { AuthProvider } from '../features/auth/AuthContext';
import { KeybindProvider } from './KeybindContext';
import { ServerProvider } from './ServerContext';
import { LibraryProvider } from './LibraryContext';
import { PackageProvider } from './PackageContext';
import { FilterProvider } from './FilterContext';
import { SelectionProvider } from './SelectionContext';
import { ActionProvider } from './ActionContext';
import { ToastProvider } from './ToastContext';

// Utility to flatten Provider nesting
// Reduces the list [A, B, C] into <A><B><C>{children}</C></B></A>
const combineProviders = (...components: FC<{ children: ReactNode }>[]): FC<{ children: ReactNode }> => {
    return components.reduce(
        (AccumulatedComponents, CurrentComponent) => {
            return ({ children }: { children: ReactNode }) => {
                return (
                    <AccumulatedComponents>
                        <CurrentComponent>{children}</CurrentComponent>
                    </AccumulatedComponents>
                );
            };
        },
        ({ children }) => <>{children}</>
    );
};

export const AppProviders = combineProviders(
    AuthProvider,
    ToastProvider,     // Level 1: Must be before Server/Action/Package
    KeybindProvider,   // Level 1: Must be before Dashboard listeners
    ServerProvider,    // Level 2: Core Config
    LibraryProvider,
    PackageProvider,   // Level 2: Data
    FilterProvider,    // Level 3: UI State
    SelectionProvider,
    ActionProvider     // Level 4: Ops (Depend on everything)
);
