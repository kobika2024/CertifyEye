// Initialize tooltips
document.addEventListener('DOMContentLoaded', function() {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(function(tooltipTriggerEl) {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // Handle confirmation dialogs
  const confirmForms = document.querySelectorAll('form[data-confirm]');
  confirmForms.forEach(form => {
    form.addEventListener('submit', function(e) {
      const message = this.getAttribute('data-confirm') || 'Are you sure you want to perform this action?';
      if (!confirm(message)) {
        e.preventDefault();
        return false;
      }
    });
  });

  // Handle auto-refresh for certificate listings if enabled
  const autoRefreshElement = document.getElementById('auto-refresh');
  if (autoRefreshElement && autoRefreshElement.checked) {
    const refreshInterval = parseInt(autoRefreshElement.getAttribute('data-interval')) || 60;
    setInterval(() => {
      window.location.reload();
    }, refreshInterval * 1000);
  }

  // Format dates
  const dateElements = document.querySelectorAll('.format-date');
  dateElements.forEach(el => {
    const date = new Date(el.textContent);
    if (!isNaN(date)) {
      el.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
  });

  // Handle certificate status highlighting
  const daysRemainingElements = document.querySelectorAll('.days-remaining');
  daysRemainingElements.forEach(el => {
    const days = parseInt(el.textContent);
    if (!isNaN(days)) {
      if (days < 0) {
        el.classList.add('days-remaining-danger');
      } else if (days < 30) {
        el.classList.add('days-remaining-warning');
      }
    }
  });
});
