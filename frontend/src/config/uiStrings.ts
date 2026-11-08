/** User-facing copy shared across components; the repo has no i18n layer yet, so this is the single place to localise from later. */
export const PAGINATION_STRINGS = {
    navigationLabel: 'Pagination',
    firstPage: 'First page',
    previousPage: 'Previous page',
    nextPage: 'Next page',
    lastPage: 'Last page',
    jumpToPage: 'Jump to page',
    jumpTitle: 'Go to page',
    pageInputLabel: 'Page number',
    pageSliderLabel: 'Scrub through pages',
    confirmJump: 'Go',
    goToPageNumber: (page: number) => `Go to page ${page}`,
    pageOf: (page: string, total: string) => `Page ${page} of ${total}`,
    compactPageOf: (page: string, total: string) => `${page} / ${total}`,
    itemRange: (first: string, last: string, total: string) => `${first}-${last} of ${total}`,
    openJumpToPage: (page: string, total: string) => `Page ${page} of ${total}. Jump to page`,
} as const;
