import { useState } from 'react';
import { AlertTriangle, Trash2, FolderOpen, ExternalLink, KeyRound } from 'lucide-react';

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

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <h4 className="text-lg font-medium text-white mb-1">Security & Storage</h4>
                <p className="text-sm text-gray-500 mb-4">Manage access controls and application data.</p>

                <div className="space-y-4">
                    {/* Password Change Section */}
                    <div className="bg-black/30 rounded-xl p-6 border border-gray-700/50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-gray-800 rounded-lg text-gray-400">
                                    <KeyRound size={24} />
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-white">Access Password</h4>
                                    <p className="text-xs text-gray-500">Protect unauthorized access to Settings and Library.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowPasswordUI(!showPasswordUI)}
                                className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                            >
                                {showPasswordUI ? "Cancel" : "Change Password"}
                            </button>
                        </div>

                        {showPasswordUI && (
                            <div className="mt-6 space-y-4 pt-4 border-t border-gray-800 animate-in fade-in slide-in-from-top-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-500 uppercase">New Password</label>
                                        <input
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                            placeholder="Enter new password"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-500 uppercase">Confirm Password</label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                            placeholder="Confirm new password"
                                        />
                                    </div>
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
                    </div>

                    {/* Data Management */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={() => {
                                // @ts-ignore
                                if (window.go) window.go.main.App.OpenAppDataFolder();
                            }}
                            className="flex items-center justify-between p-4 bg-gray-700/20 hover:bg-gray-700/40 border border-gray-700/50 rounded-xl transition-all group text-left"
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
                </div>
            </div>
        </div>
    );
};

export default SecurityTab;
