(() => {
    const STORAGE_KEY = 'galiyan-delivery-details';
    const INDIAN_STATES = [
        'Andaman and Nicobar Islands',
        'Andhra Pradesh',
        'Arunachal Pradesh',
        'Assam',
        'Bihar',
        'Chandigarh',
        'Chhattisgarh',
        'Dadra and Nagar Haveli and Daman and Diu',
        'Delhi',
        'Goa',
        'Gujarat',
        'Haryana',
        'Himachal Pradesh',
        'Jammu and Kashmir',
        'Jharkhand',
        'Karnataka',
        'Kerala',
        'Ladakh',
        'Lakshadweep',
        'Madhya Pradesh',
        'Maharashtra',
        'Manipur',
        'Meghalaya',
        'Mizoram',
        'Nagaland',
        'Odisha',
        'Puducherry',
        'Punjab',
        'Rajasthan',
        'Sikkim',
        'Tamil Nadu',
        'Telangana',
        'Tripura',
        'Uttar Pradesh',
        'Uttarakhand',
        'West Bengal'
    ];

    const getDetails = () => {
        try {
            const details = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (!details || !/^[1-9]\d{5}$/.test(details.pincode || '') || !details.state || !details.city) {
                return null;
            }
            return details;
        } catch (error) {
            console.error('Could not read saved delivery details.', error);
            return null;
        }
    };

    const saveDetails = (details) => {
        if (!/^[1-9]\d{5}$/.test(details.pincode)) {
            throw new Error('Enter a valid six-digit Indian PIN code.');
        }
        if (!INDIAN_STATES.includes(details.state)) {
            throw new Error('Select a state or union territory in India.');
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
    };

    const updateLocationLabels = () => {
        const details = getDetails();
        document.querySelectorAll('[data-delivery-location]').forEach((label) => {
            label.textContent = details
                ? `${details.city}, ${details.state} ${details.pincode}`
                : 'Set delivery location';
        });
    };

    document.querySelectorAll('select[data-indian-state]').forEach((select) => {
        INDIAN_STATES.forEach((state) => {
            const option = document.createElement('option');
            option.value = state;
            option.textContent = state;
            select.append(option);
        });
    });

    const savedDetails = getDetails();
    if (savedDetails) {
        document.querySelectorAll('[data-delivery-form]').forEach((form) => {
            for (const [name, value] of Object.entries(savedDetails)) {
                const field = form.elements.namedItem(name);
                if (field) field.value = value;
            }
        });
    }
    updateLocationLabels();

    window.GaliyanDelivery = Object.freeze({
        getDetails,
        saveDetails,
        updateLocationLabels
    });
})();
