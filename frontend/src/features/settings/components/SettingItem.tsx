import { ReactNode, useState } from 'react';
import clsx from 'clsx';
import { Info } from 'lucide-react';

interface SettingItemProps {
    title: ReactNode;
    tooltip?: string; // New: Tooltip text instead of inline description
    children: ReactNode;
    className?: string;
    layout?: 'row' | 'col';
}

export const SettingItem = ({
    title,
    tooltip,
    children,
    className,
    layout = 'row'
}: SettingItemProps) => {
    const [showTooltip, setShowTooltip] = useState(false);

    // Height: Standard Row = 40px (h-10) to be dense.
    const containerClasses = clsx(
        "group relative flex transition-colors rounded-lg",
        layout === 'row' ? "items-center justify-between h-10 px-2 hover:bg-white/5" : "flex-col space-y-2 py-2 px-2 hover:bg-white/5",
        className
    );

    return (
        <div className={containerClasses}>
            <div className="flex items-center gap-2 min-w-0">
                {tooltip && (
                    <div
                        className="relative flex items-center"
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={() => setShowTooltip(false)}
                        onClick={() => setShowTooltip(!showTooltip)} // Mobile tap support
                    >
                        <Info
                            size={14}
                            className={clsx(
                                "text-gray-600 transition-colors cursor-help",
                                showTooltip ? "text-blue-400" : "group-hover:text-gray-400"
                            )}
                        />

                        {/* Tooltip Popup */}
                        <div className={clsx(
                            "absolute left-0 top-6 w-64 bg-black/90 border border-gray-700 text-xs text-gray-300 p-2 rounded shadow-xl z-50 pointer-events-none transition-opacity duration-200",
                            showTooltip ? "opacity-100" : "opacity-0 invisible"
                        )}>
                            {tooltip}
                        </div>
                    </div>
                )}
                <h4 className="text-sm font-medium text-gray-200 truncate select-none">{title}</h4>
            </div>

            <div className={clsx("flex items-center gap-2", layout === 'col' ? "w-full" : "")}>
                {children}
            </div>
        </div>
    );
};
