import { SettingGroup } from '../components/SettingGroup';
import { SettingItem } from '../components/SettingItem';
import { Toggle } from '../../../components/ui/Toggle';
import { Slider } from '../../../components/ui/Slider';
import { motion } from 'framer-motion';

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
    return (
        <motion.div
            className="space-y-6"
            variants={container}
            initial="hidden"
            animate="show"
        >
            <div>
                <h4 className="text-lg font-medium text-white mb-1">Content Privacy</h4>
                <p className="text-sm text-gray-500 mb-6">Control what is visible on screen.</p>
                <div className="space-y-6">

                    {/* Visual Censorship */}
                    <SettingGroup title="Visual Censorship" variants={item}>
                        <SettingItem
                            title="Blur Thumbnails"
                            tooltip="Apply blur effect to package images."
                        >
                            <Toggle
                                checked={censorThumbnails}
                                onChange={setCensorThumbnails}
                            />
                        </SettingItem>

                        <SettingItem
                            title="Blur Strength"
                            tooltip="Intensity of the blur effect."
                        >
                            <div className="w-48">
                                <Slider
                                    min={1}
                                    max={20}
                                    step={1}
                                    value={blurAmount}
                                    onChange={setBlurAmount}
                                    label={`${blurAmount}px`}
                                />
                            </div>
                        </SettingItem>

                        {/* Preview Section */}
                        <div className="mt-4 pt-4 border-t border-gray-700/50">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium text-gray-400">Preview</span>
                            </div>
                            <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-gray-700 bg-gray-900 group shadow-inner">
                                <img
                                    src="/favicon.png"
                                    alt="Preview"
                                    className="w-full h-full object-cover p-2"
                                    style={{ filter: `blur(${blurAmount}px)` }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-white/90 font-mono text-xs font-bold drop-shadow-lg px-2 py-1 rounded bg-black/30 backdrop-blur-md border border-white/10">
                                        Censored
                                    </span>
                                </div>
                            </div>
                        </div>
                    </SettingGroup>

                    {/* Metadata Privacy */}
                    <SettingGroup title="Metadata Hiding" variants={item}>
                        <SettingItem
                            title="Hide Package Names"
                            tooltip="Replace filenames with asterisks."
                        >
                            <Toggle
                                checked={hidePackageNames}
                                onChange={setHidePackageNames}
                            />
                        </SettingItem>

                        <SettingItem
                            title="Hide Creator Names"
                            tooltip="Mask creator information."
                        >
                            <Toggle
                                checked={hideCreatorNames}
                                onChange={setHideCreatorNames}
                            />
                        </SettingItem>
                    </SettingGroup>

                    {/* Information Box */}
                    <SettingGroup variant="info" variants={item}>
                        <div className="flex items-start gap-3">
                            <img src="/favicon.png" className="w-8 h-8 opacity-80" alt="YAVAM" />
                            <div className="space-y-1">
                                <h4 className="text-sm font-bold text-blue-300">Privacy Mode</h4>
                                <p className="text-xs text-blue-200/80 leading-relaxed">
                                    These settings are applied locally to your current session. Great for capturing screenshots or streaming without leaking content.
                                </p>
                            </div>
                        </div>
                    </SettingGroup>
                </div>
            </div>
        </motion.div>
    );
};

export default PrivacyTab;
