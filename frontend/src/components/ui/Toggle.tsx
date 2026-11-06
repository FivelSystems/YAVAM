import clsx from 'clsx';

interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string; // Optional side label
    description?: string; // Optional description
    /** Optional leading icon, rendered before the label (e.g. a Heart for favourites). */
    icon?: React.ReactNode;
    disabled?: boolean;
    variant?: 'primary' | 'danger'; // Blue vs Red
    size?: 'sm' | 'md';
}

export const Toggle = ({
    checked,
    onChange,
    label,
    description,
    icon,
    disabled = false,
    variant = 'primary',
    size = 'md'
}: ToggleProps) => {

    const baseColor = variant === 'danger' ? 'bg-red-500' : 'bg-blue-600';

    // Size Mappings
    const dims = size === 'sm' ? "h-5 w-9" : "h-6 w-11";
    const dot = size === 'sm' ? "h-3.5 w-3.5" : "h-4 w-4";
    const translate = size === 'sm'
        ? (checked ? "translate-x-4" : "translate-x-0.5")
        : (checked ? "translate-x-6" : "translate-x-1");

    return (
        <div className={clsx("flex items-center justify-between gap-4", disabled && "opacity-50 pointer-events-none")}>
            {(icon || label || description) && (
                <div className="flex-1 flex items-center gap-2 min-w-0">
                    {icon && <span className="shrink-0 flex items-center">{icon}</span>}
                    <div className="min-w-0">
                        {label && <h4 className={clsx("text-sm font-medium truncate", checked ? "text-white" : "text-gray-300")}>{label}</h4>}
                        {description && <p className="text-xs text-gray-500">{description}</p>}
                    </div>
                </div>
            )}

            <button
                type="button"
                onClick={() => !disabled && onChange(!checked)}
                className={clsx(
                    "relative inline-flex items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900",
                    dims,
                    (checked ? baseColor : "bg-gray-700"),
                    variant === 'danger' ? "focus:ring-red-500" : "focus:ring-blue-500"
                )}
            >
                <span className={clsx(
                    "inline-block transform rounded-full bg-white transition-transform duration-200",
                    dot,
                    translate
                )} />
            </button>
        </div>
    );
};
