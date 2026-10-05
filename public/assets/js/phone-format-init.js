// Phone input formatting initialization
// Copied from mean-idaho-master/public/assets/js/phone-format-init.js

document.addEventListener('DOMContentLoaded', function() {
    const phoneInputs = document.querySelectorAll('.phoneInput');
    
    phoneInputs.forEach(function(input) {
        if (typeof Cleave !== 'undefined') {
            new Cleave(input, {
                phone: true,
                phoneRegionCode: 'us',
                delimiter: '-',
                blocks: [3, 3, 4]
            });
        }
    });
});
