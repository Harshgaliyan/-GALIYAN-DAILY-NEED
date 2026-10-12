document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('contactModal');
    const openButton = document.getElementById('openContactModal');
    const closeButton = document.getElementById('closeContactModal');
    const form = document.getElementById('contactForm');
    const submitButton = document.getElementById('contactSubmit');
    const status = document.getElementById('contactFormStatus');
    const firstField = document.getElementById('contactName');

    if (!modal || !openButton || !closeButton || !form || !submitButton || !status || !firstField) return;

    const closeModal = () => {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        openButton.focus();
    };

    openButton.addEventListener('click', () => {
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        firstField.focus();
    });

    closeButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        status.textContent = '';
        status.dataset.state = '';

        const formData = new FormData(form);
        if (formData.get('website')) {
            status.textContent = 'Unable to send this message.';
            status.dataset.state = 'error';
            return;
        }

        const message = [
            'Hello GALIYAN DAILY NEED, I have a question.',
            '',
            `Name: ${formData.get('name')}`,
            `Email: ${formData.get('email') || 'Not provided'}`,
            `Phone: ${formData.get('phone') || 'Not provided'}`,
            '',
            'Message:',
            formData.get('message')
        ].join('\n');

        status.textContent = 'WhatsApp is opening. Review your message and tap Send to contact the store.';
        status.dataset.state = 'pending';
        window.location.href = `https://wa.me/919897312151?text=${encodeURIComponent(message)}`;
    });
});
