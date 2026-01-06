import { Loader2 } from 'lucide-react';

interface LoadingToastProps {
    visible: boolean;
    message?: string;
}

const LoadingToast = ({ visible, message = "Scanning packages..." }: LoadingToastProps) => {
    if (!visible) return null;

    return (
        <div className="fixed bottom-4 right-4 bg-gray-900 border border-gray-700 shadow-2xl rounded-lg p-4 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 z-50">
            <Loader2 className="animate-spin text-blue-500" size={24} />
            <div className="flex flex-col">
                <span className="text-sm font-bold text-white">Processing</span>
                <span className="text-xs text-gray-400">{message}</span>
            </div>
        </div>
    );
};

export default LoadingToast;
