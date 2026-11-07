import { describe, it, expect } from 'vitest';
import { hasToken, hasField, addToken, removeToken, toggleToken, clearField, getRating, setRating } from './tokens';

describe('token helpers', () => {
    it('adds a token and detects it case-insensitively', () => {
        const q = addToken('', 'creator', 'AcidBubbles');
        expect(q).toBe('creator:AcidBubbles');
        expect(hasToken(q, 'creator', 'acidbubbles')).toBe(true);
        expect(hasField(q, 'creator')).toBe(true);
    });

    it('does not duplicate an existing token', () => {
        const q = addToken('creator:shaper', 'creator', 'shaper');
        expect(q).toBe('creator:shaper');
    });

    it('toggles a token on when absent and off when present', () => {
        expect(toggleToken('', 'type', 'scene')).toBe('type:scene');
        expect(toggleToken('type:scene', 'type', 'scene')).toBe('');
    });

    it('stacks multiple values of the same field', () => {
        let q = addToken('', 'creator', 'shaper');
        q = addToken(q, 'creator', 'dnaddr');
        expect(hasToken(q, 'creator', 'shaper')).toBe(true);
        expect(hasToken(q, 'creator', 'dnaddr')).toBe(true);
    });

    it('quotes values containing spaces', () => {
        expect(addToken('', 'creator', 'Long Name')).toBe('creator:"Long Name"');
    });

    it('removes one value without touching the rest', () => {
        const q = 'creator:shaper creator:dnaddr';
        expect(removeToken(q, 'creator', 'shaper')).toBe('creator:dnaddr');
    });

    it('clears every token of a field but keeps others', () => {
        const q = 'status:enabled creator:shaper status:missing-deps';
        const cleared = clearField(q, 'status');
        expect(hasField(cleared, 'status')).toBe(false);
        expect(hasToken(cleared, 'creator', 'shaper')).toBe(true);
    });

    it('preserves free text when editing tokens', () => {
        const q = addToken('red dress', 'type', 'scene');
        expect(q).toBe('type:scene red dress');
        expect(removeToken(q, 'type', 'scene')).toBe('red dress');
    });
});

describe('rating helpers', () => {
    it('reads the active exact rating, defaulting to 0', () => {
        expect(getRating('')).toBe(0);
        expect(getRating('rating:4')).toBe(4);
        expect(getRating('creator:shaper rating:2')).toBe(2);
    });

    it('sets an exact rating, replacing any existing one (unique, not additive)', () => {
        expect(getRating(setRating('rating:2', 5))).toBe(5);
        expect(setRating('', 3)).toBe('rating:3');
    });

    it('clears the rating filter when set to zero', () => {
        expect(setRating('creator:shaper rating:4', 0)).toBe('creator:shaper');
    });
});
