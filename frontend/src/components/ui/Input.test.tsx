import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Input } from './Input';
import userEvent from '@testing-library/user-event';

describe('Input Component', () => {
    it('renders with a label', () => {
        render(<Input label="Test Label" />);
        expect(screen.getByText('Test Label')).toBeInTheDocument();
    });

    it('renders with helper text', () => {
        render(<Input description="Helper text" />);
        expect(screen.getByText('Helper text')).toBeInTheDocument();
    });

    it('shows error message', () => {
        render(<Input error="Invalid input" />);
        expect(screen.getByText('Invalid input')).toBeInTheDocument();
        expect(screen.getByRole('textbox')).toHaveClass('border-red-500');
    });

    it('handles user input', async () => {
        const user = userEvent.setup();
        render(<Input placeholder="Enter text" />);

        const input = screen.getByPlaceholderText('Enter text');
        await user.type(input, 'Hello World');

        expect(input).toHaveValue('Hello World');
    });

    it('supports disabled state', () => {
        render(<Input disabled />);
        expect(screen.getByRole('textbox')).toBeDisabled();
    });
});
