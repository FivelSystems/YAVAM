import React from 'react';
import { AlertTriangle, FolderPlus, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface ErrorBannerProps {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, actionLabel, onAction }) => (
    <div role="alert" className="bg-red-500/10 border-b border-red-500/20 p-4 flex flex-col sm:flex-row items-center justify-center text-red-400 gap-3 shrink-0 text-center">
        <span className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="font-medium">{message}</span>
        </span>
        {actionLabel && onAction && (
            <Button variant="danger" size="md" className="min-h-11 w-full sm:w-auto" onClick={onAction}>
                {actionLabel}
            </Button>
        )}
    </div>
);

/** Stands in for the grid until the host has said which libraries exist. */
export const LibrariesLoadingNotice: React.FC = () => (
    <div role="status" className="h-full flex flex-col items-center justify-center gap-3 text-gray-400 p-4 text-center">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Loading your libraries…</p>
    </div>
);

interface NoLibrariesNoticeProps {
    onAddLibrary?: () => void;
}

/** Shown when the host has no libraries; only the desktop app can add one. */
export const NoLibrariesNotice: React.FC<NoLibrariesNoticeProps> = ({ onAddLibrary }) => (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-gray-400 p-4 text-center">
        <FolderPlus size={48} className="opacity-50" />
        <p className="text-lg font-semibold text-gray-300">No libraries yet</p>
        {onAddLibrary ? (
            <>
                <p className="text-sm max-w-md">Add the folder that holds your .var packages to get started.</p>
                <Button variant="primary" size="lg" className="min-h-11 w-full sm:w-auto" onClick={onAddLibrary} icon={<FolderPlus size={18} />}>
                    Add library
                </Button>
            </>
        ) : (
            <p className="text-sm max-w-md">Ask whoever runs YAVAM on the host computer to add a library.</p>
        )}
    </div>
);
