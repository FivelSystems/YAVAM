import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { KeybindProvider, useKeybindSubscription } from './KeybindContext';

const Probe = ({ actionId, onFire }: { actionId: string; onFire: () => void }) => {
    useKeybindSubscription(actionId, onFire);
    return <input data-testid="text-field" />;
};

const renderProbe = (actionId: string) => {
    const onFire = vi.fn();
    const utils = render(
        <KeybindProvider>
            <Probe actionId={actionId} onFire={onFire} />
        </KeybindProvider>
    );
    return { onFire, field: utils.getByTestId('text-field') };
};

describe('KeybindProvider', () => {
    it('does not dispatch any keybind when Escape is pressed inside a text field', () => {
        const { onFire, field } = renderProbe('toggle_privacy');
        fireEvent.keyDown(field, { key: 'Escape' });
        expect(onFire).not.toHaveBeenCalled();
    });

    it('does not dispatch the privacy keybind when its key is typed inside a text field', () => {
        const { onFire, field } = renderProbe('toggle_privacy');
        fireEvent.keyDown(field, { key: 'v' });
        expect(onFire).not.toHaveBeenCalled();
    });

    it('dispatches the privacy keybind from outside a text field', () => {
        const { onFire } = renderProbe('toggle_privacy');
        fireEvent.keyDown(document.body, { key: 'v' });
        expect(onFire).toHaveBeenCalledTimes(1);
    });
});
