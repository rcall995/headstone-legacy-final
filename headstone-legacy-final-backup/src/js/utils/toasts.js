console.log("Checkpoint 3: toasts.js is starting to load.");

export function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) return;

    let iconClass = 'fa-info-circle';
    let headerText = 'Notice';
    let colorClass = 'text-bg-light';

    if (type === 'success') {
        iconClass = 'fa-check-circle';
        headerText = 'Success';
        colorClass = 'text-bg-success';
    } else if (type === 'error') {
        iconClass = 'fa-exclamation-triangle';
        headerText = 'Error';
        colorClass = 'text-bg-danger';
    }

    const toastId = `toast-${Date.now()}`;

    const toastHTML = `
        <div id="${toastId}" class="toast ${colorClass}" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header">
                <i class="fas ${iconClass} rounded me-2"></i>
                <strong class="me-auto">${headerText}</strong>
                <small>Just now</small>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    
    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl);
    
    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });

    toast.show();
}