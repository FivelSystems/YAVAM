import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import clsx from 'clsx';

interface PaginationProps {
    currentPage: number;
    totalItems: number;
    itemsPerPage: number;
    onChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ currentPage, totalItems, itemsPerPage, onChange }) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    // Safety check
    if (totalPages <= 1) return null;

    const maxVisible = 9; // Increased from 5 for better Desktop navigation
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    // Helper to render page button
    const renderPageButton = (page: number) => (
        <button
            key={page}
            onClick={() => onChange(page)}
            className={clsx(
                "w-8 h-8 rounded-lg text-xs font-medium transition-colors flex items-center justify-center",
                currentPage === page
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50"
                    : "bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white"
            )}
        >
            {page}
        </button>
    );

    return (
        <div className="flex justify-between items-center w-full select-none">

            {/* Left Controls */}
            <div className="flex items-center gap-1">
                <button
                    onClick={() => onChange(1)}
                    disabled={currentPage === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 disabled:opacity-30 hover:bg-gray-600 disabled:hover:bg-gray-700 transition-colors text-gray-300"
                    title="First Page"
                >
                    <ChevronsLeft size={16} />
                </button>
                <button
                    onClick={() => onChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 disabled:opacity-30 hover:bg-gray-600 disabled:hover:bg-gray-700 transition-colors text-gray-300"
                    title="Previous Page"
                >
                    <ChevronLeft size={16} />
                </button>
            </div>

            {/* Page Numbers - Push to Center, Hide on Mobile if needed, or allow wrap */}
            {/* "hidden md:flex" makes it disappear on very small screens to avoid overflow */}
            <div className="flex-1 flex justify-center items-center gap-1 px-4 overflow-hidden">
                <div className="hidden sm:flex items-center gap-1">
                    {startPage > 1 && (
                        <>
                            {renderPageButton(1)}
                            {startPage > 2 && <span className="text-gray-600 w-4 text-center">...</span>}
                        </>
                    )}

                    {Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map(i => renderPageButton(i))}

                    {endPage < totalPages && (
                        <>
                            {endPage < totalPages - 1 && <span className="text-gray-600 w-4 text-center">...</span>}
                            {renderPageButton(totalPages)}
                        </>
                    )}
                </div>

                {/* Mobile Info Text (Shown when numbers are hidden) */}
                <div className="sm:hidden text-xs text-gray-400 font-mono">
                    {currentPage} / {totalPages}
                </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-1">
                <button
                    onClick={() => onChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 disabled:opacity-30 hover:bg-gray-600 disabled:hover:bg-gray-700 transition-colors text-gray-300"
                    title="Next Page"
                >
                    <ChevronRight size={16} />
                </button>
                <button
                    onClick={() => onChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 disabled:opacity-30 hover:bg-gray-600 disabled:hover:bg-gray-700 transition-colors text-gray-300"
                    title="Last Page"
                >
                    <ChevronsRight size={16} />
                </button>
            </div>

        </div>
    );
};
