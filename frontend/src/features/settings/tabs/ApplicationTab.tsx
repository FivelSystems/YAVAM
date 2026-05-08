// Generic Components
import { useState, useEffect, useCallback } from 'react';
import { SettingGroup } from '../components/SettingGroup';
import { SettingItem } from '../components/SettingItem';
import { Toggle } from '../../../components/ui/Toggle';
import { Input } from '../../../components/ui/Input';
import { Slider } from '../../../components/ui/Slider';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05
        }
    }
};

const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
};

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
    // ── Thumbnail cache ───────────────────────────────────────────────────────
    const [cacheSize, setCacheSize] = useState<number | null>(null);
    const [cacheClearing, setCacheClearing] = useState(false);

    const refreshCacheSize = useCallback(async () => {
        if (!window.go) return;
        try {
            // @ts-ignore
            const bytes = await window.go.main.App.GetThumbnailCacheSize();
            setCacheSize(bytes);
        } catch { /* non-fatal */ }
    }, []);

    useEffect(() => { refreshCacheSize(); }, [refreshCacheSize]);

    const handleClearCache = async () => {
        if (!window.go) return;
        setCacheClearing(true);
        try {
            // @ts-ignore
            await window.go.main.App.ClearThumbnailCache();
            await refreshCacheSize();
        } catch { /* non-fatal */ } finally {
            setCacheClearing(false);
        }
    };

    const formatBytes = (b: number) => {
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
        return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-6"
        >
            <div>
                <h4 className="text-lg font-medium text-white mb-1">Dashboard Config</h4>
                <p className="text-sm text-gray-500 mb-6">Customize your viewing experience.</p>
                <div className="space-y-6">

                    {/* Display Settings */}
                    <SettingGroup title="Display Settings" variants={item}>
                        <SettingItem
                            title="Card Grid Size"
                            tooltip="Adjust the size of package thumbnails."
                        >
                            <div className="w-48">
                                <Slider
                                    min={100}
                                    max={300}
                                    step={10}
                                    value={gridSize}
                                    onChange={setGridSize}
                                    label={`${gridSize}px`}
                                />
                            </div>
                        </SettingItem>

                        <SettingItem
                            title="Packages Per Page"
                            tooltip="Number of items loaded per pagination step."
                        >
                            <Input
                                type="number"
                                min={1}
                                max={100}
                                value={itemsPerPage}
                                onChange={(e) => setItemsPerPage(Math.max(1, parseInt(e.target.value) || 25))}
                                className="w-24 text-center font-mono"
                            />
                        </SettingItem>

                        <SettingItem
                            title="Notification Limit"
                            tooltip="Max concurrent notifications displayed."
                        >
                            <Input
                                type="number"
                                min={1}
                                max={10}
                                value={maxToasts}
                                onChange={(e) => setMaxToasts(Math.max(1, parseInt(e.target.value) || 5))}
                                className="w-24 text-center font-mono"
                            />
                        </SettingItem>
                    </SettingGroup>

                    {/* Desktop Settings */}
                    {!isWeb && (
                        <SettingGroup title="Desktop Environment" variants={item}>
                            <SettingItem
                                title="Run in Background"
                                tooltip="Hide window on close instead of exiting."
                            >
                                <Toggle
                                    checked={minimizeOnClose}
                                    onChange={setMinimizeOnClose}
                                />
                            </SettingItem>
                        </SettingGroup>
                    )}

                    {/* Thumbnail Cache */}
                    {!isWeb && (
                        <SettingGroup title="Thumbnail Cache" variants={item}>
                            <SettingItem
                                title="Package Cover Cache"
                                tooltip="YAVAM caches one cover image per package so it doesn't need to re-open .var files on every startup. Only package covers are stored — not content thumbnails."
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-mono text-gray-400">
                                        {cacheSize === null ? '—' : formatBytes(cacheSize)}
                                    </span>
                                    <button
                                        id="clear-thumbnail-cache-btn"
                                        onClick={handleClearCache}
                                        disabled={cacheClearing || cacheSize === 0}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Trash2 size={13} />
                                        {cacheClearing ? 'Clearing…' : 'Clear Cache'}
                                    </button>
                                </div>
                            </SettingItem>
                        </SettingGroup>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default ApplicationTab;
