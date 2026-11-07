import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, KeyRound, RefreshCw, ShieldAlert } from 'lucide-react';
import { SettingGroup } from './SettingGroup';
import { SettingItem } from './SettingItem';
import { Toggle } from '../../../components/ui/Toggle';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import type { remoteaccess } from '../../../wailsjs/go/models';

const COUNTDOWN_TICK_MS = 1000;
const PAIRING_STATE_POLL_MS = 2000;
const SECONDS_PER_MINUTE = 60;
const SERVER_STATUS_EVENT = 'server:status:changed';

type BindMode = 'all' | 'loopback' | 'specific';

const BIND_OPTIONS: { mode: BindMode; label: string; hint: string }[] = [
    { mode: 'all', label: 'All network interfaces', hint: 'Other devices on your network can reach the server.' },
    { mode: 'loopback', label: 'This computer only', hint: 'Other devices cannot connect.' },
    { mode: 'specific', label: 'A specific address', hint: 'Listen on one network interface of this computer.' },
];

interface RemoteAccessApi {
    GetRemoteAccessState(): Promise<remoteaccess.State>;
    CreatePairingCode(): Promise<remoteaccess.PairingGrant>;
    SetAllowRemotePasswordLogin(allowed: boolean): Promise<void>;
    SetServerBindAddress(address: string): Promise<void>;
}

function remoteAccessApi(): RemoteAccessApi | null {
    // @ts-ignore
    return window.go?.main?.App ?? null;
}

function describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

function modeOf(address: string): BindMode {
    if (address === 'all' || address === 'loopback') return address;
    return 'specific';
}

function secondsUntil(isoTime: string): number {
    const remaining = Math.ceil((new Date(isoTime).getTime() - Date.now()) / 1000);
    return Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
}

function formatCountdown(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function usePairingCode(api: RemoteAccessApi | null, refreshState: () => Promise<remoteaccess.State | null>) {
    // The code lives only in component state: never persisted, never logged.
    const [grant, setGrant] = useState<remoteaccess.PairingGrant | null>(null);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [expired, setExpired] = useState(false);
    const [generating, setGenerating] = useState(false);

    const generate = async () => {
        if (!api) return;
        setGenerating(true);
        setError(null);
        setExpired(false);
        try {
            const created = await api.CreatePairingCode();
            setGrant(created);
            setSecondsLeft(secondsUntil(created.expiresAt));
            await refreshState();
        } catch (e) {
            setGrant(null);
            setError(describeError(e));
        } finally {
            setGenerating(false);
        }
    };

    const expiresAt = grant?.expiresAt;
    useEffect(() => {
        if (!expiresAt) return;
        const timer = setInterval(() => {
            const remaining = secondsUntil(expiresAt);
            setSecondsLeft(remaining);
            if (remaining <= 0) {
                setGrant(null);
                setExpired(true);
            }
        }, COUNTDOWN_TICK_MS);
        return () => clearInterval(timer);
    }, [expiresAt]);

    // A redeemed code stops being active on the backend; stop showing it.
    const hasGrant = grant !== null;
    useEffect(() => {
        if (!hasGrant) return;
        const timer = setInterval(async () => {
            const latest = await refreshState();
            if (latest && !latest.pairing?.active) setGrant(null);
        }, PAIRING_STATE_POLL_MS);
        return () => clearInterval(timer);
    }, [hasGrant, refreshState]);

    return { grant, secondsLeft, error, expired, generating, generate };
}

function PairingPanel({ state, api, refreshState }: {
    state: remoteaccess.State;
    api: RemoteAccessApi | null;
    refreshState: () => Promise<remoteaccess.State | null>;
}) {
    const { grant, secondsLeft, error, expired, generating, generate } = usePairingCode(api, refreshState);
    const canPair = state.hasCustomPassword;

    return (
        <SettingGroup
            title="Pair a device"
            tooltip="Sign in a phone or tablet with a one-time code instead of the password."
        >
            {!canPair ? (
                <p className="text-xs text-orange-300 bg-orange-900/20 border border-orange-900/30 p-2 rounded">
                    Set an administrator password first (Settings &gt; Security). Pairing and remote sign-in stay disabled until then.
                </p>
            ) : (
                <div className="space-y-3">
                    {grant && (
                        <div className="text-center bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-1">
                            <div
                                aria-label="Pairing code"
                                className="text-3xl sm:text-4xl font-mono font-bold tracking-widest text-white select-all"
                            >
                                {grant.code}
                            </div>
                            <div className="text-xs text-gray-400" aria-live="off">
                                Expires in {formatCountdown(secondsLeft)}
                            </div>
                        </div>
                    )}

                    {!grant && state.pairing?.active && (
                        <p className="text-xs text-gray-400">
                            A code is currently active, but it can only be shown when it is created. Generate a new one to see it.
                        </p>
                    )}
                    {expired && <p className="text-xs text-gray-400">The code expired. Generate a new one if needed.</p>}
                    {error && <p role="alert" className="text-xs text-red-400">{error}</p>}

                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs text-orange-300 flex items-start gap-2 flex-1 min-w-[12rem]">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            <span>
                                Anyone on your network who enters this code before it expires gets access to your library.
                                Share it only with a device you control.
                            </span>
                        </p>
                        <Button
                            variant={grant ? 'secondary' : 'primary'}
                            size="sm"
                            loading={generating}
                            onClick={generate}
                            icon={grant ? <RefreshCw size={14} /> : <KeyRound size={14} />}
                        >
                            {grant ? 'Regenerate' : 'Generate pairing code'}
                        </Button>
                    </div>
                </div>
            )}
        </SettingGroup>
    );
}

function BindAddressSetting({ state, api, refreshState }: {
    state: remoteaccess.State;
    api: RemoteAccessApi | null;
    refreshState: () => Promise<remoteaccess.State | null>;
}) {
    const [mode, setMode] = useState<BindMode>(modeOf(state.serverBindAddress));
    const [specificAddress, setSpecificAddress] = useState(modeOf(state.serverBindAddress) === 'specific' ? state.serverBindAddress : '');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setMode(modeOf(state.serverBindAddress));
        if (modeOf(state.serverBindAddress) === 'specific') setSpecificAddress(state.serverBindAddress);
    }, [state.serverBindAddress]);

    const requested = mode === 'specific' ? specificAddress.trim() : mode;
    const unchanged = requested === state.serverBindAddress;

    const apply = async () => {
        if (!api) return;
        setSaving(true);
        setError(null);
        try {
            await api.SetServerBindAddress(requested);
        } catch (e) {
            setError(describeError(e));
        } finally {
            await refreshState();
            setSaving(false);
        }
    };

    return (
        <SettingGroup title="Listen address" tooltip="Which network interfaces the web server accepts connections on.">
            <div className="space-y-2 px-1" role="radiogroup" aria-label="Listen address">
                {BIND_OPTIONS.map(option => (
                    <label key={option.mode} className="flex items-start gap-3 cursor-pointer text-sm text-gray-200">
                        <input
                            type="radio"
                            name="server-bind-mode"
                            className="mt-1"
                            checked={mode === option.mode}
                            onChange={() => setMode(option.mode)}
                            disabled={saving}
                        />
                        <span>
                            {option.label}
                            <span className="block text-xs text-gray-500">{option.hint}</span>
                        </span>
                    </label>
                ))}

                {mode === 'specific' && (
                    <Input
                        aria-label="Specific listen address"
                        placeholder="e.g. 192.168.1.20"
                        value={specificAddress}
                        onChange={(e) => setSpecificAddress(e.target.value)}
                        disabled={saving}
                        className="font-mono"
                    />
                )}

                {error && <p role="alert" className="text-xs text-red-400 bg-red-900/20 border border-red-900/30 p-2 rounded">{error}</p>}

                <div className="flex justify-end">
                    <Button size="sm" onClick={apply} loading={saving} disabled={unchanged || !requested}>
                        Apply
                    </Button>
                </div>
            </div>
        </SettingGroup>
    );
}

export default function RemoteAccessSettings() {
    const api = remoteAccessApi();
    const [state, setState] = useState<remoteaccess.State | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [toggleError, setToggleError] = useState<string | null>(null);
    const mounted = useRef(true);

    const refreshState = useCallback(async () => {
        if (!api) return null;
        try {
            const latest = await api.GetRemoteAccessState();
            if (mounted.current) {
                setState(latest);
                setLoadError(null);
            }
            return latest;
        } catch (e) {
            if (mounted.current) setLoadError(describeError(e));
            return null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        mounted.current = true;
        refreshState();

        // @ts-ignore
        const unsubscribe = window.runtime?.EventsOn?.(SERVER_STATUS_EVENT, () => { refreshState(); });
        return () => {
            mounted.current = false;
            if (typeof unsubscribe === 'function') unsubscribe();
        };
    }, [refreshState]);

    const setAllowPasswordLogin = async (allowed: boolean) => {
        if (!api) return;
        setToggleError(null);
        try {
            await api.SetAllowRemotePasswordLogin(allowed);
        } catch (e) {
            setToggleError(describeError(e));
        }
        await refreshState();
    };

    if (!api) return null;
    if (loadError && !state) {
        return <p role="alert" className="text-xs text-red-400">Could not load remote access settings: {loadError}</p>;
    }
    if (!state) return null;

    return (
        <div className="space-y-6">
            <PairingPanel state={state} api={api} refreshState={refreshState} />

            <SettingGroup
                title="Password sign-in from other devices"
                variant={state.allowRemotePasswordLogin ? 'danger' : 'default'}
                tooltip="By default other devices must pair with a code. This also lets them sign in with the administrator password."
            >
                <SettingItem title="Allow password sign-in from other devices">
                    <Toggle
                        checked={state.allowRemotePasswordLogin}
                        onChange={setAllowPasswordLogin}
                        variant="danger"
                        disabled={!state.hasCustomPassword}
                    />
                </SettingItem>
                <p className={clsx(
                    "text-xs flex items-start gap-2 p-2 rounded",
                    state.allowRemotePasswordLogin ? "bg-red-900/20 border border-red-900/30 text-red-300" : "text-gray-500"
                )}>
                    <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                    <span>
                        The password is sent unencrypted over the local network, so anyone listening on it could capture it.
                        Pairing codes are the safer way to add a device.
                    </span>
                </p>
                {toggleError && <p role="alert" className="text-xs text-red-400 mt-2">{toggleError}</p>}
            </SettingGroup>

            <BindAddressSetting state={state} api={api} refreshState={refreshState} />
        </div>
    );
}
