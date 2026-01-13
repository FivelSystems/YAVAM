import { useRef, useEffect } from "react";
import { Terminal, Eraser } from "lucide-react";
import clsx from "clsx";

interface ConsoleProps {
    logs: string[];
    onClear?: () => void;
    className?: string;
    maxHeight?: string;
    autoScroll?: boolean;
    title?: string;
}

const Console = ({
    logs,
    onClear,
    className,
    maxHeight = "h-48",
    autoScroll = true,
    title = "System Logs"
}: ConsoleProps) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (autoScroll && endRef.current) {
            endRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, autoScroll]);

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
            <div className={clsx(
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
                <div ref={endRef} />
            </div>
        </div>
    );
};

export default Console;
