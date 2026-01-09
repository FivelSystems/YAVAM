import { Loader2 } from 'lucide-react';

interface LoadingToastProps {
    visible: boolean;
    message?: string;
    progress?: { current: number; total: number };
}

const LoadingToast = ({ visible, message = "Scanning packages...", progress }: LoadingToastProps) => {
    if (!visible) return null;

    const percentage = progress && progress.total > 0
        ? Math.min(100, (progress.current / progress.total) * 100)
        : 0;

    return (
        <div className="fixed bottom-4 right-4 bg-gray-900 border border-gray-700 shadow-2xl rounded-lg p-4 flex gap-3 animate-in fade-in slide-in-from-bottom-4 z-50 min-w-[300px]">
            <div className="flex items-center h-full pt-1">
                <Loader2 className="animate-spin text-blue-500" size={24} />
            </div>
            <div className="flex flex-col flex-1">
                <span className="text-sm font-bold text-white mb-0.5">Processing</span>
                <span className="text-xs text-gray-400 mb-2">{message}</span>

                {progress && progress.total > 0 && (
                    <div className="w-full">
                        <div className="flex justify-between text-[10px] text-gray-500 mb-1 font-mono">
                            <span>{progress.current}</span>
                            <span>{progress.total}</span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                            <div
                                className="bg-blue-500 h-full transition-all duration-300 ease-out"
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LoadingToast;
