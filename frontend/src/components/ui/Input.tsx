import clsx from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    description?: string;
    error?: string;
    rightLabel?: string; // e.g. "Sec", "px"
    fullWidth?: boolean;
}

export const Input = ({
    label,
    description,
    error,
    rightLabel,
    fullWidth = false,
    className,
    ...props
}: InputProps) => {
    return (
        <div className={clsx("space-y-1.5", fullWidth ? "w-full" : "")}>
            {(label || description) && (
                <div className="mb-2">
                    {label && <label className="block text-sm font-medium text-white">{label}</label>}
                    {description && <p className="text-xs text-gray-500">{description}</p>}
                </div>
            )}

            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <input
                        {...props}
                        className={clsx(
                            "bg-gray-900 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-gray-600 disabled:opacity-50 disabled:cursor-not-allowed",
                            error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "",
                            fullWidth ? "w-full" : "w-full", // flex-1 handles width
                            className
                        )}
                    />
                </div>
                {rightLabel && (
                    <span className="text-xs text-gray-500 font-mono whitespace-nowrap">{rightLabel}</span>
                )}
            </div>

            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
    );
};
