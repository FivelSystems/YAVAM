import { ReactNode, useState } from 'react';
import clsx from 'clsx';
import { Info } from 'lucide-react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface SettingGroupProps extends Omit<HTMLMotionProps<"div">, "title"> {
    title?: ReactNode;
    tooltip?: string;
    children: ReactNode;
    className?: string; // Additional classes for the container
    variant?: 'default' | 'danger' | 'info';
    action?: ReactNode; // Optional header action (button/toggle)
}

export const SettingGroup = ({
    title,
    tooltip,
    children,
    className,
    variant = 'default',
    action,
    ...props
}: SettingGroupProps) => {
    const [showTooltip, setShowTooltip] = useState(false);

    const baseStyle = "rounded-xl p-2 border space-y-1 transition-all";
    const variants = {
        default: "bg-gray-700/20 border-gray-700/50",
        danger: "bg-red-900/10 border-red-900/30",
        info: "bg-blue-900/10 border-blue-900/30",
    };

    return (
        <motion.div
            className={clsx(baseStyle, variants[variant], className)}
            {...props}
        >
            {(title || tooltip || action) && (
                <div className="flex items-center justify-between gap-4 mb-1 px-1">
                    <div className="flex-1 flex items-center gap-2">
                        {tooltip && (
                            <div
                                className="relative flex items-center"
                                onMouseEnter={() => setShowTooltip(true)}
                                onMouseLeave={() => setShowTooltip(false)}
                                onClick={() => setShowTooltip(!showTooltip)}
                            >
                                <Info
                                    size={12}
                                    className={clsx(
                                        "transition-colors cursor-help",
                                        variant === 'danger' ? "text-red-400/50 hover:text-red-400" : "text-gray-600 hover:text-gray-400",
                                        showTooltip ? (variant === 'danger' ? "text-red-400" : "text-blue-400") : ""
                                    )}
                                />
                                <div className={clsx(
                                    "absolute left-0 top-6 w-64 bg-black/90 border border-gray-700 text-xs text-gray-300 p-2 rounded shadow-xl z-50 pointer-events-none transition-opacity duration-200",
                                    showTooltip ? "opacity-100" : "opacity-0 invisible"
                                )}>
                                    {tooltip}
                                </div>
                            </div>
                        )}

                        {title && <h4 className={clsx(
                            "text-xs font-bold uppercase tracking-wider",
                            variant === 'danger' ? "text-red-300" : "text-gray-500"
                        )}>{title}</h4>}
                    </div>
                    {action && <div>{action}</div>}
                </div>
            )}

            {/* Divider if header exists and children exist */}
            {(title || tooltip || action) && children && (
                <div className={clsx(
                    "border-t pt-2 mt-2",
                    variant === 'danger' ? "border-red-900/30" : "border-gray-700/50"
                )}>
                    {children}
                </div>
            )}

            {/* If no header, just render children directly (or if header exists, they are in the divided section) */}
            {!(title || tooltip || action) && children}
        </motion.div>
    );
};
