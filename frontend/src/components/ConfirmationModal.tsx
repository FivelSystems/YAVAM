import { AlertTriangle, Trash2, LucideIcon } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    confirmStyle?: 'danger' | 'primary' | 'warning' | 'purple';
    icon?: LucideIcon;
}

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", confirmStyle = 'primary', icon: Icon }: ConfirmationModalProps) => {
    if (!isOpen) return null;

    // Default icons if none provided
    const DefaultIcon = Icon || AlertTriangle;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in fade-in zoom-in duration-200">
                <div className="flex items-center gap-3 mb-4 text-white">
                    {confirmStyle === 'danger' && (
                        <div className="bg-red-500/20 p-2 rounded-lg">
                            <DefaultIcon size={24} className="text-red-400" />
                        </div>
                    )}
                    {confirmStyle === 'warning' && (
                        <div className="bg-yellow-500/20 p-2 rounded-lg">
                            <DefaultIcon size={24} className="text-yellow-400" />
                        </div>
                    )}
                    {confirmStyle === 'primary' && (
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                            <DefaultIcon size={24} className="text-blue-400" />
                        </div>
                    )}
                    {confirmStyle === 'purple' && (
                        <div className="bg-purple-500/20 p-2 rounded-lg">
                            <DefaultIcon size={24} className="text-purple-400" />
                        </div>
                    )}
                    <h2 className="text-xl font-bold">{title}</h2>
                </div>

                <p className="text-gray-300 mb-6 leading-relaxed whitespace-pre-wrap">
                    {message}
                </p>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-lg text-white font-medium flex items-center gap-2 transition-colors ${confirmStyle === 'danger' ? 'bg-red-600 hover:bg-red-500' :
                                confirmStyle === 'warning' ? 'bg-yellow-600 hover:bg-yellow-500 text-black' :
                                    confirmStyle === 'purple' ? 'bg-purple-600 hover:bg-purple-500' :
                                        'bg-blue-600 hover:bg-blue-500'
                            }`}
                    >
                        {confirmStyle === 'danger' && <Trash2 size={18} />}
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
