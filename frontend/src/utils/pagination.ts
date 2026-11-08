export const FIRST_PAGE = 1;

/** Returns the last valid page for the given item count; an empty set still has page 1. */
export const lastPage = (totalItems: number, itemsPerPage: number): number =>
    Math.max(FIRST_PAGE, Math.ceil(totalItems / Math.max(1, itemsPerPage)));

export const clampPage = (page: number, totalItems: number, itemsPerPage: number): number =>
    Math.min(Math.max(FIRST_PAGE, page), lastPage(totalItems, itemsPerPage));
