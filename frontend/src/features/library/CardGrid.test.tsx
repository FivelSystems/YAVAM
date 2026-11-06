import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CardGrid from './CardGrid';

const noop = () => {};

describe('CardGrid empty state (#57 — inline clear-filters escape hatch)', () => {
    it('shows a "Clear all filters" button when a filter narrowed the list to zero', () => {
        const onClearFilters = vi.fn();
        render(
            <CardGrid
                packages={[]}
                totalCount={430}
                onContextMenu={noop}
                onSelect={noop}
                viewMode="grid"
                isFiltered
                onClearFilters={onClearFilters}
            />
        );

        const button = screen.getByRole('button', { name: /clear all filters/i });
        fireEvent.click(button);
        expect(onClearFilters).toHaveBeenCalledTimes(1);
    });

    it('does not show the clear-filters button when no filter is active (library is genuinely empty)', () => {
        render(
            <CardGrid
                packages={[]}
                totalCount={0}
                onContextMenu={noop}
                onSelect={noop}
                viewMode="grid"
                isFiltered={false}
            />
        );
        expect(screen.queryByRole('button', { name: /clear all filters/i })).not.toBeInTheDocument();
    });

    it('does not show the clear-filters button when not filtered, even if results are briefly empty', () => {
        render(
            <CardGrid
                packages={[]}
                totalCount={430}
                onContextMenu={noop}
                onSelect={noop}
                viewMode="grid"
                isFiltered={false}
            />
        );
        expect(screen.queryByRole('button', { name: /clear all filters/i })).not.toBeInTheDocument();
    });
});
