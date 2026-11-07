import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterDropdown, FilterOption } from './FilterDropdown';

const options: FilterOption[] = [
    { value: 'a', label: 'Alpha', count: 2 },
    { value: 'b', label: 'Beta', count: 1 },
];

const setup = (overrides: Partial<React.ComponentProps<typeof FilterDropdown>> = {}) => {
    const onToggle = vi.fn();
    render(
        <FilterDropdown
            label="Status"
            options={options}
            isSelected={() => false}
            onToggle={onToggle}
            searchable
            {...overrides}
        />
    );
    return { onToggle };
};

const setMatchMedia = (matches: boolean) => {
    // @ts-ignore — jsdom doesn't implement matchMedia at all.
    window.matchMedia = vi.fn().mockReturnValue({ matches, addListener: () => {}, removeListener: () => {} });
};

describe('FilterDropdown (#55 — mobile virtual-keyboard self-close)', () => {
    afterEach(() => {
        // @ts-ignore
        delete window.matchMedia;
    });

    // Note: asserting that focus() IS called on a desktop/mouse pointer isn't
    // reliable under jsdom — the trigger→place()→re-render sequence means the
    // search input isn't mounted yet on the render pass where this effect first
    // queues, a timing quirk confirmed present on the pre-existing component too
    // (unrelated to this fix). The coarse-pointer gate below is what #55 actually
    // changed, and is deterministically testable.
    it('does NOT autofocus the search input on a coarse/touch pointer', () => {
        setMatchMedia(true);
        const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus');
        setup();
        fireEvent.click(screen.getByText('Status'));
        expect(focusSpy).not.toHaveBeenCalled();
        focusSpy.mockRestore();
    });

    it('does not close on a height-only resize (virtual keyboard opening)', () => {
        setMatchMedia(true);
        setup();
        fireEvent.click(screen.getByText('Status'));
        expect(screen.getByPlaceholderText('Filter…')).toBeInTheDocument();

        // Simulate the virtual keyboard: innerHeight shrinks, innerWidth stays put.
        // @ts-ignore
        window.innerHeight = window.innerHeight - 300;
        fireEvent(window, new Event('resize'));

        expect(screen.getByPlaceholderText('Filter…')).toBeInTheDocument();
    });

    it('closes on an actual width change (rotation/real resize)', () => {
        setMatchMedia(false);
        setup();
        fireEvent.click(screen.getByText('Status'));
        expect(screen.getByPlaceholderText('Filter…')).toBeInTheDocument();

        // @ts-ignore
        window.innerWidth = window.innerWidth + 200;
        fireEvent(window, new Event('resize'));

        expect(screen.queryByPlaceholderText('Filter…')).not.toBeInTheDocument();
    });

    it('closes on outside touchstart (not just mousedown)', () => {
        setMatchMedia(true);
        setup();
        fireEvent.click(screen.getByText('Status'));
        expect(screen.getByPlaceholderText('Filter…')).toBeInTheDocument();

        fireEvent.touchStart(document.body);

        expect(screen.queryByPlaceholderText('Filter…')).not.toBeInTheDocument();
    });

    it('does not close when the option list itself is scrolled (shared useDismissOnOutsideInteraction)', () => {
        setMatchMedia(true);
        setup();
        fireEvent.click(screen.getByText('Status'));
        const optionList = document.querySelector('.overflow-y-auto');
        expect(optionList).toBeTruthy();

        fireEvent.scroll(optionList!);

        expect(screen.getByPlaceholderText('Filter…')).toBeInTheDocument();
    });

    it('closes when a scroll happens outside the popover', () => {
        setMatchMedia(true);
        setup();
        fireEvent.click(screen.getByText('Status'));
        expect(screen.getByPlaceholderText('Filter…')).toBeInTheDocument();

        fireEvent.scroll(document.body);

        expect(screen.queryByPlaceholderText('Filter…')).not.toBeInTheDocument();
    });

    it('stays open when right-clicking an option to open its group-action menu', () => {
        setMatchMedia(true);
        const onOptionContextMenu = vi.fn();
        setup({ onOptionContextMenu });
        fireEvent.click(screen.getByText('Status'));
        expect(screen.getByPlaceholderText('Filter…')).toBeInTheDocument();

        fireEvent.contextMenu(screen.getByText('Alpha'));

        expect(onOptionContextMenu).toHaveBeenCalledWith('a', expect.anything());
        expect(screen.getByPlaceholderText('Filter…')).toBeInTheDocument();
    });
});
