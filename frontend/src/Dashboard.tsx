import React, { useState, useRef } from 'react';
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
    const [whatsNew, setWhatsNew] = useState({ open: false, content: "", version: "" });
    const [confirmationState, setConfirmationState] = useState<{
        isOpen: boolean; title: string; message: string; onConfirm: () => void; confirmText?: string; confirmStyle?: 'danger' | 'primary' | 'warning';
    }>({ isOpen: false, title: "", message: "", onConfirm: () => { } });

    // -- Data / Hooks --
    const {
        loading, isCancelling, packages
    } = usePackageContext();
    const {
        activeLibraryPath
    } = useLibraryContext();
    const {
        itemsPerPage, setItemsPerPage, sortMode,
        filteredPkgs, setSearchQuery, setTagSearchQuery, setSelectedTags, setSelectedType, setSelectedCreator, setCurrentPage, currentPage, setCurrentFilter
    } = useFilterContext();
    const {
        clearSelection, contextMenu, setContextMenu, selectedIds
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
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [highlightedPackageId, setHighlightedPackageId] = useState<string>();

    const handleLocatePackage = (targetPkg: VarPackage) => {
        // 1. Check if visible in current filter
        const isVisible = filteredPkgs.some(p => p.filePath === targetPkg.filePath);

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
                switch (sortMode) {
                    case 'name-asc': return (a.fileName || "").localeCompare(b.fileName || "");
                    case 'name-desc': return (b.fileName || "").localeCompare(a.fileName || "");
                    case 'size-asc': return a.size - b.size;
                    case 'size-desc': return b.size - a.size;
                    // @ts-ignore
                    case 'date-newest': return new Date(b.creationDate || 0).getTime() - new Date(a.creationDate || 0).getTime();
                    // @ts-ignore
                    case 'date-oldest': return new Date(a.creationDate || 0).getTime() - new Date(b.creationDate || 0).getTime();
                    default: return 0;
                }
            });

            const index = allPkgs.findIndex(p => p.filePath === targetPkg.filePath);
            if (index !== -1) {
                const targetPage = Math.ceil((index + 1) / itemsPerPage);
                setCurrentPage(targetPage);
            } else {
                setCurrentPage(1); // Should not happen if package exists
            }
        } else {
            // 3. If Visible (in filtered list), check Pagination
            const index = filteredPkgs.findIndex(p => p.filePath === targetPkg.filePath);
            if (index !== -1) {
                const targetPage = Math.ceil((index + 1) / itemsPerPage);
                if (targetPage !== currentPage) {
                    setCurrentPage(targetPage);
                }
            }
        }

        // 4. Highlight & Scroll
        const id = targetPkg.filePath;
        setHighlightedPackageId(id);

        // Auto-clear highlight after 3 seconds (animation duration)
        // Clear any existing timeout if we could (simplified here)
        setTimeout(() => {
            setHighlightedPackageId(undefined);
        }, 3000);

        // Timeout to allow render then Scroll
        setTimeout(() => {
            // Note: CardGrid uses id={`pkg-${pkg.filePath}`}
            const el = document.getElementById(`pkg-${id}`);
            if (el && scrollContainerRef.current) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // We rely on React state + CSS animation for the visual effect now.
            } else {
                console.warn("Could not scroll to package", id);
            }
        }, 100);
    };

    // -- Keybinds --
    useKeybindSubscription('toggle_sidebar', () => setIsSidebarOpen(prev => !prev), [setIsSidebarOpen]);
    useKeybindSubscription('toggle_settings', () => setIsSettingsOpen(prev => !prev), [setIsSettingsOpen]);

    // -- Render --
    return (
        <div className="flex flex-col h-screen bg-gray-900 text-gray-100 overflow-hidden font-sans selection:bg-blue-500/30"
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
                        highlightedPackageId={highlightedPackageId}
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
                updateInfo={null} isUpdating={false} handleUpdate={() => { }}
                whatsNew={whatsNew} setWhatsNew={setWhatsNew}
            />

            <PackageActionModals
                isUploadModalOpen={isUploadModalOpen}
                setIsUploadModalOpen={setIsUploadModalOpen}
                uploadQueue={uploadQueue}
                setUploadQueue={setUploadQueue}
                onUploadSuccess={() => { clearSelection(); /* Refresh? Context does it? */ }}
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
