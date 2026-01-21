import React from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';

interface InstallResultViewProps {
    installed: number;
    skipped: number;
    errors: string[];
    skippedDetails: string[]; // List of names skipped
    total: number; // Total attempted
    onViewLibrary: () => void;
    onClose: () => void;
}

export const InstallResultView: React.FC<InstallResultViewProps> = ({
    installed,
    skipped,
    errors,
    skippedDetails,
    total,
    onViewLibrary,
    onClose
}) => {
    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 flex flex-col items-center space-y-6 text-center overflow-y-auto custom-scrollbar pr-2 p-6">
                {/* Result Summary Icon */}
                <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mb-2">
                    <CheckCircle size={32} />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Installation Complete</h3>
                    <p className="text-gray-400 mt-1">
                        Processed {total} packages
                    </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3 w-full">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                        <div className="text-2xl font-bold text-green-400">{installed}</div>
                        <div className="text-xs text-green-300/70 uppercase tracking-wider font-medium">Installed</div>
                    </div>
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                        <div className="text-2xl font-bold text-yellow-400">{skipped}</div>
                        <div className="text-xs text-yellow-300/70 uppercase tracking-wider font-medium">Skipped</div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <div className="text-2xl font-bold text-red-400">{errors.length}</div>
                        <div className="text-xs text-red-300/70 uppercase tracking-wider font-medium">Errors</div>
                    </div>
                </div>

                {/* Details List (conditionally rendered) */}
                {(skippedDetails.length > 0 || errors.length > 0) && (
                    <div className="w-full text-left space-y-2 mt-4">
                        <p className="text-sm font-medium text-gray-300">Details:</p>
                        <div className="max-h-40 overflow-y-auto bg-gray-900/50 rounded-lg p-3 border border-gray-700 text-sm space-y-1">
                            {errors.map((name, i) => (
                                <div key={`err-${i}`} className="flex items-center gap-2 text-red-400">
                                    <AlertTriangle size={12} />
                                    <span className="truncate">{name} (Error)</span>
                                </div>
                            ))}
                            {skippedDetails.map((name, i) => (
                                <div key={`skip-${i}`} className="flex items-center gap-2 text-yellow-400">
                                    <AlertTriangle size={12} />
                                    <span className="truncate">{name} (Skipped - Exists)</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex gap-3 mt-auto">
                <button
                    onClick={onViewLibrary}
                    className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-medium transition-colors border border-gray-600"
                >
                    View Library
                </button>
                <button
                    onClick={onClose}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors shadow-blue-900/20"
                >
                    Ok
                </button>
            </div>
        </div>
    );
};
