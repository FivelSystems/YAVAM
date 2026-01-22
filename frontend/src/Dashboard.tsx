import React, { useState, useRef, useEffect } from 'react';
import TitleBar from './components/layout/TitleBar';
import Sidebar from './features/library/Sidebar';
import { SidebarContainer } from './features/layout/SidebarContainer';
import { FilterToolbar } from './features/layout/FilterToolbar';
import { PackageLayout } from './features/layout/PackageLayout';
import { SystemModals } from './features/system/SystemModals';
import { PackageActionModals } from './features/packages/PackageActionModals';
import { GlobalDialogs } from './components/common/GlobalDialogs';
import { ToastContainer } from './features/layout/ToastContainer';
import DragDropOverlay from './features/upload/DragDropOverlay';
import ContextMenu from './components/ui/ContextMenu';
import { useActionContext } from './context/ActionContext';
import { useToasts } from './context/ToastContext';

// Contexts
import { useKeybindSubscription } from './context/KeybindContext';
import { useLibraryContext } from './context/LibraryContext';
import { usePackageContext } from './context/PackageContext';
import { useFilterContext } from './context/FilterContext';
import { ScanOverlay } from './features/layout/ScanOverlay';
import { useSelectionContext } from './context/SelectionContext';
import { VarPackage } from './types';
import { useDragDrop } from './hooks/useDragDrop';
import { usePrivacySettings } from './hooks/usePrivacySettings';
import { useLayoutSettings } from './hooks/useLayoutSettings';

const DashboardContent = () => {
    // -- UI State (View & Settings) --
    // These remain in Dashboard as they are purely presentational preferences or top-level UI toggles.
    // -- UI State (View & Settings) --
    // These remain in Dashboard as they are purely presentational preferences or top-level UI toggles.
    const {
        viewMode, setViewMode,
        gridSize, setGridSize,
        isSidebarOpen, setIsSidebarOpen,
        isTagsVisible, setIsTagsVisible
    } = useLayoutSettings();

    // Privacy Settings
    const {
        censorThumbnails, setCensorThumbnails,
        blurAmount, setBlurAmount,
        hidePackageNames, setHidePackageNames,
        hideCreatorNames, setHideCreatorNames
    } = usePrivacySettings();

    // -- Modal State --
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [whatsNew, setWhatsNew] = useState({ open: false, content: "", version: "" });
    const [confirmationState, setConfirmationState] = useState<{
        isOpen: boolean; title: string; message: string; onConfirm: () => void; confirmText?: string; confirmStyle?: 'danger' | 'primary' | 'warning';
    }>({ isOpen: false, title: "", message: "", onConfirm: () => { } });

    // -- Data / Hooks --
    const { addToast } = useToasts();

    // -- Startup Checks (Updates & What's New) --
    useEffect(() => {
        const checkStartup = async () => {
            if (typeof window === 'undefined' || !('go' in window)) return; // Web mode skip

            try {
                // 1. Check for "What's New" (Version Change)
                // @ts-ignore
                const currentVersion = await window.go.main.App.GetAppVersion();
                const lastSeen = localStorage.getItem('last_seen_version');

                if (currentVersion !== lastSeen) {
                    // @ts-ignore
                    const changelog = await window.go.main.App.GetChangelog();
                    setWhatsNew({ open: true, content: changelog, version: currentVersion });
                    // Note: We only update localStorage when they close the modal (in SystemModals)
                }

                // 2. Check for Updates (Remote)
                // @ts-ignore
                const update = await window.go.main.App.CheckForUpdates();
                if (update) {
                    setUpdateInfo(update);
                    setShowUpdateModal(true);
                }
            } catch (err) {
                console.error("Startup check failed:", err);
            }
        };

        checkStartup();
    }, []);

    const handleUpdate = async () => {
        if (!updateInfo) return;
        setIsUpdating(true);
        try {
            // @ts-ignore
            await window.go.main.App.ApplyUpdate(updateInfo.downloadUrl);
            addToast("Update installed! Restarting...", "success");
            // Give UI a moment to show toast then restart
            setTimeout(() => {
                // @ts-ignore
                window.go.main.App.RestartApp();
            }, 1000);
        } catch (err) {
            console.error("Update failed:", err);
            addToast("Update failed: " + err, "error");
            setIsUpdating(false);
            setShowUpdateModal(false);
        }
    };

    const {
        loading, isCancelling, packages, scanPackages
    } = usePackageContext();
    const {
        activeLibraryPath
    } = useLibraryContext();
    const {
        itemsPerPage, setItemsPerPage, sortMode,
        filteredPkgs, setSearchQuery, setTagSearchQuery, setSelectedTags, setSelectedType, setSelectedCreator, setCurrentPage, currentPage, setCurrentFilter
    } = useFilterContext();
    const {
        clearSelection, contextMenu, setContextMenu, selectedIds, selectedPackage, setSelectedPackage, setIsDetailsPanelOpen
    } = useSelectionContext();

    const {
        togglePackage, handleOpenFolder, setInstallModal, handleCopyPath,
        handleCopyFile, handleCutFile, handleDeleteClick, handleInstantMerge, handleSingleResolve
    } = useActionContext();

    // Drag & Drop (Upload)
    const {
        isUploadModalOpen, setIsUploadModalOpen,
        uploadQueue, setUploadQueue, handleDrop, handleWebDrop
    } = useDragDrop(activeLibraryPath);

    // -- Logic: Scroll to Package --
    // -- Logic: Scroll to Package --
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [highlightedRequest, setHighlightedRequest] = useState<{ id: string; ts: number } | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleLocatePackage = (targetPkg: VarPackage) => {
        let finalPkg = targetPkg;

        // 1. Check if visible in current filter
        let isVisible = filteredPkgs.some(p => p.filePath === finalPkg.filePath);

        // 1b. Fallback: ID Match (Cross-Library Support)
        // If strictly path-matching fails, checking if we have the "same" package (by ID) in the current library.
        if (!isVisible) {
            const targetId = `${targetPkg.meta.creator}.${targetPkg.meta.packageName}.${targetPkg.meta.version}`;
            // Find equivalent in the FULL loaded list
            const equivalent = packages.find(p => `${p.meta.creator}.${p.meta.packageName}.${p.meta.version}` === targetId);

            if (equivalent) {
                // Switch target to the local instance
                finalPkg = equivalent;

                // Update selection to match local instance (Fixes "Ghost Selection" from other lib)
                if (selectedPackage?.filePath !== equivalent.filePath) {
                    setSelectedPackage(equivalent);
                }
                // Re-check visibility
                isVisible = filteredPkgs.some(p => p.filePath === finalPkg.filePath);
            }
        }

        if (!isVisible) {
            // 2. if not visible, CLEAR ALL FILTERS (Reset to "All Packages" view)
            setIsTagsVisible(false);
            setSearchQuery("");
            setTagSearchQuery("");
            setSelectedTags([]);
            setSelectedType(null);
            setSelectedCreator(null);
            setCurrentFilter('all');

            // 3. Find where the package WOULD be in the full list (sorted)
            // We replicate the sort logic here to find the index immediately
            const allPkgs = [...packages];
            allPkgs.sort((a, b) => {
                let cmp = 0;
                switch (sortMode) {
                    case 'name-asc': cmp = (a.fileName || "").localeCompare(b.fileName || ""); break;
                    case 'name-desc': cmp = (b.fileName || "").localeCompare(a.fileName || ""); break;
                    case 'size-asc': cmp = a.size - b.size; break;
                    case 'size-desc': cmp = b.size - a.size; break;
                    // @ts-ignore
                    case 'date-newest': cmp = new Date(b.creationDate || 0).getTime() - new Date(a.creationDate || 0).getTime(); break;
                    // @ts-ignore
                    case 'date-oldest': cmp = new Date(a.creationDate || 0).getTime() - new Date(b.creationDate || 0).getTime(); break;
                    default: cmp = 0;
                }
                if (cmp === 0) return a.filePath.localeCompare(b.filePath);
                return cmp;
            });

            const index = allPkgs.findIndex(p => p.filePath === finalPkg.filePath);
            if (index !== -1) {
                const targetPage = Math.ceil((index + 1) / itemsPerPage);
                setCurrentPage(targetPage);
            } else {
                setCurrentPage(1); // Should not happen if package exists
            }
        } else {
            // 3. If Visible (in filtered list), check Pagination
            const index = filteredPkgs.findIndex(p => p.filePath === finalPkg.filePath);
            if (index !== -1) {
                const targetPage = Math.ceil((index + 1) / itemsPerPage);
                if (targetPage !== currentPage) {
                    setCurrentPage(targetPage);
                }
            }
        }

        // 4. Highlight & Scroll
        const id = finalPkg.filePath;

        // INTERRUPT LOGIC: Clear existing timer to prevent premature "off" switch
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }

        // Set new request with current timestamp (Forces animation restart via key change)
        setHighlightedRequest({ id, ts: Date.now() });

        // Auto-clear highlight after 3 seconds (animation duration)
        timerRef.current = setTimeout(() => {
            setHighlightedRequest(null);
            timerRef.current = null;
        }, 3000);
    };

    // -- Keybinds --
    useKeybindSubscription('toggle_sidebar', () => setIsSidebarOpen(prev => !prev), [setIsSidebarOpen]);
    useKeybindSubscription('toggle_settings', () => setIsSettingsOpen(prev => !prev), [setIsSettingsOpen]);
    useKeybindSubscription('random_pkg', () => {
        if (filteredPkgs.length === 0) return;
        const randomIndex = Math.floor(Math.random() * filteredPkgs.length);
        const randomPkg = filteredPkgs[randomIndex];
        setSelectedPackage(randomPkg);
        setIsDetailsPanelOpen(true);
    }, [filteredPkgs, setSelectedPackage, setIsDetailsPanelOpen]);

    // -- Render --
    return (
        <div className="flex flex-col h-screen supports-[height:100dvh]:h-[100dvh] bg-gray-900 text-gray-100 overflow-hidden font-sans selection:bg-blue-500/30"
            onDragOver={(e) => { e.preventDefault(); consumeDrag(e); }}
            onDragLeave={(e) => consumeDragLeave(e)}
            onDrop={async (e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) handleWebDrop(e.dataTransfer.files); }}
        >
            <TitleBar />

            <div className="flex-1 flex overflow-hidden relative">
                {/* Drag Overlay */}
                <DragDropOverlay onDrop={handleDrop} />

                {/* Sidebar */}
                <SidebarContainer isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen}>
                    <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />
                </SidebarContainer>

                <div className="flex-1 flex flex-col min-w-0 bg-gray-900 relative transition-all duration-300">
                    <FilterToolbar
                        isSidebarOpen={isSidebarOpen}
                        setIsSidebarOpen={setIsSidebarOpen}
                        viewMode={viewMode}
                        setViewMode={setViewMode}
                        isTagsVisible={isTagsVisible}
                        setIsTagsVisible={setIsTagsVisible}
                    />

                    <PackageLayout
                        viewMode={viewMode}
                        gridSize={gridSize}
                        highlightedRequest={highlightedRequest}
                        onLocatePackage={handleLocatePackage}
                        scrollContainerRef={scrollContainerRef}
                        censorThumbnails={censorThumbnails}
                        blurAmount={blurAmount}
                        hidePackageNames={hidePackageNames}
                        hideCreatorNames={hideCreatorNames}
                    />

                </div>
            </div>

            {/* -- Modals -- */}

            {contextMenu.open && contextMenu.pkg && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    pkg={contextMenu.pkg}
                    selectedCount={selectedIds.has(contextMenu.pkg.filePath) ? selectedIds.size : 1}
                    onClose={() => setContextMenu({ ...contextMenu, open: false })}
                    onToggle={(p) => togglePackage(p)}
                    onOpenFolder={handleOpenFolder}
                    onDownload={(p) => {
                        let targets = [p];
                        if (selectedIds.has(p.filePath) && selectedIds.size > 1) {
                            targets = packages.filter(pkg => selectedIds.has(pkg.filePath));
                        }
                        setInstallModal({ open: true, pkgs: targets });
                    }}
                    onCopyPath={handleCopyPath}
                    onCopyFile={handleCopyFile}
                    onCutFile={handleCutFile}
                    onDelete={handleDeleteClick}
                    onMerge={(p) => handleInstantMerge(p, false)}
                    onMergeInPlace={(p) => handleInstantMerge(p, true)}
                    onResolve={handleSingleResolve}
                />
            )}

            <SystemModals
                isSettingsOpen={isSettingsOpen}
                setIsSettingsOpen={setIsSettingsOpen}
                // App Settings
                isGuest={false} // AuthContext needed? For now defaulting.
                isWeb={typeof window !== 'undefined' && !('go' in window)}
                gridSize={gridSize}
                setGridSize={setGridSize}
                itemsPerPage={itemsPerPage}
                setItemsPerPage={setItemsPerPage}
                minimizeOnClose={false} handleSetMinimize={() => { }}
                maxToasts={5} setMaxToasts={() => { }}
                handleClearData={() => setConfirmationState({
                    isOpen: true,
                    title: "Clear All Data",
                    message: "Are you sure? This will reset all settings and caches.",
                    onConfirm: () => { /* Logic */ setConfirmationState(prev => ({ ...prev, isOpen: false })) },
                    confirmStyle: 'danger'
                })}
                // Privacy
                censorThumbnails={censorThumbnails} setCensorThumbnails={setCensorThumbnails}
                blurAmount={blurAmount} setBlurAmount={setBlurAmount}
                hidePackageNames={hidePackageNames} setHidePackageNames={setHidePackageNames}
                hideCreatorNames={hideCreatorNames} setHideCreatorNames={setHideCreatorNames}
                // Update
                showUpdateModal={showUpdateModal} setShowUpdateModal={setShowUpdateModal}
                updateInfo={updateInfo} isUpdating={isUpdating} handleUpdate={handleUpdate}
                whatsNew={whatsNew} setWhatsNew={setWhatsNew}
            />

            <PackageActionModals
                isUploadModalOpen={isUploadModalOpen}
                setIsUploadModalOpen={setIsUploadModalOpen}
                uploadQueue={uploadQueue}
                setUploadQueue={setUploadQueue}
                onUploadSuccess={() => { clearSelection(); scanPackages(); }}
            />

            <GlobalDialogs
                confirmationState={confirmationState}
                setConfirmationState={setConfirmationState}
            />

            {/* Non-Blocking Scan Overlay */}
            {/* Scan Blocking Overlay */}
            {loading && (
                <ScanOverlay
                    isCancelling={isCancelling}
                />
            )}

            <ToastContainer />
        </div>
    );
};

// -- Utilities for Drag --
const consumeDrag = (_e: React.DragEvent) => {
    // If we want to detect drag ENTERING window...
    // The useDragDrop hook usually attaches listeners to window.
    // Dashboard just renders the Overlay based on `isDragActive`.
};
const consumeDragLeave = (_e: React.DragEvent) => { };


// -- Root Component --
import { AppProviders } from './context/AppProviders';

export default function Dashboard() {
    return (
        <AppProviders>
            <DashboardContent />
        </AppProviders>
    );
}
