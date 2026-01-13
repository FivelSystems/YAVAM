import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

interface TagSearchProps {
    availableTags: string[];
    selectedTags: string[];
    onSelectTag: (tag: string) => void;
}

const TagSearch = ({ availableTags, selectedTags, onSelectTag }: TagSearchProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filteredTags, setFilteredTags] = useState<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const q = searchTerm.toLowerCase();
        setFilteredTags(
            availableTags
                .filter(t => t.toLowerCase().includes(q))
                .filter(t => !selectedTags.includes(t)) // Don't show already selected
        );
    }, [searchTerm, availableTags, selectedTags]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (tag: string) => {
        onSelectTag(tag);
        setSearchTerm("");
        setIsOpen(false); // Optional: keep open for multi-select? User wants fast. Close is cleaner.
    };

    return (
        <div className="relative" ref={containerRef}>
            {/* Search Input Trigger */}
            <div
                className="relative flex items-center bg-gray-700 rounded-lg w-64 border border-transparent focus-within:border-blue-500 transition-colors"
            >
                <Search size={16} className="text-gray-400 ml-3" />
                <input
                    type="text"
                    className="bg-transparent text-white text-sm px-3 py-2 w-full outline-none placeholder-gray-400"
                    placeholder="Filter tags..."
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                {searchTerm && (
                    <button
                        onClick={() => { setSearchTerm(""); setIsOpen(false); }}
                        className="p-1 hover:text-white text-gray-400 mr-1"
                    >
                        <X size={14} />
                    </button>
                )}
                {!searchTerm && (
                    <ChevronDown size={14} className="text-gray-400 mr-3 pointer-events-none" />
                )}
            </div>

            {/* Dropdown with filtered results */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar z-50">
                    {filteredTags.length === 0 ? (
                        <div className="p-3 text-xs text-center text-gray-500">
                            No matching tags found
                        </div>
                    ) : (
                        <div className="py-1">
                            {filteredTags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => handleSelect(tag)}
                                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center justify-between group"
                                >
                                    <span>{tag}</span>
                                    {/* Optional check icon if we change logic to show selected items in list */}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TagSearch;
