import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ToastProvider } from '../../context/ToastContext';
import { ToastContainer } from './ToastContainer';
import { stubMemoryLocalStorage } from '../../test/memoryStorage';
import tailwindConfig from '../../../tailwind.config.js';

const HIGHEST_MODAL_LAYER = 110;

describe('toast stacking', () => {
    const layers = tailwindConfig.theme.extend.zIndex as Record<string, string>;

    it('puts the toast container on the toast layer', () => {
        stubMemoryLocalStorage();
        const { container } = render(<ToastProvider><ToastContainer /></ToastProvider>);

        expect(container.firstElementChild).toHaveClass('z-toast');
    });

    it('keeps the toast layer above every modal layer', () => {
        expect(Number(layers.toast)).toBeGreaterThan(HIGHEST_MODAL_LAYER);
        expect(Number(layers.toast)).toBeGreaterThan(Number(layers.modal));
    });
});
