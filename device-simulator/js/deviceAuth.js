/**
 * Device Authentication
 * Simulace autentizace zařízení přes /api/mqtt/devices/auth
 */

const DeviceAuth = {
    /**
     * Autentizuje zařízení a získá MQTT credentials
     * @param {string} deviceId - Device ID
     * @param {string} password - Factory password (z MqttDevice)
     * @returns {Promise<Object>} MQTT credentials
     */
    async authenticate(deviceId, password) {
        const config = ServerConfig.getConfig();
        const apiUrl = config.api?.url || 'http://localhost:3000';
        
        logger.log(`🔐 Autentizuji zařízení ${deviceId}...`, 'info');
        
        try {
            const response = await fetch(`${apiUrl}/api/mqtt/devices/auth`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    deviceId,
                    password
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.mqtt) {
                logger.log('✅ Autentizace úspěšná! MQTT credentials získány', 'success');
                return data;
            } else {
                throw new Error('Neplatná odpověď ze serveru');
            }
        } catch (error) {
            console.error('Chyba při autentizaci:', error);
            logger.log(`❌ Chyba při autentizaci: ${error.message}`, 'error');
            throw error;
        }
    },
    
    /**
     * Zobrazí modal pro autentizaci (první spuštění)
     */
    showAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.classList.add('active');
        }
    },
    
    /**
     * Skryje modal pro autentizaci
     */
    hideAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }
};

