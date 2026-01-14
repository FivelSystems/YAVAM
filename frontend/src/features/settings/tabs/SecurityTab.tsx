import { useState } from 'react';
import { SettingGroup } from '../components/SettingGroup';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Download, Upload, FolderOpen, Trash2, AlertTriangle, ExternalLink } from 'lucide-react';

interface SecurityTabProps {
    handleClearData: () => void;
    addToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

const SecurityTab = ({ handleClearData, addToast }: SecurityTabProps) => {
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPasswordUI, setShowPasswordUI] = useState(false);

    const handleUpdatePassword = async () => {
        try {
            // @ts-ignore
            if (window.go) {
                // @ts-ignore
                await window.go.main.App.UpdatePassword(newPassword);
                addToast("Password updated successfully!", "success");
                setNewPassword("");
                setConfirmPassword("");
                setShowPasswordUI(false);
            } else {
                addToast("Password change only available in Desktop mode for now.", "warning");
            }
        } catch (e: any) {
            addToast("Failed to update password: " + (e.message || e), "error");
        }
    };

    const handleExport = async () => {
        try {
            // @ts-ignore
            const path = await window.go.main.App.ExportSettings();
            if (path) addToast(`Settings exported to ${path}`, 'success');
        } catch (e: any) {
            addToast(`Export failed: ${e}`, 'error');
        }
    };

    const handleImport = async () => {
        if (!confirm("This will overwrite your current settings and restart the application. Continue?")) return;
        try {
            // @ts-ignore
            await window.go.main.App.ImportSettings();
            // App restarts, so we might not see this
            addToast("Restoring...", 'info');
        } catch (e: any) {
            addToast(`Import failed: ${e}`, 'error');
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <h4 className="text-lg font-medium text-white mb-1">Security & Storage</h4>
                <p className="text-sm text-gray-500 mb-6">Manage access controls and application data.</p>

                <div className="space-y-6">
                    {/* Password Change Section */}
                    <SettingGroup
                        title="Access Password"
                        tooltip="Protect unauthorized access to Settings and Library."
                        action={
                            <button
                                onClick={() => setShowPasswordUI(!showPasswordUI)}
                                className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
                            >
                                {showPasswordUI ? "Cancel" : "Change Password"}
                            </button>
                        }
                    >
                        {showPasswordUI && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Input
                                        label="New Password"
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Enter new password"
                                        className="w-full"
                                    />
                                    <Input
                                        label="Confirm Password"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Confirm new password"
                                        className="w-full"
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        disabled={!newPassword || newPassword !== confirmPassword}
                                        onClick={handleUpdatePassword}
                                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        Update Password
                                    </button>
                                </div>
                            </div>
                        )}
                    </SettingGroup>


                    {/* Backup & Restore (Moved from Application) */}
                    <SettingGroup title="Backup & Restore">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Button
                                variant="secondary"
                                icon={<Download size={16} />}
                                onClick={handleExport}
                                className="w-full justify-start"
                            >
                                Export Backup
                            </Button>
                            <Button
                                variant="secondary"
                                icon={<Upload size={16} className="text-amber-500" />}
                                onClick={handleImport}
                                className="w-full justify-start hover:text-amber-400"
                            >
                                Restore Backup
                            </Button>
                        </div>
                    </SettingGroup>

                    {/* Data Management */}
                    <SettingGroup title="Data Management">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                onClick={() => {
                                    // @ts-ignore
                                    if (window.go) window.go.main.App.OpenAppDataFolder();
                                }}
                                className="flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/50 rounded-xl transition-all group text-left"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                                        <FolderOpen size={20} />
                                    </div>
                                    <div>
                                        <h5 className="text-sm font-medium text-gray-200">Open App Data</h5>
                                        <p className="text-xs text-gray-500">View logs and config files.</p>
                                    </div>
                                </div>
                                <ExternalLink size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                            </button>

                            <button
                                onClick={handleClearData}
                                className="flex items-center justify-between p-4 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all group text-left"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-red-500/10 text-red-400 rounded-lg group-hover:bg-red-500/20 transition-colors">
                                        <Trash2 size={20} />
                                    </div>
                                    <div>
                                        <h5 className="text-sm font-medium text-gray-200">Factory Reset</h5>
                                        <p className="text-xs text-gray-500">Clear all data and restart.</p>
                                    </div>
                                </div>
                                <AlertTriangle size={16} className="text-red-500/50 group-hover:text-red-400 transition-colors" />
                            </button>
                        </div>
                    </SettingGroup>
                </div>
            </div>
        </div>
    );
};

export default SecurityTab;
