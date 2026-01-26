import React from 'react';
import ConfirmationModal from './ConfirmationModal';
import { useActionContext } from '../../context/ActionContext';

interface GlobalDialogsProps {
    // Generic Confirmation still passed from parent (e.g. System Settings Clear Data)
    confirmationState?: {
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        confirmText?: string;
        confirmStyle?: 'danger' | 'primary' | 'warning' | 'purple';
    };
    setConfirmationState?: (val: any) => void;
}

export const GlobalDialogs: React.FC<GlobalDialogsProps> = ({
    confirmationState, setConfirmationState
}) => {
    const {
        collisionData, setCollisionData, handleConfirmCollision
    } = useActionContext();

    return (
        <>
            {/* Generic Confirmation */}
            {confirmationState && setConfirmationState && (
                <ConfirmationModal
                    isOpen={confirmationState.isOpen}
                    onClose={() => setConfirmationState({ ...confirmationState, isOpen: false })}
                    onConfirm={confirmationState.onConfirm}
                    title={confirmationState.title}
                    message={confirmationState.message}
                    confirmText={confirmationState.confirmText || "Confirm"}
                    confirmStyle={confirmationState.confirmStyle || "primary"}
                />
            )}



            {/* Collision Confirmation */}
            <ConfirmationModal
                isOpen={collisionData.open}
                onClose={() => setCollisionData({ open: false, pkg: null })}
                onConfirm={handleConfirmCollision}
                title="Package Collision"
                message={`A package with the same name already exists in the destination. Since versions match, would you like to merge/overwrite it?`}
                confirmText="Merge & Overwrite"
                confirmStyle="primary"
            />
        </>
    );
};
