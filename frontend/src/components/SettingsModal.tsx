import { X, FolderOpen } from 'lucide-react';
import { useState, useEffect } from 'react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentPath: string;
    onSavePath: (path: string) => void;
}

const SettingsModal = ({ isOpen, onClose, currentPath, onSavePath }: SettingsModalProps) => {
    const [path, setPath] = useState(currentPath);

    useEffect(() => {
        setPath(currentPath);
    }, [currentPath]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white">Settings</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            Library Folder
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="C:\VarLibrary"
                            />
                            <button
                                onClick={async () => {
                                    try {
                                        // @ts-ignore
                                        const p = await window.go.main.App.SelectDirectory();
                                        if (p) setPath(p);
                                    } catch (err) {
                                        console.error(err);
                                    }
                                }}
                                className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg transition-colors"
                                title="Browse Folder"
                            >
                                <FolderOpen size={20} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            This folder should contain your .var files.
                        </p>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                onSavePath(path);
                                onClose();
                            }}
                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
