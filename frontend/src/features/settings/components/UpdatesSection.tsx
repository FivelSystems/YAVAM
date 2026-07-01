import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { HTMLMotionProps } from 'framer-motion';
import Modal from '../../../components/ui/Modal';
import { SettingGroup } from './SettingGroup';
import { UpgradeModal } from '../../packages/UpgradeModal';

type Channel = 'stable' | 'unstable';
type ToastFn = (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;

const CHANNEL_LABEL: Record<Channel, string> = { stable: 'Stable', unstable: 'Unstable' };

interface UpdatesSectionProps {
    addToast: ToastFn;
    variants?: HTMLMotionProps<'div'>['variants'];
}

// Runtime Wails bindings. We deliberately go through window.go (rather than the
// generated TS module) to match the rest of the codebase and avoid regenerating
// bindings for the new App methods.
const appApi = () => (window as any).go?.main?.App;

export function UpdatesSection({ addToast, variants }: UpdatesSectionProps) {
    const [channel, setChannel] = useState<Channel>('stable');
    const [currentVersion, setCurrentVersion] = useState('');
    const [checking, setChecking] = useState(false);

    // Confirmation dialog for a pending channel switch (null = closed).
    const [pending, setPending] = useState<Channel | null>(null);

    // Install prompt — reuses the app's UpgradeModal.
    const [installInfo, setInstallInfo] = useState<any>(null);
    const [installing, setInstalling] = useState(false);

    useEffect(() => {
        const a = appApi();
        if (!a) return;
        a.GetUpdateChannel?.().then((c: string) => setChannel(c === 'unstable' ? 'unstable' : 'stable')).catch(() => {});
        a.GetAppVersion?.().then((v: string) => setCurrentVersion(v)).catch(() => {});
    }, []);

    const requestSwitch = (target: Channel) => {
        if (target !== channel) setPending(target);
    };

    const confirmSwitch = async () => {
        const target = pending;
        setPending(null);
        if (!target) return;
        const a = appApi();
        if (!a) return;
        try {
            // 1. Persist the preference first — it sticks even if the user defers
            //    the install below.
            await a.SetUpdateChannel(target);
            setChannel(target);
            // 2. Offer the target channel's build (an upgrade to unstable, or a
            //    downgrade to stable). null means the head equals the running build.
            const info = await a.CheckChannel(target);
            if (info) setInstallInfo(info);
            else addToast(`You're on the ${CHANNEL_LABEL[target]} channel and up to date.`, 'success');
        } catch (e) {
            addToast('Could not switch channel: ' + e, 'error');
        }
    };

    const checkNow = async () => {
        const a = appApi();
        if (!a) return;
        setChecking(true);
        try {
            const info = await a.CheckForUpdates();
            if (info) setInstallInfo(info);
            else addToast('You are up to date.', 'success');
        } catch (e) {
            addToast('Update check failed: ' + e, 'error');
        } finally {
            setChecking(false);
        }
    };

    const doInstall = async () => {
        const a = appApi();
        if (!a || !installInfo) return;
        setInstalling(true);
        try {
            await a.ApplyUpdate(installInfo.downloadUrl);
            addToast('Update installed! Restarting...', 'success');
            setTimeout(() => a.RestartApp?.(), 1000);
        } catch (e) {
            addToast('Update failed: ' + e, 'error');
            setInstalling(false);
            setInstallInfo(null);
        }
    };

    // Capture the direction so the dialog text stays correct during the close
    // animation (when `pending` briefly becomes null).
    const toUnstable = pending === 'unstable';

    return (
        <SettingGroup title="Updates" variants={variants} tooltip="Choose how YAVAM updates. Stable is recommended; Unstable delivers weekly in-development builds that may contain bugs.">
            <div className="px-1 py-1 space-y-4">
                {/* Channel selector */}
                <div className="space-y-2">
                    <div className="inline-flex rounded-lg bg-gray-900/60 border border-gray-700/60 p-1">
                        {(['stable', 'unstable'] as Channel[]).map((c) => (
                            <button
                                key={c}
                                onClick={() => requestSwitch(c)}
                                className={clsx(
                                    'px-4 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 font-medium',
                                    channel === c
                                        ? c === 'unstable'
                                            ? 'bg-amber-600 text-white shadow'
                                            : 'bg-blue-600 text-white shadow'
                                        : 'text-gray-400 hover:text-gray-200'
                                )}
                            >
                                {c === 'unstable' ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
                                {CHANNEL_LABEL[c]}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500">
                        {channel === 'unstable'
                            ? 'Weekly in-development builds. Expect bugs — switch back to Stable anytime.'
                            : 'Tested releases, recommended for most users.'}
                    </p>
                </div>

                {/* Status + manual check */}
                <div className="flex items-center justify-between gap-4 pt-1">
                    <div className="text-xs text-gray-500 font-mono">
                        Current build: <span className="text-gray-300">v{currentVersion || '—'}</span>
                        <span className="mx-2 text-gray-700">·</span>
                        Channel: <span className="text-gray-300">{CHANNEL_LABEL[channel]}</span>
                    </div>
                    <button
                        onClick={checkNow}
                        disabled={checking}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-700/60 text-gray-200 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
                        {checking ? 'Checking…' : 'Check now'}
                    </button>
                </div>
            </div>

            {/* Switch confirmation */}
            <Modal
                isOpen={pending !== null}
                onClose={() => setPending(null)}
                title={toUnstable ? 'Switch to the Unstable channel?' : 'Switch to the Stable channel?'}
                size="md"
                footer={
                    <>
                        <button
                            onClick={() => setPending(null)}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmSwitch}
                            className={clsx(
                                'px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors',
                                toUnstable ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'
                            )}
                        >
                            {toUnstable ? 'Switch to Unstable' : 'Switch to Stable'}
                        </button>
                    </>
                }
            >
                <p className="text-sm text-gray-300 leading-relaxed">
                    {toUnstable ? (
                        <>You'll receive <span className="text-amber-400">weekly in-development builds</span> that may contain bugs. Your data is safe, and you can switch back to Stable at any time.</>
                    ) : (
                        <>This installs the latest <span className="text-blue-400">stable release</span>, which may be an <span className="text-gray-100">older version</span> than your current build. Your data is kept — any ratings or favourites added on newer builds reappear if you switch back to Unstable.</>
                    )}
                </p>
            </Modal>

            {/* Install prompt (shared component) */}
            <UpgradeModal
                open={installInfo !== null}
                version={installInfo?.version || 'Unknown'}
                onUpdate={doInstall}
                onCancel={() => setInstallInfo(null)}
                downloading={installing}
            />
        </SettingGroup>
    );
}
