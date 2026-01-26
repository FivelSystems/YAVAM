import { useState, useEffect } from 'react';
import { useKeybindSubscription } from '../context/KeybindContext';

export interface PrivacySettings {
    censorThumbnails: boolean;
    setCensorThumbnails: (v: boolean) => void;
    blurAmount: number;
    setBlurAmount: (v: number) => void;
    hidePackageNames: boolean;
    setHidePackageNames: (v: boolean) => void;
    hideCreatorNames: boolean;
    setHideCreatorNames: (v: boolean) => void;
}

export const usePrivacySettings = (): PrivacySettings => {
    // -- State Initialization (Lazy Load from localStorage) --
    const [censorThumbnails, setCensorThumbnails] = useState(() => {
        return localStorage.getItem('privacy_censorThumbnails') === 'true';
    });
    const [blurAmount, setBlurAmount] = useState(() => {
        const stored = localStorage.getItem('privacy_blurAmount');
        return stored ? parseInt(stored, 10) : 10;
    });
    const [hidePackageNames, setHidePackageNames] = useState(() => {
        return localStorage.getItem('privacy_hidePackageNames') === 'true';
    });
    const [hideCreatorNames, setHideCreatorNames] = useState(() => {
        return localStorage.getItem('privacy_hideCreatorNames') === 'true';
    });

    // -- Persistence Effects --
    useEffect(() => {
        localStorage.setItem('privacy_censorThumbnails', String(censorThumbnails));
    }, [censorThumbnails]);

    useEffect(() => {
        localStorage.setItem('privacy_blurAmount', String(blurAmount));
    }, [blurAmount]);

    useEffect(() => {
        localStorage.setItem('privacy_hidePackageNames', String(hidePackageNames));
    }, [hidePackageNames]);

    useEffect(() => {
        localStorage.setItem('privacy_hideCreatorNames', String(hideCreatorNames));
    }, [hideCreatorNames]);

    // -- Keybinds --
    useKeybindSubscription('toggle_privacy', () => {
        // Toggle all privacy settings? Or just a specific one? 
        // Usually toggles "Hide Everything" or reverts. 
        // Let's assume it flips Censor Thumbnails for now as primary.
        setCensorThumbnails(prev => !prev);
    }, [setCensorThumbnails]);

    return {
        censorThumbnails, setCensorThumbnails,
        blurAmount, setBlurAmount,
        hidePackageNames, setHidePackageNames,
        hideCreatorNames, setHideCreatorNames
    };
};
