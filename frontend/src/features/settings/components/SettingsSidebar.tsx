import clsx from 'clsx';
import { AppWindow, Shield, Network, FolderLock, Info } from 'lucide-react';
import { SettingsTab } from '../SettingsDialog';

interface SettingsSidebarProps {
    activeTab: SettingsTab;
    setActiveTab: (tab: SettingsTab) => void;
    isGuest: boolean;
    isMobile: boolean;
}

const SettingsSidebar = ({ activeTab, setActiveTab, isGuest, isMobile }: SettingsSidebarProps) => {

    const tabs = [
        { id: 'application', label: 'Application', icon: AppWindow, admin: false },
        { id: 'privacy', label: 'Privacy', icon: Shield, admin: false },
        { id: 'network', label: 'Network', icon: Network, admin: true },
        { id: 'security', label: 'Security', icon: FolderLock, admin: true },
        { id: 'about', label: 'About', icon: Info, admin: false },
    ] as const;

    const visibleTabs = tabs.filter(t => !isGuest || !t.admin);

    if (isMobile) {
        // Mobile behavior handled by Parent or different layout?
        // Implementation plan said "Refined Mobile View" - likely an Accordion in the content area OR a top scroller.
        // For "Full Screen Overlay", a Sidebar is hidden on mobile often.
        // Let's assume on Mobile this component might render a horizontal strip or simple list?
        // For now, let's keep it strictly vertical for the Desktop Sidebar slot.
        return null;
    }

    return (
        <div className="w-64 bg-gray-800/30 border-r border-gray-700/50 p-4 space-y-1 h-full overflow-y-auto">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 px-3">Settings</h3>
            {visibleTabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as SettingsTab)}
                    className={clsx(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                        activeTab === tab.id
                            ? "bg-blue-600/10 text-blue-400 shadow-sm"
                            : "text-gray-400 hover:bg-gray-700/50 hover:text-white"
                    )}
                >
                    <tab.icon size={18} />
                    {tab.label}
                </button>
            ))}
        </div>
    );
};

export default SettingsSidebar;
