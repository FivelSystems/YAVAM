import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContextMenu from './ContextMenu';
import { VarPackage } from '../../types';

const authState = { isAuthenticated: false, isGuest: false };

vi.mock('../../features/auth/AuthContext', () => ({
    useAuth: () => authState,
}));

const pkg = { id: 'creator.pkg.1', fileName: 'creator.pkg.1.var', filePath: 'C:/lib/creator.pkg.1.var' } as unknown as VarPackage;

function renderMenu() {
    return render(
        <ContextMenu
            x={0}
            y={0}
            pkg={pkg}
            onClose={vi.fn()}
            onToggle={vi.fn()}
            onOpenFolder={vi.fn()}
            onDownload={vi.fn()}
            onCopyPath={vi.fn()}
            onCopyFiles={vi.fn()}
            onCutFile={vi.fn()}
            onDelete={vi.fn()}
            onMerge={vi.fn()}
            onMergeInPlace={vi.fn()}
            onResolve={vi.fn()}
            onSetRating={vi.fn()}
            onSetFavorite={vi.fn()}
        />
    );
}

describe('ContextMenu file download', () => {
    afterEach(() => {
        // @ts-ignore
        delete window.go;
    });

    // AnchoredMenu gives every action row an explicit `role="menuitem"` (not
    // the button's implicit `role="button"`), per the ARIA menu/menuitem
    // contract the anchored-menu primitive adds.
    it('hides Download File from guest web clients', () => {
        Object.assign(authState, { isAuthenticated: false, isGuest: true });
        renderMenu();

        expect(screen.queryByRole('menuitem', { name: /download file/i })).toBeNull();
    });

    it('shows Download File to authenticated web clients', () => {
        Object.assign(authState, { isAuthenticated: true, isGuest: false });
        renderMenu();

        expect(screen.getByRole('menuitem', { name: /download file/i })).toBeInTheDocument();
    });

    it('never offers Download File in the desktop webview', () => {
        // @ts-ignore
        window.go = {};
        Object.assign(authState, { isAuthenticated: true, isGuest: false });
        renderMenu();

        expect(screen.queryByRole('menuitem', { name: /download file/i })).toBeNull();
    });
});