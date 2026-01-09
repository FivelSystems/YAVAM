import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, Trash2 } from "lucide-react";

interface LibraryItemProps {
    lib: string;
    onRemove: (path: string) => void;
}

export const LibraryItem = ({ lib, onRemove }: LibraryItemProps) => {
    const controls = useDragControls();

    return (
        <Reorder.Item
            value={lib}
            dragListener={false}
            dragControls={controls}
            className="relative"
        >
            <div className="flex items-center gap-3 bg-gray-900 border border-gray-700 rounded-lg p-2 group select-none">
                <div
                    onPointerDown={(e) => controls.start(e)}
                    className="cursor-grab text-gray-400 bg-gray-800 p-1 rounded hover:text-white hover:bg-gray-700 active:cursor-grabbing touch-none transition-colors"
                >
                    <GripVertical size={16} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-gray-300 truncate" title={lib}>{lib}</div>
                </div>
                <button
                    onClick={() => onRemove(lib)}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
                    title="Remove Library"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </Reorder.Item>
    );
};
