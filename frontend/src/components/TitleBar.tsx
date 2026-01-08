import { useState } from 'react';
import { Minus, Square, X, Pin } from 'lucide-react';
import { WindowMinimise, WindowToggleMaximise, Quit } from '../wailsjs/runtime/runtime';

const TitleBar = () => {
    const [isPinned, setIsPinned] = useState(false);

    const handlePin = async () => {
        const newState = !isPinned;
        setIsPinned(newState);
        // @ts-ignore
        await window.go.main.App.SetAlwaysOnTop(newState);
    };

    const handleMaximize = async () => {
        WindowToggleMaximise();
    };

    // @ts-ignore
    const isWeb = !window.go;

    return (
        <div className="h-8 bg-gray-900 flex justify-between items-center select-none w-full border-b border-gray-800 z-50">
            {/* Draggable Area */}
            <div className="flex-1 h-full wails-drag flex items-center px-4 gap-2">
                {/* App Icon/Title can go here if desired */}
                <div className="w-4 h-4 rounded bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]"></div>
                <span className="text-xs font-bold text-gray-400 tracking-wider">VAR MANAGER</span>
            </div>

            {/* Window Controls - Desktop Only */}
            {!isWeb && (
                <div className="flex h-full">
                    <button
                        onClick={handlePin}
                        className={`px-3 h-full flex items-center justify-center transition-colors ${isPinned ? 'text-blue-400 bg-blue-500/10' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-200'
                            }`}
                        title={isPinned ? "Unpin from Top" : "Pin to Top"}
                    >
                        {isPinned ? <Pin size={14} fill="currentColor" /> : <Pin size={14} />}
                    </button>
                    <div className="w-px h-1/2 bg-gray-800 my-auto mx-1"></div>
                    <button
                        onClick={WindowMinimise}
                        className="px-4 h-full flex items-center justify-center text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                    >
                        <Minus size={16} />
                    </button>
                    <button
                        onClick={handleMaximize}
                        className="px-4 h-full flex items-center justify-center text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                    >
                        <Square size={14} />
                    </button>
                    <button
                        onClick={Quit}
                        className="px-4 h-full flex items-center justify-center text-gray-400 hover:bg-red-600 hover:text-white transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default TitleBar;
