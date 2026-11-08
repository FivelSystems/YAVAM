import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Pagination } from './Pagination';
import { clampPage } from '../../utils/pagination';

const renderPagination = (overrides: Partial<React.ComponentProps<typeof Pagination>> = {}) => {
    const onChange = vi.fn();
    render(<Pagination currentPage={2} totalItems={1234} itemsPerPage={50} onChange={onChange} {...overrides} />);
    return onChange;
};

describe('Pagination', () => {
    it('renders nothing for a single page', () => {
        const { container } = render(<Pagination currentPage={1} totalItems={10} itemsPerPage={50} onChange={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('exposes a named navigation landmark', () => {
        renderPagination();
        expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    });

    it('gives every icon button an accessible name and keeps the title', () => {
        renderPagination();
        for (const name of ['First page', 'Previous page', 'Next page', 'Last page']) {
            expect(screen.getByRole('button', { name })).toHaveAttribute('title', name);
        }
    });

    it('marks only the active page with aria-current', () => {
        renderPagination();
        const nav = screen.getByRole('navigation', { name: 'Pagination' });
        const current = nav.querySelectorAll('[aria-current="page"]');
        expect(current).toHaveLength(1);
        expect(current[0]).toHaveTextContent('2');
    });

    it('shows Page N of M and the locale-formatted item range', () => {
        renderPagination({ currentPage: 2 });
        const status = screen.getByText(/1,234 *$/, { selector: 'p' });
        expect(status).toHaveTextContent('Page 2 of 25');
        expect(status).toHaveTextContent('51-100 of 1,234');
    });

    it('clamps the item range on the last page', () => {
        renderPagination({ currentPage: 25 });
        expect(screen.getByText(/1,201-1,234 of 1,234/)).toBeInTheDocument();
    });

    it('navigates with previous, next, first and last', () => {
        const onChange = renderPagination({ currentPage: 5 });
        fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        fireEvent.click(screen.getByRole('button', { name: 'First page' }));
        fireEvent.click(screen.getByRole('button', { name: 'Last page' }));
        expect(onChange.mock.calls.map(([page]) => page)).toEqual([4, 6, 1, 25]);
    });

    it('disables backward controls on the first page and forward controls on the last', () => {
        renderPagination({ currentPage: 1 });
        expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
    });

    it('does not move focus when the page changes', () => {
        const { rerender } = render(<Pagination currentPage={2} totalItems={1234} itemsPerPage={50} onChange={vi.fn()} />);
        const next = screen.getByRole('button', { name: 'Next page' });
        next.focus();
        rerender(<Pagination currentPage={3} totalItems={1234} itemsPerPage={50} onChange={vi.fn()} />);
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next page' }));
    });
});

describe('Pagination jump (desktop popover)', () => {
    const openPopover = () => {
        fireEvent.click(screen.getAllByRole('button', { name: 'Jump to page' })[0]);
        return screen.getByRole('dialog', { name: 'Go to page' });
    };

    it('turns each gap into a button that opens a popover with a numeric input', () => {
        renderPagination({ currentPage: 10 });
        expect(screen.getAllByRole('button', { name: 'Jump to page' })).toHaveLength(2);
        const popover = openPopover();
        expect(within(popover).getByRole('spinbutton', { name: 'Page number' })).toHaveValue(10);
    });

    it('clamps an out-of-range value and confirms with Enter', () => {
        const onChange = renderPagination({ currentPage: 10 });
        const input = within(openPopover()).getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '999' } });
        fireEvent.submit(input.closest('form')!);
        expect(onChange).toHaveBeenCalledWith(25);
        expect(screen.queryByRole('dialog', { name: 'Go to page' })).toBeNull();
    });

    it('clamps below the first page', () => {
        const onChange = renderPagination({ currentPage: 10 });
        const input = within(openPopover()).getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '-4' } });
        fireEvent.submit(input.closest('form')!);
        expect(onChange).toHaveBeenCalledWith(1);
    });

    it('ignores an empty value', () => {
        const onChange = renderPagination({ currentPage: 10 });
        const input = within(openPopover()).getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '' } });
        fireEvent.submit(input.closest('form')!);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('cancels with Escape without changing the page', () => {
        const onChange = renderPagination({ currentPage: 10 });
        openPopover();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: 'Go to page' })).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('Pagination jump (mobile sheet)', () => {
    const openSheet = () => {
        fireEvent.click(screen.getByRole('button', { name: 'Page 7 of 25. Jump to page' }));
        return screen.getByRole('dialog', { name: 'Go to page' });
    };

    it('opens a sheet with a numeric input and a slider from the page indicator', () => {
        renderPagination({ currentPage: 7 });
        const sheet = openSheet();
        expect(within(sheet).getByRole('spinbutton', { name: 'Page number' })).toHaveValue(7);
        expect(within(sheet).getByRole('slider', { name: 'Scrub through pages' })).toHaveValue('7');
    });

    it('keeps the slider and the input in sync', () => {
        renderPagination({ currentPage: 7 });
        const sheet = openSheet();
        fireEvent.change(within(sheet).getByRole('slider'), { target: { value: '20' } });
        expect(within(sheet).getByRole('spinbutton')).toHaveValue(20);
    });

    it('clamps and confirms through the Go button', () => {
        const onChange = renderPagination({ currentPage: 7 });
        const sheet = openSheet();
        fireEvent.change(within(sheet).getByRole('spinbutton'), { target: { value: '500' } });
        fireEvent.click(within(sheet).getByRole('button', { name: 'Go' }));
        expect(onChange).toHaveBeenCalledWith(25);
    });

    it('cancels with Escape without changing the page', () => {
        const onChange = renderPagination({ currentPage: 7 });
        openSheet();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onChange).not.toHaveBeenCalled();
    });
});

const pageNumbers = () =>
    screen.getAllByRole('button', { name: /^Go to page \d+$/ }).map(button => Number(button.textContent));
const gapButtons = () => screen.queryAllByRole('button', { name: 'Jump to page' });

describe('Pagination edge states', () => {
    it('renders nothing and no controls for an empty result', () => {
        const { container } = render(<Pagination currentPage={1} totalItems={0} itemsPerPage={50} onChange={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
        expect(screen.queryByRole('navigation')).toBeNull();
    });

    it('renders nothing when the items exactly fill one page', () => {
        const { container } = render(<Pagination currentPage={1} totalItems={50} itemsPerPage={50} onChange={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows a second page as soon as one item overflows', () => {
        renderPagination({ currentPage: 1, totalItems: 51 });
        expect(pageNumbers()).toEqual([1, 2]);
    });

    it('disables forward controls and enables backward ones on the last page', () => {
        renderPagination({ currentPage: 25 });
        expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Last page' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'First page' })).toBeEnabled();
    });

    it('does not call onChange when a disabled control is clicked', () => {
        const onChange = renderPagination({ currentPage: 1 });
        fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
        fireEvent.click(screen.getByRole('button', { name: 'First page' }));
        expect(onChange).not.toHaveBeenCalled();
    });

    it('clicking a numbered button reports that page', () => {
        const onChange = renderPagination({ currentPage: 2, totalItems: 200 });
        fireEvent.click(screen.getByRole('button', { name: 'Go to page 4' }));
        expect(onChange).toHaveBeenCalledWith(4);
    });
});

describe('Pagination page numbers and ellipsis', () => {
    it('shows every number and no ellipsis for a small page count', () => {
        renderPagination({ currentPage: 3, totalItems: 250 });
        expect(pageNumbers()).toEqual([1, 2, 3, 4, 5]);
        expect(gapButtons()).toHaveLength(0);
    });

    it('shows every number and no ellipsis at exactly the visible limit', () => {
        renderPagination({ currentPage: 5, totalItems: 450 });
        expect(pageNumbers()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(gapButtons()).toHaveLength(0);
    });

    it('does not insert an ellipsis for a single hidden page', () => {
        renderPagination({ currentPage: 1, totalItems: 500 });
        expect(pageNumbers()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(gapButtons()).toHaveLength(0);
    });

    it('keeps the last page and one trailing ellipsis on the first page of many', () => {
        renderPagination({ currentPage: 1, totalItems: 1000 });
        expect(pageNumbers()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 20]);
        expect(gapButtons()).toHaveLength(1);
    });

    it('keeps the first page and one leading ellipsis on the last page of many', () => {
        renderPagination({ currentPage: 20, totalItems: 1000 });
        expect(pageNumbers()).toEqual([1, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
        expect(gapButtons()).toHaveLength(1);
    });

    it('shows first, last, the current neighbours and two ellipses in the middle', () => {
        renderPagination({ currentPage: 10, totalItems: 1000 });
        expect(pageNumbers()).toEqual([1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20]);
        expect(gapButtons()).toHaveLength(2);
        expect(screen.getByRole('button', { name: 'Go to page 10' })).toHaveAttribute('aria-current', 'page');
    });
});

describe('Pagination out-of-range page', () => {
    it('clampPage brings a page past the end back to the last valid page', () => {
        expect(clampPage(9, 120, 50)).toBe(3);
        expect(clampPage(26, 1234, 50)).toBe(25);
    });

    it('clampPage brings a page below the first back to the first', () => {
        expect(clampPage(0, 1234, 50)).toBe(1);
        expect(clampPage(-3, 1234, 50)).toBe(1);
    });

    it('clampPage returns page 1 for an empty result', () => {
        expect(clampPage(7, 0, 50)).toBe(1);
    });

    it('clampPage leaves a valid page untouched', () => {
        expect(clampPage(2, 120, 50)).toBe(2);
    });

    it('follows the page the parent passes after the list shrinks and the page is clamped', () => {
        const onChange = vi.fn();
        const { rerender } = render(<Pagination currentPage={25} totalItems={1234} itemsPerPage={50} onChange={onChange} />);
        const shrunkTotal = 120;
        const clamped = clampPage(25, shrunkTotal, 50);
        rerender(<Pagination currentPage={clamped} totalItems={shrunkTotal} itemsPerPage={50} onChange={onChange} />);
        expect(screen.getByRole('button', { name: 'Go to page 3' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
        expect(screen.getByText(/101-120 of 120/)).toBeInTheDocument();
    });

    it('collapses to nothing when the list shrinks to a single page', () => {
        const { container, rerender } = render(<Pagination currentPage={5} totalItems={1234} itemsPerPage={50} onChange={vi.fn()} />);
        rerender(<Pagination currentPage={1} totalItems={20} itemsPerPage={50} onChange={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('the component itself does not clamp: a stale page past the end enables Previous and disables Next', () => {
        renderPagination({ currentPage: 30, totalItems: 120 });
        expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
    });
});
