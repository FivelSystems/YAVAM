import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';

interface PrivacyTabProps {
    censorThumbnails: boolean;
    setCensorThumbnails: (val: boolean) => void;
    blurAmount: number;
    setBlurAmount: (val: number) => void;
    hidePackageNames: boolean;
    setHidePackageNames: (val: boolean) => void;
    hideCreatorNames: boolean;
    setHideCreatorNames: (val: boolean) => void;
}

const PrivacyTab = ({
    censorThumbnails,
    setCensorThumbnails,
    blurAmount,
    setBlurAmount,
    hidePackageNames,
    setHidePackageNames,
    hideCreatorNames,
    setHideCreatorNames
}: PrivacyTabProps) => {

    // Master Toggle State (derived)
    const hideAllMetadata = hidePackageNames && hideCreatorNames;

    const toggleAllMetadata = () => {
        const newVal = !hideAllMetadata;
        setHidePackageNames(newVal);
        setHideCreatorNames(newVal);
    };
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <h4 className="text-lg font-medium text-white mb-1">Privacy & Censorship</h4>
                <p className="text-sm text-gray-500 mb-4">Control visibility of sensitive content.</p>

                <div className="space-y-4">
                    {/* Global Privacy Toggle */}
                    <div className={clsx(
                        "rounded-xl p-6 border transition-colors",
                        censorThumbnails
                            ? "bg-blue-900/10 border-blue-500/30"
                            : "bg-gray-700/20 border-gray-700/50"
                    )}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={clsx(
                                    "p-3 rounded-lg transition-colors",
                                    censorThumbnails ? "bg-blue-500/20 text-blue-400" : "bg-gray-700 text-gray-400"
                                )}>
                                    {censorThumbnails ? <EyeOff size={24} /> : <Eye size={24} />}
                                </div>
                                <div>
                                    <h4 className="text-lg font-medium text-white">Privacy Mode</h4>
                                    <p className="text-sm text-gray-500">Blur thumbnails and hide sensitive info.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setCensorThumbnails(!censorThumbnails)}
                                className={clsx(
                                    "relative inline-flex h-7 w-12 items-center rounded-full transition-colors",
                                    censorThumbnails ? "bg-blue-600" : "bg-gray-700"
                                )}
                            >
                                <span className={clsx(
                                    "inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 shadow-md",
                                    censorThumbnails ? "translate-x-6" : "translate-x-1"
                                )} />
                            </button>
                        </div>
                    </div>

                    {/* Granular Controls (Only visible if Privacy Mode is ON?) - Or always customizable? Always customizable is better. */}
                    <div className="grid gap-4 md:grid-cols-2">
                        {/* Blur Intensity */}
                        <div className="bg-gray-700/20 rounded-xl p-4 border border-gray-700/50">
                            <label className="text-sm text-gray-300 font-medium mb-3 block">Blur Intensity</label>
                            <div className="flex items-center gap-4">
                                <input
                                    type="range"
                                    min="2"
                                    max="50"
                                    step="2"
                                    value={blurAmount}
                                    onChange={(e) => setBlurAmount(parseInt(e.target.value))}
                                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <span className="text-xs text-mono text-gray-400 w-8 text-right">{blurAmount}px</span>
                            </div>
                            <div className="mt-4 h-24 overflow-hidden rounded-lg relative group">
                                <img
                                    src="/favicon.png"
                                    alt="Preview"
                                    className="w-full h-full object-contain p-4 bg-gray-900/50 transition-all duration-300"
                                    style={{ filter: `blur(${censorThumbnails ? blurAmount : 0}px)` }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold uppercase tracking-widest text-white/50 bg-black/20 backdrop-blur-[1px]">Preview</div>
                            </div>
                        </div>

                        {/* Hide Metadata Section */}
                        <div className="bg-gray-700/20 rounded-xl p-4 border border-gray-700/50 space-y-4">
                            {/* Master Toggle */}
                            <div className="flex items-center justify-between pb-4 border-b border-gray-700/50">
                                <div>
                                    <h4 className="text-sm font-medium text-white">Hide Metadata</h4>
                                    <p className="text-xs text-gray-500">Quickly hide all text details (Packages & Creators).</p>
                                </div>
                                <button
                                    onClick={toggleAllMetadata}
                                    className={clsx(
                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                        hideAllMetadata ? "bg-blue-600" : "bg-gray-700"
                                    )}
                                >
                                    <span className={clsx(
                                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200",
                                        hideAllMetadata ? "translate-x-6" : "translate-x-1"
                                    )} />
                                </button>
                            </div>

                            {/* Individual Toggles */}
                            <div className="space-y-3 pl-2">
                                {/* Hide Package Names */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-300">Hide Package Names</h4>
                                        <p className="text-xs text-gray-500">Blur package filenames in the grid.</p>
                                    </div>
                                    <button
                                        onClick={() => setHidePackageNames(!hidePackageNames)}
                                        className={clsx(
                                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                            hidePackageNames ? "bg-blue-500" : "bg-gray-700"
                                        )}
                                    >
                                        <span className={clsx(
                                            "inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200",
                                            hidePackageNames ? "translate-x-5" : "translate-x-1"
                                        )} />
                                    </button>
                                </div>

                                {/* Hide Creator Names */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-300">Hide Creator Names</h4>
                                        <p className="text-xs text-gray-500">Blur artist/studio names.</p>
                                    </div>
                                    <button
                                        onClick={() => setHideCreatorNames(!hideCreatorNames)}
                                        className={clsx(
                                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                            hideCreatorNames ? "bg-blue-500" : "bg-gray-700"
                                        )}
                                    >
                                        <span className={clsx(
                                            "inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200",
                                            hideCreatorNames ? "translate-x-5" : "translate-x-1"
                                        )} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrivacyTab;
