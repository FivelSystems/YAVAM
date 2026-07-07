import { describe, it, expect } from 'vitest';
import { getSuggestions, SearchVocabulary } from './suggest';

const vocab: SearchVocabulary = {
    creators: ['AcidBubbles', 'dnaddr', 'shaper', 'Long Name'],
    types: ['scene', 'look', 'clothing'],
    tags: ['dress', 'hair', 'clothing'],
};

describe('getSuggestions', () => {
    it('suggests field names for a bare partial', () => {
        const s = getSuggestions('cr', vocab);
        expect(s[0]).toMatchObject({ kind: 'field', field: 'creator', insertText: 'creator:' });
    });

    it('suggests matching values after a field prefix', () => {
        const s = getSuggestions('creator:sh', vocab);
        expect(s).toEqual([
            { kind: 'value', field: 'creator', label: 'shaper', insertText: 'creator:shaper' },
        ]);
    });

    it('quotes values that contain spaces', () => {
        const s = getSuggestions('creator:long', vocab);
        expect(s[0].insertText).toBe('creator:"Long Name"');
    });

    it('offers static status values', () => {
        const s = getSuggestions('status:', vocab);
        expect(s.map(x => x.label)).toContain('enabled');
        expect(s.map(x => x.label)).toContain('corrupt');
    });

    it('carries the - operator into the suggestion', () => {
        const s = getSuggestions('-status:corr', vocab);
        expect(s[0].insertText).toBe('-status:corrupt');
    });

    it('surfaces direct value matches alongside fields', () => {
        const s = getSuggestions('dress', vocab);
        expect(s.some(x => x.insertText === 'tag:dress')).toBe(true);
    });

    it('suggests a category/type from a bare word without the field', () => {
        const s = getSuggestions('scen', vocab);
        expect(s.some(x => x.insertText === 'type:scene')).toBe(true);
    });

    it('suggests a creator from a bare word without the field', () => {
        const s = getSuggestions('shap', vocab);
        expect(s.some(x => x.insertText === 'creator:shaper')).toBe(true);
    });

    it('lists all searchable fields when empty', () => {
        const s = getSuggestions('', vocab);
        expect(s.map(x => x.field)).toEqual(['creator', 'type', 'tag', 'status', 'size']);
    });

    it('returns nothing for an inert field prefix', () => {
        expect(getSuggestions('license:cc', vocab)).toEqual([]);
    });
});
