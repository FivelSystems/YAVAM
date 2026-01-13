import clsx from 'clsx';
import { LayoutGrid } from 'lucide-react';

interface ApplicationTabProps {
    gridSize: number;
    setGridSize: (size: number) => void;
    itemsPerPage: number;
    setItemsPerPage: (val: number) => void;
    minimizeOnClose: boolean;
    setMinimizeOnClose: (val: boolean) => void;
    isWeb: boolean;
    maxToasts: number;
    setMaxToasts: (val: number) => void;
}

const ApplicationTab = ({
    gridSize,
    setGridSize,
    itemsPerPage,
    setItemsPerPage,
    minimizeOnClose,
    setMinimizeOnClose,
    isWeb,
    maxToasts,
    setMaxToasts
}: ApplicationTabProps) => {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <h4 className="text-lg font-medium text-white mb-1">Dashboard Config</h4>
                <p className="text-sm text-gray-500 mb-4">Customize your viewing experience.</p>
                <div className="space-y-6">
                    {/* Grid Size */}
                    <div className="bg-gray-700/20 rounded-xl p-4 border border-gray-700/50">
                        <div className="flex justify-between items-center mb-4">
                            <label className="text-sm text-gray-300 font-medium flex items-center gap-2">
                                <LayoutGrid size={16} /> Card Grid Size
                            </label>
                            <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded text-mono">{gridSize}px</span>
                        </div>
                        <input
                            type="range"
                            min="100"
                            max="300"
                            step="10"
                            value={gridSize}
                            onChange={(e) => setGridSize(parseInt(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-2">
                            <span>Compact</span>
                            <span>Large</span>
                        </div>
                    </div>

                    {/* Items Per Page */}
                    <div className="bg-gray-700/20 rounded-xl p-4 border border-gray-700/50 flex justify-between items-center">
                        <div className="space-y-1">
                            <label className="text-sm text-gray-300 font-medium block">Packages Per Page</label>
                            <p className="text-xs text-gray-500">Number of items loaded per pagination step.</p>
                        </div>
                        <input
                            type="number"
                            min="1"
                            max="100"
                            value={itemsPerPage}
                            onChange={(e) => setItemsPerPage(Math.max(1, parseInt(e.target.value) || 25))}
                            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none w-24 text-center"
                        />
                    </div>

                    {/* Max Toasts */}
                    <div className="bg-gray-700/20 rounded-xl p-4 border border-gray-700/50 flex justify-between items-center">
                        <div className="space-y-1">
                            <label className="text-sm text-gray-300 font-medium block">Notification Limit</label>
                            <p className="text-xs text-gray-500">Max concurrent notifications displayed.</p>
                        </div>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={maxToasts}
                            onChange={(e) => setMaxToasts(Math.max(1, parseInt(e.target.value) || 5))}
                            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none w-24 text-center"
                        />
                    </div>

                    {/* Minimize on Close (Desktop Only) */}
                    {!isWeb && (
                        <div className="bg-gray-700/20 rounded-xl p-4 border border-gray-700/50 flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-medium text-white">Run in Background</h4>
                                <p className="text-xs text-gray-500">Hide window on close instead of exiting.</p>
                            </div>
                            <button
                                onClick={() => setMinimizeOnClose(!minimizeOnClose)}
                                className={clsx(
                                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                    minimizeOnClose ? "bg-blue-600" : "bg-gray-700"
                                )}
                            >
                                <span className={clsx(
                                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200",
                                    minimizeOnClose ? "translate-x-6" : "translate-x-1"
                                )} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ApplicationTab;
