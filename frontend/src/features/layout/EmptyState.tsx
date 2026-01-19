import React from 'react';
import TitleBar from '../../components/layout/TitleBar';
import SetupWizard from '../../features/setup/SetupWizard';
import { RefreshCw, WifiOff } from 'lucide-react';

interface EmptyStateProps {
    needsSetup: boolean;
    setNeedsSetup: (needs: boolean) => void;
    addLibrary: (path: string) => void;
    activeLibraryPath: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    needsSetup,
    setNeedsSetup,
    addLibrary,
    activeLibraryPath
}) => {
    // 1. Setup Wizard
    if (needsSetup) {
        return (
            <>
                {/* @ts-ignore */}
                {window.go && <TitleBar />}
                {/* @ts-ignore */}
                <SetupWizard onComplete={(libPath?: string) => {
                    setNeedsSetup(false);
                    if (libPath) {
                        addLibrary(libPath);
                    }
                    // Fresh Install completed: Mark version as seen
                    // @ts-ignore
                    if (window.go) {
                        // @ts-ignore
                        window.go.main.App.GetAppVersion().then((v: string) => window.go.main.App.SetLastSeenVersion(v));
                    }
                }} />
            </>
        );
    }

    // 2. Waiting for Host (Web Mode)
    // If not setup and no active path (and not purely waiting for setup which is above)
    // Actually Dashboard logic was: if needsSetup returns wizard.
    // If !activeLibraryPath AND !window.go returns "Waiting Host".

    if (!activeLibraryPath) {
        // @ts-ignore
        if (!window.go) {
            return (
                <div className="flex h-screen items-center justify-center bg-gray-900 text-white flex-col p-8 text-center space-y-6">
                    <div className="bg-red-500/10 p-6 rounded-full animate-pulse">
                        <WifiOff size={48} className="text-red-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold mb-2">Waiting for Host Configuration</h1>
                        <p className="text-gray-400 max-w-md mx-auto">
                            The host application has not configured a library folder yet.
                            Please return to the host machine and select a Repository folder.
                        </p>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
                    >
                        <RefreshCw size={18} /> Retry Connection
                    </button>
                </div>
            );
        }
    }

    return null;
};
