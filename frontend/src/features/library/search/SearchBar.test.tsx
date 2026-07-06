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

const getInput = () => screen.getByPlaceholderText(/Search…/i);

describe('SearchBar', () => {
    it('commits a free-text term as a chip on Enter', () => {
        render(<SearchBar />);
        const input = getInput();
        fireEvent.change(input, { target: { value: 'hello' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByText('hello')).toBeInTheDocument();
        expect((input as HTMLInputElement).value).toBe('');
    });

    it('picks the highlighted suggestion on Enter', () => {
        render(<SearchBar />);
        const input = getInput();
        fireEvent.change(input, { target: { value: 'creator:sh' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByText('creator:shaper')).toBeInTheDocument();
    });

    it('applies a suggestion on click', () => {
        render(<SearchBar />);
        fireEvent.change(getInput(), { target: { value: 'creator:dna' } });
        fireEvent.click(screen.getByText('dnaddr'));
        expect(screen.getByText('creator:dnaddr')).toBeInTheDocument();
    });

    it('removes a chip via its remove button', () => {
        render(<SearchBar />);
        const input = getInput();
        fireEvent.change(input, { target: { value: 'hello' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.click(screen.getByRole('button', { name: /remove hello/i }));
        expect(screen.queryByText('hello')).not.toBeInTheDocument();
    });

    it('removes the last chip on Backspace when the draft is empty', () => {
        render(<SearchBar />);
        const input = getInput();
        fireEvent.change(input, { target: { value: 'hello' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.keyDown(input, { key: 'Backspace' });
        expect(screen.queryByText('hello')).not.toBeInTheDocument();
    });

    it('commits on space for a complete token', () => {
        render(<SearchBar />);
        const input = getInput();
        fireEvent.change(input, { target: { value: 'red' } });
        fireEvent.keyDown(input, { key: ' ' });
        expect(screen.getByText('red')).toBeInTheDocument();
    });

    it('suggests a value implicitly from a bare word (no field typed)', () => {
        render(<SearchBar />);
        fireEvent.change(getInput(), { target: { value: 'shap' } });
        fireEvent.click(screen.getByText('shaper'));
        expect(screen.getByText('creator:shaper')).toBeInTheDocument();
    });

    it('floats free text after field tokens regardless of typing order', () => {
        render(<SearchBar />);
        const input = getInput();
        // Type a free-text word first, then a field token.
        fireEvent.change(input, { target: { value: 'red' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.change(input, { target: { value: 'creator:dna' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        // Chips should read: creator:dnaddr then red.
        const chips = screen.getAllByRole('button', { name: /remove/i }).map(b => b.getAttribute('aria-label'));
        expect(chips).toEqual(['Remove creator:dnaddr', 'Remove red']);
    });
});
