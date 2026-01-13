import { Github } from 'lucide-react';

interface AboutTabProps {
    appVersion: string;
}

const AboutTab = ({ appVersion }: AboutTabProps) => {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300 h-full flex flex-col justify-center">
            <div className="flex flex-col items-center justify-center pt-8 h-full">
                <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-8 shadow-2xl max-w-xl w-full mx-4">
                    <div className="w-24 h-24 md:w-32 md:h-32 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-900/30">
                        <span className="text-4xl md:text-6xl font-bold text-white select-none">Y</span>
                    </div>
                    <div className="flex-1 text-center md:text-left space-y-4 w-full">
                        <div>
                            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">YAVAM</h2>
                            <p className="text-gray-400 text-sm mt-1">Yet Another VaM Addon Manager</p>
                        </div>
                        <div className="flex flex-col md:flex-row items-center gap-3 pt-2 justify-center md:justify-start">
                            <span className="px-2.5 py-1 bg-gray-700/50 rounded-md text-xs font-mono text-gray-300 border border-gray-600/50">
                                {appVersion}
                            </span>
                            <div className="hidden md:block h-4 w-px bg-gray-700"></div>
                            <button
                                onClick={() => {
                                    // @ts-ignore
                                    if (window.runtime) window.runtime.BrowserOpenURL("https://github.com/fivelsystems/yavam");
                                    else window.open("https://github.com/fivelsystems/yavam", "_blank");
                                }}
                                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs font-medium uppercase tracking-wide group"
                            >
                                <Github size={14} className="group-hover:text-blue-400 transition-colors" />
                                <span>Repository</span>
                            </button>
                        </div>
                    </div>
                </div>
                <div className="mt-8 md:mt-12 text-center space-y-1">
                    <p className="text-gray-500 text-sm">Designed & Developed by <span className="text-gray-300 font-medium">FivelSystems</span></p>
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest">Copyright © 2026</p>
                </div>
            </div>
        </div>
    );
};

export default AboutTab;
