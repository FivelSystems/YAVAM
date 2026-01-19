
import { useState, useEffect } from 'react';
import { VarPackage } from '../types';

export const useThumbnail = (pkg: VarPackage | null) => {
    const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!pkg) {
            setThumbSrc(undefined);
            return;
        }

        if (pkg.thumbnailBase64) {
            setThumbSrc(`data:image/jpeg;base64,${pkg.thumbnailBase64}`);
        } else if (pkg.hasThumbnail) {
            // Check if we are in Wails context
            if (window.go && window.go.main && window.go.main.App) {
                window.go.main.App.GetPackageThumbnail(pkg.filePath)
                    .then((b64: string) => {
                        if (b64) setThumbSrc(`data:image/jpeg;base64,${b64}`);
                    })
                    .catch((e: any) => console.error(e));
            } else {
                // Web Mode Fallback
                const token = localStorage.getItem('yavam_auth_token');
                setThumbSrc(`/api/thumbnail?filePath=${encodeURIComponent(pkg.filePath)}&token=${token || ''}`);
            }
        } else {
            setThumbSrc(undefined);
        }
    }, [pkg]);

    return thumbSrc;
};
