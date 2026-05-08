import { useState, useEffect, useRef } from 'react';
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
    // localStorage is a fast, synchronous cache that prevents the settings
    // from appearing as "off" during the async backend config load.
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

    // Guards the persistence effect from firing before the backend config is
    // loaded. Without this, the effect fires on mount with stale localStorage
    // defaults and overwrites config.json before we've even read it.
    const configLoadedRef = useRef(false);

    // -- Backend Sync on Mount (Source of Truth) --
    // MUST be defined BEFORE the persistence effect so React runs it first.
    useEffect(() => {
        // @ts-ignore
        if (window.go?.main?.App?.GetConfig) {
            // @ts-ignore
            window.go.main.App.GetConfig().then((cfg: any) => {
                // config.json is the authoritative source; override localStorage defaults.
                const censor = cfg.censorThumbnails ?? cfg.privacyMode ?? false;
                setCensorThumbnails(censor);
                if (cfg.blurAmount !== undefined) setBlurAmount(cfg.blurAmount);
                if (cfg.hidePackageNames !== undefined) setHidePackageNames(cfg.hidePackageNames);
                if (cfg.hideCreatorNames !== undefined) setHideCreatorNames(cfg.hideCreatorNames);
            }).catch(() => {}).finally(() => {
                // Allow the persistence effect to save future user-triggered changes.
                configLoadedRef.current = true;
            });
        } else {
            // Web mode — localStorage is the only source.
            configLoadedRef.current = true;
        }
    }, []);

    // -- Persistence (fires when user changes a setting) --
    useEffect(() => {
        // Skip the on-mount fire that happens before the backend config is loaded.
        // This prevents stale localStorage values from overwriting config.json.
        if (!configLoadedRef.current) return;

        localStorage.setItem('privacy_censorThumbnails', String(censorThumbnails));
        localStorage.setItem('privacy_blurAmount', String(blurAmount));
        localStorage.setItem('privacy_hidePackageNames', String(hidePackageNames));
        localStorage.setItem('privacy_hideCreatorNames', String(hideCreatorNames));

        // @ts-ignore
        if (window.go?.main?.App?.SetPrivacyOptions) {
            // @ts-ignore
            window.go.main.App.SetPrivacyOptions(censorThumbnails, blurAmount, hidePackageNames, hideCreatorNames)
                .catch(() => {});
        }
    }, [censorThumbnails, blurAmount, hidePackageNames, hideCreatorNames]);

    // -- Keybinds --
    useKeybindSubscription('toggle_privacy', () => {
        setCensorThumbnails(prev => !prev);
    }, [setCensorThumbnails]);

    return {
        censorThumbnails, setCensorThumbnails,
        blurAmount, setBlurAmount,
        hidePackageNames, setHidePackageNames,
        hideCreatorNames, setHideCreatorNames
    };
};
