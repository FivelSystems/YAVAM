import { useRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useDismissOnOutsideInteraction } from './useDismissOnOutsideInteraction';

interface HarnessProps {
    onDismiss: () => void;
    enabled?: boolean;
}

const Harness = ({ onDismiss, enabled = true }: HarnessProps) => {
    const panelRef = useRef<HTMLDivElement>(null);
    useDismissOnOutsideInteraction({ insideRefs: [panelRef], onDismiss, enabled });
    return (
        <div ref={panelRef} data-testid="panel">
            <div data-testid="scrollable" style={{ overflowY: 'auto', height: 10 }}>content</div>
        </div>
    );
};

describe('useDismissOnOutsideInteraction', () => {
    it('dismisses on an outside mousedown', () => {
        const onDismiss = vi.fn();
        render(<Harness onDismiss={onDismiss} />);
        fireEvent.mouseDown(document.body);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('dismisses on an outside touchstart', () => {
        const onDismiss = vi.fn();
        render(<Harness onDismiss={onDismiss} />);
        fireEvent.touchStart(document.body);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('does not dismiss on a mousedown inside the panel', () => {
        const onDismiss = vi.fn();
        const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
        fireEvent.mouseDown(getByTestId('panel'));
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('dismisses on Escape', () => {
        const onDismiss = vi.fn();
        render(<Harness onDismiss={onDismiss} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('dismisses on an outside scroll', () => {
        const onDismiss = vi.fn();
        render(<Harness onDismiss={onDismiss} />);
        fireEvent.scroll(document.body);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('does not dismiss on a scroll inside the panel', () => {
        const onDismiss = vi.fn();
        const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
        fireEvent.scroll(getByTestId('scrollable'));
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('dismisses on a real width change but not a height-only change', () => {
        const onDismiss = vi.fn();
        render(<Harness onDismiss={onDismiss} />);

        // @ts-ignore
        window.innerHeight = window.innerHeight - 300;
        fireEvent(window, new Event('resize'));
        expect(onDismiss).not.toHaveBeenCalled();

        // @ts-ignore
        window.innerWidth = window.innerWidth + 200;
        fireEvent(window, new Event('resize'));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('does not attach listeners while disabled', () => {
        const onDismiss = vi.fn();
        render(<Harness onDismiss={onDismiss} enabled={false} />);
        fireEvent.mouseDown(document.body);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onDismiss).not.toHaveBeenCalled();
    });
});
