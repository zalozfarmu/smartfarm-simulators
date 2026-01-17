/**
 * Application Initialization
 */

/**
 * Application Initialization
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('📹 Camera Simulator starting...');

    // Initialize image capture
    imageCapture.init();

    // Initialize server selector
    if (typeof ServerSelector !== 'undefined') {
        new ServerSelector();
    }

    logger.log('✅ Camera Simulator initialized', 'success');
    logger.log('ℹ️ Připojte se k MQTT brokeru pro začátek', 'info');

    // Handle modal clicks
    document.getElementById('imageModal').addEventListener('click', (e) => {
        if (e.target.id === 'imageModal') {
            camera.closeModal();
        }
    });

    // Handle quality range display
    document.getElementById('qualityRange').addEventListener('input', (e) => {
        document.getElementById('qualityDisplay').textContent = e.target.value;
    });

    // Toggle gateway field based on communication mode
    const modeSelect = document.getElementById('communicationMode');
    const gatewayGroup = document.getElementById('gatewayGroup');
    const gatewayStatusRow = document.getElementById('gatewayStatusRow');
    const pairingButtons = document.getElementById('pairingButtons');
    if (modeSelect && gatewayGroup) {
        const toggleGateway = () => {
            gatewayGroup.style.display = modeSelect.value === 'gateway' ? 'block' : 'none';
            if (gatewayStatusRow) {
                gatewayStatusRow.style.display = modeSelect.value === 'gateway' ? 'block' : 'none';
            }
            if (pairingButtons) {
                pairingButtons.style.display = modeSelect.value === 'gateway' ? 'flex' : 'none';
            }
        };
        modeSelect.addEventListener('change', toggleGateway);
        toggleGateway();
    }

    // Gateway creds modal
    const openGatewayBtn = document.getElementById('openGatewayCredsBtn');
    const gatewayModal = document.getElementById('gatewayCredsModal');
    const gatewayClose = document.getElementById('gatewayCredsClose');
    const gatewayCancel = document.getElementById('gatewayCredsCancel');
    const gatewayApply = document.getElementById('gatewayCredsApply');
    if (openGatewayBtn && gatewayModal) {
        const showModal = () => gatewayModal.style.display = 'block';
        const hideModal = () => gatewayModal.style.display = 'none';

        openGatewayBtn.addEventListener('click', showModal);
        gatewayClose?.addEventListener('click', hideModal);
        gatewayCancel?.addEventListener('click', hideModal);

        gatewayApply?.addEventListener('click', () => {
            const gwUser = document.getElementById('gwUsername')?.value.trim();
            const gwPass = document.getElementById('gwPassword')?.value.trim();
            if (!gwUser || !gwPass) {
                alert('Zadejte username i password gateway.');
                return;
            }
            // Přenést do kamery
            const userInput = document.getElementById('username');
            const passInput = document.getElementById('password');
            if (userInput) userInput.value = gwUser;
            if (passInput) passInput.value = gwPass;

            // Pokud username vypadá jako device_{id}, nastav gatewayId
            const match = gwUser.match(/^device_(.+)$/);
            if (match) {
                const gwIdInput = document.getElementById('gatewayId');
                if (gwIdInput) gwIdInput.value = match[1];
            }

            // Přepnout režim na gateway
            if (modeSelect) {
                modeSelect.value = 'gateway';
                const event = new Event('change');
                modeSelect.dispatchEvent(event);
            }

            hideModal();
            logger.log('🔑 Credentials z gateway přeneseny do kamery', 'success');
        });
    }
});
