import { useRef } from 'react';

export const SCAN_REVEAL_CLASS = 'scan-reveal';

/**
 * Returns the reveal class only for a card that was still pending while a scan
 * was active and has since received its data. Cards that mount with their data
 * already known (cache, page change) never get it.
 */
export const useScanReveal = (isPending: boolean, isScanActive: boolean): string | undefined => {
    const wasPendingDuringScan = useRef(false);
    if (isPending && isScanActive) wasPendingDuringScan.current = true;
    return wasPendingDuringScan.current && !isPending ? SCAN_REVEAL_CLASS : undefined;
};
