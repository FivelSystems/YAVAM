import { useRef, useEffect, useState } from "react";
import { Terminal, Eraser } from "lucide-react";
import clsx from "clsx";

interface ConsoleProps {
    logs: string[];
    onClear?: () => void;
    className?: string;
    maxHeight?: string;
    title?: string;
}

const Console = ({
    logs,
    onClear,
    className,
    maxHeight = "h-48",
    title = "System Logs"
}: ConsoleProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [userScrolled, setUserScrolled] = useState(false);

    // Smart Auto-scroll
    useEffect(() => {
        const container = containerRef.current;
        if (logs.length > 0 && !userScrolled && container) {
            // Use scrollTop to avoid scrolling the main window
            container.scrollTop = container.scrollHeight;
        }
    }, [logs, userScrolled]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        // Tolerance of 20px
        const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 20;

        // Only update state if it changes to avoid thrashing
        if (isAtBottom && userScrolled) {
            setUserScrolled(false);
        } else if (!isAtBottom && !userScrolled) {
            setUserScrolled(true);
        }
    };

    return (
        <div className={clsx("flex flex-col", className)}>
            <div className="flex items-center justify-between mb-2">
                <label className="text-xs uppercase font-bold text-gray-500 flex items-center gap-2">
                    <Terminal size={14} /> {title}
                </label>
                {onClear && (
                    <button
                        onClick={onClear}
                        className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                    >
                        <Eraser size={12} /> Clear
                    </button>
                )}
            </div>
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className={clsx(
                    "bg-black rounded-lg border border-gray-800 p-3 overflow-y-auto font-mono text-xs text-gray-400 custom-scrollbar shadow-inner",
                    maxHeight
                )}>
                {logs.length === 0 && (
                    <div className="text-gray-600 italic select-none">Waiting for output...</div>
                )}
                <div className="space-y-0.5">
                    {logs.map((log, i) => (
                        <div key={i} className="break-all whitespace-pre-wrap font-mono">
                            <span className="text-gray-600 mr-2 select-none">[{i + 1}]</span>
                            {log}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Console;
