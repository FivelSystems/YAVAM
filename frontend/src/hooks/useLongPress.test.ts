import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLongPress } from './useLongPress';

// Exercises the returned handlers directly as plain functions (rather than via
// DOM pointer-event dispatch) — they only read pointerType/clientX/clientY off
// whatever's passed in, so a minimal fake event is enough and keeps this a
// focused unit test of the gesture logic itself.
const touchEvent = (x: number, y: number) => ({ pointerType: 'touch', clientX: x, clientY: y } as React.PointerEvent);
const mouseEvent = (x: number, y: number) => ({ pointerType: 'mouse', clientX: x, clientY: y } as React.PointerEvent);

describe('useLongPress (touch-only press-and-hold — the mobile right-click equivalent)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('fires onLongPress after the threshold on a touch pointer', () => {
        const onLongPress = vi.fn();
        const { result } = renderHook(() => useLongPress(onLongPress, { thresholdMs: 500 }));

        result.current.onPointerDown(touchEvent(0, 0));
        vi.advanceTimersByTime(499);
        expect(onLongPress).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('ignores non-touch pointers entirely (never fights the native right-click handler)', () => {
        const onLongPress = vi.fn();
        const { result } = renderHook(() => useLongPress(onLongPress, { thresholdMs: 500 }));

        result.current.onPointerDown(mouseEvent(0, 0));
        vi.advanceTimersByTime(1000);
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('cancels the pending press once the pointer moves past the tolerance (scroll/drag guard)', () => {
        const onLongPress = vi.fn();
        const { result } = renderHook(() => useLongPress(onLongPress, { thresholdMs: 500, moveTolerancePx: 10 }));

        result.current.onPointerDown(touchEvent(0, 0));
        result.current.onPointerMove(touchEvent(50, 0));
        vi.advanceTimersByTime(1000);
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('does not cancel for movement within tolerance', () => {
        const onLongPress = vi.fn();
        const { result } = renderHook(() => useLongPress(onLongPress, { thresholdMs: 500, moveTolerancePx: 10 }));

        result.current.onPointerDown(touchEvent(0, 0));
        result.current.onPointerMove(touchEvent(3, 3));
        vi.advanceTimersByTime(500);
        expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('cancels on pointer up/leave/cancel before the threshold elapses', () => {
        const onLongPress = vi.fn();
        const { result } = renderHook(() => useLongPress(onLongPress, { thresholdMs: 500 }));

        result.current.onPointerDown(touchEvent(0, 0));
        result.current.onPointerUp(touchEvent(0, 0));
        vi.advanceTimersByTime(1000);
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('consumeLongPress reports true exactly once after a long-press fires, then resets', () => {
        const onLongPress = vi.fn();
        const { result } = renderHook(() => useLongPress(onLongPress, { thresholdMs: 500 }));

        result.current.onPointerDown(touchEvent(0, 0));
        vi.advanceTimersByTime(500);

        expect(result.current.consumeLongPress()).toBe(true);
        expect(result.current.consumeLongPress()).toBe(false);
    });

    it('consumeLongPress reports false when no long-press has fired', () => {
        const onLongPress = vi.fn();
        const { result } = renderHook(() => useLongPress(onLongPress, { thresholdMs: 500 }));

        expect(result.current.consumeLongPress()).toBe(false);
    });
});
