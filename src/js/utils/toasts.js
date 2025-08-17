/**
 * src/js/utils/toasts.js
 * Displays a Bootstrap 5 toast notification.
 * This version correctly finds the toast container by its class name.
 * @param {string} message The message to display.
 * @param {string} type The type of toast ('success', 'error', 'info').
 */
export function showToast(message, type = 'info') {
    // FIX: Use querySelector to find the element by its class name.
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        console.error('Toast container element with class ".toast-container" was not found in your HTML!');
        return;
    }

    // Define properties for each toast type
    const settings = {
        success: { icon: 'fa-check-circle', header: 'Success', bg: 'text-bg-success' },
        error: { icon: 'fa-exclamation-triangle', header: 'Error', bg: 'text-bg-danger' },
        info: { icon: 'fa-info-circle', header: 'Notice', bg: 'text-bg-primary' }
    };

    const config = settings[type] || settings['info'];
    const toastId = `toast-${Date.now()}`;

    // Create the full HTML for the toast component
    const toastHTML = `
        <div id="${toastId}" class="toast ${config.bg}" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header">
                <i class="fas ${config.icon} rounded me-2"></i>
                <strong class="me-auto">${config.header}</strong>
                <small>Just now</small>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `;

    // Add the new toast's HTML to the container
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    
    const toastEl = document.getElementById(toastId);
    if (!toastEl) {
        console.error(`Failed to find toast element with ID: ${toastId}`);
        return;
    }

    // Create a new Bootstrap Toast instance
    const toast = new bootstrap.Toast(toastEl, {
        autohide: true,
        delay: 5000 // Toast will hide after 5 seconds
    });
    
    // Add an event listener to remove the toast from the DOM after it has finished hiding
    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });

    // Show the toast
    toast.show();
}
