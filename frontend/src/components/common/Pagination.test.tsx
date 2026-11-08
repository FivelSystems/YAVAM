import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Pagination } from './Pagination';

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
