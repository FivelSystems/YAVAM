import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from './SearchBar';

// Back the filter context with a real hook so setSearchQuery re-renders the bar.
vi.mock('../../../context/FilterContext', async () => {
    const React = await import('react');
    return {
        useFilterContext: () => {
            const [searchQuery, setSearchQuery] = React.useState('');
            const inputRef = React.useRef<HTMLInputElement>(null);
            return { searchQuery, setSearchQuery, inputRef };
        },
    };
});

vi.mock('../../../context/PackageContext', () => ({
    usePackageContext: () => ({
        packages: [
            { meta: { creator: 'shaper' }, categories: ['scene'], type: 'scene' },
            { meta: { creator: 'dnaddr' }, categories: ['look'], type: 'look' },
        ],
        availableTags: ['dress', 'hair'],
    }),
}));

const getInput = () => screen.getByPlaceholderText(/Search/i) as HTMLInputElement;
const removeButtons = () =>
    screen.queryAllByRole('button', { name: /remove/i }).map(b => b.getAttribute('aria-label'));

describe('SearchBar', () => {
    it('keeps a plain word as editable text, not a chip', () => {
        render(<SearchBar />);
        const input = getInput();
        fireEvent.change(input, { target: { value: 'red dress' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(input.value).toBe('red dress');
        expect(removeButtons()).toEqual([]);
    });

    it('does not chip a plain word even when it matches a known tag', () => {
        render(<SearchBar />);
        const input = getInput();
        fireEvent.change(input, { target: { value: 'dress' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(input.value).toBe('dress');
        expect(screen.queryByText('tag:dress')).not.toBeInTheDocument();
        expect(removeButtons()).toEqual([]);
    });

    it('chips a completed field token on Space', () => {
        render(<SearchBar />);
        const input = getInput();
        fireEvent.change(input, { target: { value: 'creator:shaper' } });
        fireEvent.keyDown(input, { key: ' ' });
        expect(screen.getByText('creator:shaper')).toBeInTheDocument();
        expect(input.value).toBe('');
    });

    it('leaves free text in the box when a field token is chipped', () => {
        render(<SearchBar />);
        const input = getInput();
        fireEvent.change(input, { target: { value: 'red creator:shaper' } });
        fireEvent.keyDown(input, { key: ' ' });
        expect(screen.getByText('creator:shaper')).toBeInTheDocument();
        expect(input.value).toBe('red');
    });

    it('applies a value suggestion only when chosen', () => {
        render(<SearchBar />);
        const input = getInput();
        // Typing a bare word that matches a creator does not auto-apply on Enter…
        fireEvent.change(input, { target: { value: 'shap' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.queryByText('creator:shaper')).not.toBeInTheDocument();
        expect(input.value).toBe('shap');
        // …but clicking the suggestion promotes it to a chip.
        fireEvent.change(input, { target: { value: 'shap' } });
        fireEvent.click(screen.getByText('shaper'));
        expect(screen.getByText('creator:shaper')).toBeInTheDocument();
    });

    it('completes a field prefix then its value from suggestions', () => {
        render(<SearchBar />);
        const input = getInput();
        fireEvent.change(input, { target: { value: 'creator:dna' } });
        fireEvent.click(screen.getByText('dnaddr'));
        expect(screen.getByText('creator:dnaddr')).toBeInTheDocument();
    });

    it('removes a chip via its remove button', () => {
        render(<SearchBar />);
        const input = getInput();
        fireEvent.change(input, { target: { value: 'creator:shaper' } });
        fireEvent.keyDown(input, { key: ' ' });
        fireEvent.click(screen.getByRole('button', { name: /remove creator:shaper/i }));
        expect(screen.queryByText('creator:shaper')).not.toBeInTheDocument();
    });

    it('removes the last chip on Backspace when the box is empty', () => {
        render(<SearchBar />);
        const input = getInput();
        fireEvent.change(input, { target: { value: 'creator:shaper' } });
        fireEvent.keyDown(input, { key: ' ' });
        fireEvent.keyDown(input, { key: 'Backspace' });
        expect(screen.queryByText('creator:shaper')).not.toBeInTheDocument();
    });
});
