import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { AnchoredMenu, MenuItem, MenuDivider } from './AnchoredMenu';

const mockRect = (width: number, height: number) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => {},
    } as DOMRect);
};

describe('AnchoredMenu', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('portals its content to document.body', () => {
        mockRect(100, 50);
        const { container } = render(
            <AnchoredMenu anchor={{ x: 10, y: 10 }} onClose={vi.fn()}>
                <div data-testid="content">hi</div>
            </AnchoredMenu>,
        );
        expect(container.querySelector('[data-testid="content"]')).toBeNull();
        expect(document.body.querySelector('[data-testid="content"]')).toBeTruthy();
    });

    it('renders role="menu" and MenuItem as role="menuitem"', () => {
        mockRect(100, 50);
        render(
            <AnchoredMenu anchor={{ x: 10, y: 10 }} onClose={vi.fn()}>
                <MenuItem onSelect={vi.fn()}>Do thing</MenuItem>
            </AnchoredMenu>,
        );
        expect(screen.getByRole('menu')).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'Do thing' })).toBeInTheDocument();
    });

    it('closes the menu and then runs the action when a MenuItem is selected', () => {
        mockRect(100, 50);
        const onClose = vi.fn();
        const onSelect = vi.fn();
        const order: string[] = [];
        onClose.mockImplementation(() => order.push('close'));
        onSelect.mockImplementation(() => order.push('select'));

        render(
            <AnchoredMenu anchor={{ x: 10, y: 10 }} onClose={onClose}>
                <MenuItem onSelect={onSelect}>Do thing</MenuItem>
            </AnchoredMenu>,
        );
        fireEvent.click(screen.getByRole('menuitem', { name: 'Do thing' }));

        expect(order).toEqual(['close', 'select']);
    });

    it('renders a MenuDivider as a separator', () => {
        mockRect(100, 50);
        render(
            <AnchoredMenu anchor={{ x: 10, y: 10 }} onClose={vi.fn()}>
                <MenuItem onSelect={vi.fn()}>A</MenuItem>
                <MenuDivider />
                <MenuItem onSelect={vi.fn()}>B</MenuItem>
            </AnchoredMenu>,
        );
        expect(screen.getByRole('separator')).toBeInTheDocument();
    });

    it('closes on an outside mousedown but not an inside one', () => {
        mockRect(100, 50);
        const onClose = vi.fn();
        render(
            <AnchoredMenu anchor={{ x: 10, y: 10 }} onClose={onClose}>
                <MenuItem onSelect={vi.fn()}>A</MenuItem>
            </AnchoredMenu>,
        );
        fireEvent.mouseDown(screen.getByRole('menu'));
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.mouseDown(document.body);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on an outside touchstart', () => {
        mockRect(100, 50);
        const onClose = vi.fn();
        render(
            <AnchoredMenu anchor={{ x: 10, y: 10 }} onClose={onClose}>
                <MenuItem onSelect={vi.fn()}>A</MenuItem>
            </AnchoredMenu>,
        );
        fireEvent.touchStart(document.body);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape', () => {
        mockRect(100, 50);
        const onClose = vi.fn();
        render(
            <AnchoredMenu anchor={{ x: 10, y: 10 }} onClose={onClose}>
                <MenuItem onSelect={vi.fn()}>A</MenuItem>
            </AnchoredMenu>,
        );
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on a scroll inside the menu', () => {
        mockRect(100, 50);
        const onClose = vi.fn();
        render(
            <AnchoredMenu anchor={{ x: 10, y: 10 }} onClose={onClose}>
                <MenuItem onSelect={vi.fn()}>A</MenuItem>
            </AnchoredMenu>,
        );
        fireEvent.scroll(screen.getByRole('menu'));
        expect(onClose).not.toHaveBeenCalled();
    });

    it('flips to the left and above when it would overflow the right/bottom edge', () => {
        // @ts-ignore
        window.innerWidth = 500;
        // @ts-ignore
        window.innerHeight = 500;
        mockRect(200, 150);

        render(
            <AnchoredMenu anchor={{ x: 450, y: 450 }} onClose={vi.fn()}>
                <MenuItem onSelect={vi.fn()}>A</MenuItem>
            </AnchoredMenu>,
        );

        const menu = screen.getByRole('menu') as HTMLElement;
        // Anchor at (450, 450) + a 200x150 menu would overflow both edges at
        // 500x500, so it opens to the left (450 - 200 = 250) and above (450 -
        // 150 = 300) instead of being clamped flush against the edge.
        expect(menu.style.left).toBe('250px');
        expect(menu.style.top).toBe('300px');
    });

    it('clamps to the viewport when even the flipped position would overflow', () => {
        // @ts-ignore
        window.innerWidth = 300;
        // @ts-ignore
        window.innerHeight = 300;
        mockRect(280, 280);

        render(
            <AnchoredMenu anchor={{ x: 290, y: 290 }} onClose={vi.fn()}>
                <MenuItem onSelect={vi.fn()}>A</MenuItem>
            </AnchoredMenu>,
        );

        const menu = screen.getByRole('menu') as HTMLElement;
        expect(menu.style.left).toBe('10px');
        expect(menu.style.top).toBe('10px');
    });
});
