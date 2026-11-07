import { describe, it, expect } from 'vitest';
import {
    validateAdminPassword,
    PASSWORD_TOO_SHORT_MESSAGE,
    PASSWORD_IS_DEFAULT_MESSAGE,
} from './passwordRules';

describe('validateAdminPassword', () => {
    it('rejects the default password', () => {
        expect(validateAdminPassword('admin')).toBe(PASSWORD_IS_DEFAULT_MESSAGE);
    });

    it('rejects passwords shorter than 8 characters', () => {
        expect(validateAdminPassword('1234567')).toBe(PASSWORD_TOO_SHORT_MESSAGE);
    });

    it('counts characters rather than bytes', () => {
        expect(validateAdminPassword('ñññññññ')).toBe(PASSWORD_TOO_SHORT_MESSAGE);
        expect(validateAdminPassword('ññññññññ')).toBeNull();
    });

    it('accepts a long enough password', () => {
        expect(validateAdminPassword('correct horse')).toBeNull();
    });
});
