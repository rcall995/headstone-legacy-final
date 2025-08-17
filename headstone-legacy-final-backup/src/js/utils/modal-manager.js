// js/utils/modal-manager.js

/**
 * A map to store active Bootstrap modal instances.
 * This allows us to properly dispose of them later.
 */
const modalInstances = new Map();

/**
 * Shows a Bootstrap modal using the official API.
 * @param {string} modalId The ID of the modal element to show.
 */
export function showModal(modalId) {
    const modalEl = document.getElementById(modalId);
    if (!modalEl) {
        console.error(`Modal element with ID #${modalId} not found.`);
        return;
    }

    // Get or create a new Bootstrap modal instance
    let modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
    
    // Store the instance so we can dispose of it later
    modalInstances.set(modalId, modalInstance);

    // Add an event listener to clean up the instance once the modal is fully hidden
    modalEl.addEventListener('hidden.bs.modal', () => {
        const instance = modalInstances.get(modalId);
        if (instance) {
            instance.dispose();
            modalInstances.delete(modalId);
        }
    }, { once: true }); // Use { once: true } so the listener removes itself

    modalInstance.show();
}

/**
 * Hides an active Bootstrap modal.
 * @param {string} modalId The ID of the modal element to hide.
 */
export function hideModal(modalId) {
    const modalInstance = modalInstances.get(modalId);
    if (modalInstance) {
        modalInstance.hide();
    } else {
        // Fallback for cases where the modal might be open without an instance
        const modalEl = document.getElementById(modalId);
        if (modalEl) {
            const instance = bootstrap.Modal.getInstance(modalEl);
            if (instance) {
                instance.hide();
            }
        }
    }
}