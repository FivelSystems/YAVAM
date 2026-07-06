import { describe, it, expect } from 'vitest';
import { VarPackage } from '../../types';
import { parseSearchQuery, buildQueryString } from './parse';
import { buildMatcher } from './match';

const pkg = (overrides: Partial<VarPackage>): VarPackage => ({
    filePath: 'X:/lib/Creator.Package.1.var',
    fileName: 'Creator.Package.1.var',
    size: 10 * 1024 * 1024,
    meta: { creator: 'Creator', packageName: 'Package', version: '1' },
    thumbnailPath: '',
    isEnabled: true,
    hasThumbnail: false,
    missingDeps: [],
    isDuplicate: false,
    isExactDuplicate: false,
    categories: [],
    tags: [],
    scanPhase: 'analyzed',
    ...overrides,
});

const run = (query: string, packages: VarPackage[]) => {
    const match = buildMatcher(parseSearchQuery(query));
    return packages.filter(match);
};

describe('parseSearchQuery', () => {
    it('returns no tokens for empty input', () => {
        expect(parseSearchQuery('   ').tokens).toEqual([]);
    });

    it('classifies field tokens and barewords', () => {
        const { tokens } = parseSearchQuery('creator:AcidBubbles dress');
        expect(tokens).toEqual([
            { field: 'creator', op: 'require', value: 'acidbubbles', raw: 'creator:AcidBubbles' },
            { field: 'text', op: 'require', value: 'dress', raw: 'dress' },
        ]);
    });

    it('reads + and - operators', () => {
        const { tokens } = parseSearchQuery('+tag:dress -status:corrupt');
        expect(tokens[0]).toMatchObject({ field: 'tag', op: 'require', value: 'dress' });
        expect(tokens[1]).toMatchObject({ field: 'status', op: 'exclude', value: 'corrupt' });
    });

    it('keeps quoted values with spaces together', () => {
        const { tokens } = parseSearchQuery('tag:"long dress"');
        expect(tokens[0]).toMatchObject({ field: 'tag', value: 'long dress' });
    });

    it('treats an unknown prefix as free text', () => {
        const { tokens } = parseSearchQuery('color:red');
        expect(tokens[0]).toMatchObject({ field: 'text', value: 'color:red' });
    });
});

describe('buildQueryString', () => {
    it('floats free-text words to the end, keeping field order', () => {
        const { tokens } = parseSearchQuery('type:scene red creator:shaper dress');
        expect(buildQueryString(tokens)).toBe('type:scene creator:shaper red dress');
    });

    it('is a no-op when there are no free-text words', () => {
        const { tokens } = parseSearchQuery('creator:a type:b');
        expect(buildQueryString(tokens)).toBe('creator:a type:b');
    });
});

describe('combining semantics', () => {
    const scene = pkg({ meta: { creator: 'callimohu', packageName: 'S', version: '1' }, type: 'scene', tags: ['dress'] });
    const look = pkg({ meta: { creator: 'callimohu', packageName: 'L', version: '1' }, type: 'look', tags: ['clothing'] });
    const other = pkg({ meta: { creator: 'picovam', packageName: 'O', version: '1' }, type: 'scene', tags: [] });
    const all = [scene, look, other];

    it('ANDs different token types', () => {
        expect(run('creator:callimohu type:scene', all)).toEqual([scene]);
    });

    it('ORs multiple tokens of the same type', () => {
        expect(run('creator:callimohu +creator:picovam', all)).toEqual([scene, look, other]);
    });

    it('ANDs free-text words rather than ORing them', () => {
        const red = pkg({ fileName: 'red-dress.var' });
        const dress = pkg({ fileName: 'blue-dress.var' });
        expect(run('red dress', [red, dress])).toEqual([red]);
    });

    it('excludes with the - operator', () => {
        const corrupt = pkg({ isCorrupt: true, meta: { creator: 'callimohu', packageName: 'C', version: '1' } });
        expect(run('creator:callimohu -status:corrupt', [scene, corrupt])).toEqual([scene]);
    });

    it('matches tags OR-ed with a required license... but license is inert', () => {
        // tag:dress OR tag:clothing, license ignored (no data yet) → both callimohu items
        expect(run('tag:dress +tag:clothing license:cc-by', all)).toEqual([scene, look]);
    });
});

describe('status token', () => {
    const enabled = pkg({ isEnabled: true });
    const disabled = pkg({ isEnabled: false });
    const missing = pkg({ missingDeps: ['Foo.Bar.1'] });
    const corrupt = pkg({ isCorrupt: true, isEnabled: false });

    it('filters enabled/disabled', () => {
        expect(run('status:enabled', [enabled, disabled])).toEqual([enabled]);
        expect(run('status:disabled', [enabled, disabled])).toEqual([disabled]);
    });

    it('filters missing deps and corrupt', () => {
        expect(run('status:missing', [enabled, missing])).toEqual([missing]);
        expect(run('status:corrupt', [enabled, corrupt])).toEqual([corrupt]);
    });
});

describe('size token', () => {
    const small = pkg({ size: 5 * 1024 * 1024 });
    const big = pkg({ size: 800 * 1024 * 1024 });

    it('matches an upper/lower bound', () => {
        expect(run('size:>500mb', [small, big])).toEqual([big]);
        expect(run('size:<100mb', [small, big])).toEqual([small]);
    });

    it('matches a range', () => {
        expect(run('size:1mb..10mb', [small, big])).toEqual([small]);
    });
});

describe('type token', () => {
    it('matches categories when present, else the type field', () => {
        const cat = pkg({ categories: ['Clothing'], type: 'other' });
        const typed = pkg({ categories: [], type: 'Scene' });
        expect(run('type:clothing', [cat, typed])).toEqual([cat]);
        expect(run('type:scene', [cat, typed])).toEqual([typed]);
    });
});
