import clsx from 'clsx';

interface SliderProps {
    min: number;
    max: number;
    step?: number;
    value: number;
    onChange: (val: number) => void;
    label?: string; // e.g. "100px" or "50%"
    className?: string;
    disabled?: boolean;
}

export const Slider = ({
    min,
    max,
    step = 1,
    value,
    onChange,
    label,
    className,
    disabled = false
}: SliderProps) => {
    return (
        <div className={clsx("flex items-center gap-4 w-full", className)}>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
                disabled={disabled}
                className={clsx(
                    "flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 transition-all",
                    disabled ? "bg-gray-800 cursor-not-allowed accent-gray-600" : "bg-gray-700"
                )}
            />
            {label && (
                <span className={clsx(
                    "text-xs font-mono text-right w-12",
                    disabled ? "text-gray-600" : "text-gray-400"
                )}>
                    {label}
                </span>
            )}
        </div>
    );
};
