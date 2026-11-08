import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../ui/Button';
import { AnchoredMenu } from '../ui/AnchoredMenu';
import { BottomSheet } from '../ui/BottomSheet';
import { PageJumpForm } from './PageJumpForm';
import { PAGINATION_STRINGS as strings } from '../../config/uiStrings';
import { FIRST_PAGE, clampPage, lastPage } from '../../utils/pagination';

const MAX_VISIBLE_PAGE_BUTTONS = 9;
const CONTROL_ICON_SIZE = 16;
const POPOVER_WIDTH_CLASS = 'w-64';

interface PaginationProps {
    currentPage: number;
    totalItems: number;
    itemsPerPage: number;
    onChange: (page: number) => void;
}

type PageSlot = { kind: 'page'; page: number } | { kind: 'gap'; key: string };

const buildPageSlots = (currentPage: number, totalPages: number): PageSlot[] => {
    let startPage = Math.max(FIRST_PAGE, currentPage - Math.floor(MAX_VISIBLE_PAGE_BUTTONS / 2));
    const endPage = Math.min(totalPages, startPage + MAX_VISIBLE_PAGE_BUTTONS - 1);
    startPage = Math.max(FIRST_PAGE, endPage - MAX_VISIBLE_PAGE_BUTTONS + 1);

    const slots: PageSlot[] = [];
    if (startPage > FIRST_PAGE) {
        slots.push({ kind: 'page', page: FIRST_PAGE });
        if (startPage > FIRST_PAGE + 1) slots.push({ kind: 'gap', key: 'gap-start' });
    }
    for (let page = startPage; page <= endPage; page++) slots.push({ kind: 'page', page });
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) slots.push({ kind: 'gap', key: 'gap-end' });
        slots.push({ kind: 'page', page: totalPages });
    }
    return slots;
};

/**
 * Page controls plus the "where am I" text. Below `md` it is previous / next
 * around a tappable `Page N of M` that opens the jump sheet; from `md` up it
 * shows numbered buttons whose gaps open the jump popover.
 */
export const Pagination: React.FC<PaginationProps> = ({ currentPage, totalItems, itemsPerPage, onChange }) => {
    const totalPages = lastPage(totalItems, itemsPerPage);
    const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    if (totalPages <= 1) return null;

    const numberFormat = new Intl.NumberFormat();
    const formattedPage = numberFormat.format(currentPage);
    const formattedTotalPages = numberFormat.format(totalPages);
    const firstItem = (currentPage - 1) * itemsPerPage + 1;
    const lastItem = Math.min(currentPage * itemsPerPage, totalItems);

    const jumpTo = (page: number) => {
        setPopoverAnchor(null);
        setIsSheetOpen(false);
        onChange(clampPage(page, totalItems, itemsPerPage));
    };

    const openPopover = (event: React.MouseEvent<HTMLButtonElement>) => {
        const { left, top } = event.currentTarget.getBoundingClientRect();
        setPopoverAnchor({ x: left, y: top });
    };

    const isFirst = currentPage <= FIRST_PAGE;
    const isLast = currentPage >= totalPages;

    const renderPageButton = (page: number) => {
        const isActive = page === currentPage;
        return (
            <Button
                key={page}
                size="icon"
                variant={isActive ? 'primary' : 'secondary'}
                onClick={() => onChange(page)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={strings.goToPageNumber(page)}
                className={clsx(isActive && 'font-bold ring-2 ring-white/80 ring-offset-1 ring-offset-gray-900 underline underline-offset-4')}
            >
                {page}
            </Button>
        );
    };

    return (
        <div className="flex items-center justify-between gap-4 w-full select-none">
            <p className="hidden md:block text-xs text-gray-400 whitespace-nowrap" aria-live="polite">
                <span className="font-medium text-gray-200">{strings.pageOf(formattedPage, formattedTotalPages)}</span>
                <span className="mx-2 text-gray-600" aria-hidden="true">|</span>
                {strings.itemRange(numberFormat.format(firstItem), numberFormat.format(lastItem), numberFormat.format(totalItems))}
            </p>

            <nav aria-label={strings.navigationLabel} className="flex items-center justify-between gap-2 md:gap-1 w-full md:w-auto">
                <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => onChange(FIRST_PAGE)}
                    disabled={isFirst}
                    title={strings.firstPage}
                    aria-label={strings.firstPage}
                    className="hidden md:inline-flex"
                >
                    <ChevronsLeft size={CONTROL_ICON_SIZE} />
                </Button>
                <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => onChange(currentPage - 1)}
                    disabled={isFirst}
                    title={strings.previousPage}
                    aria-label={strings.previousPage}
                >
                    <ChevronLeft size={CONTROL_ICON_SIZE} />
                </Button>

                <Button
                    variant="ghost"
                    onClick={() => setIsSheetOpen(true)}
                    aria-label={strings.openJumpToPage(formattedPage, formattedTotalPages)}
                    aria-haspopup="dialog"
                    className="md:hidden h-11 flex-1 min-w-0 text-sm text-gray-200 tabular-nums"
                >
                    <span className="max-[359px]:hidden" aria-hidden="true">{strings.pageOf(formattedPage, formattedTotalPages)}</span>
                    <span className="min-[360px]:hidden" aria-hidden="true">{strings.compactPageOf(formattedPage, formattedTotalPages)}</span>
                </Button>

                <div className="hidden md:flex items-center gap-1">
                    {buildPageSlots(currentPage, totalPages).map(slot => slot.kind === 'page'
                        ? renderPageButton(slot.page)
                        : (
                            <Button
                                key={slot.key}
                                size="icon"
                                variant="ghost"
                                onClick={openPopover}
                                title={strings.jumpToPage}
                                aria-label={strings.jumpToPage}
                                aria-haspopup="dialog"
                            >
                                ...
                            </Button>
                        ))}
                </div>

                <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => onChange(currentPage + 1)}
                    disabled={isLast}
                    title={strings.nextPage}
                    aria-label={strings.nextPage}
                >
                    <ChevronRight size={CONTROL_ICON_SIZE} />
                </Button>
                <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => onChange(totalPages)}
                    disabled={isLast}
                    title={strings.lastPage}
                    aria-label={strings.lastPage}
                    className="hidden md:inline-flex"
                >
                    <ChevronsRight size={CONTROL_ICON_SIZE} />
                </Button>
            </nav>

            {popoverAnchor && (
                <AnchoredMenu
                    anchor={popoverAnchor}
                    onClose={() => setPopoverAnchor(null)}
                    role="dialog"
                    ariaLabel={strings.jumpTitle}
                    className={POPOVER_WIDTH_CLASS}
                >
                    <PageJumpForm currentPage={currentPage} totalPages={totalPages} onJump={jumpTo} />
                </AnchoredMenu>
            )}

            <BottomSheet isOpen={isSheetOpen} title={strings.jumpTitle} onClose={() => setIsSheetOpen(false)}>
                <PageJumpForm currentPage={currentPage} totalPages={totalPages} onJump={jumpTo} withSlider />
            </BottomSheet>
        </div>
    );
};
