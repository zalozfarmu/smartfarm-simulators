/**
 * Credentials Storage (Simulace EEPROM/Flash)
 * Ukládá MQTT credentials do localStorage pro více zařízení
 */

const CredentialsStorage = {
    STORAGE_KEY: 'esp32_mqtt_credentials',
    STORAGE_KEY_MULTI: 'esp32_mqtt_credentials_multi', // Nový klíč pro více zařízení
    
    /**
     * Uloží MQTT credentials do localStorage (simulace EEPROM/Flash)
     * @param {string} deviceId - Device ID
     * @param {Object} credentials - MQTT credentials
     */
    save(deviceId, credentials) {
        // Načti všechny uložené credentials
        const allCredentials = this.loadAll();
        
        // Aktualizuj nebo přidej credentials pro toto zařízení
        allCredentials[deviceId] = {
            deviceId,
            mqtt: {
                broker: credentials.broker,
                brokerWs: credentials.brokerWs,
                username: credentials.username,
                password: credentials.password,
                topics: credentials.topics
            },
            savedAt: new Date().toISOString()
        };
        
        // Ulož zpět do localStorage
        localStorage.setItem(this.STORAGE_KEY_MULTI, JSON.stringify(allCredentials));
        
        // Pro zpětnou kompatibilitu: ulož také jako aktuální zařízení
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allCredentials[deviceId]));
        
        console.log(`💾 Credentials uloženy pro zařízení ${deviceId} (EEPROM/Flash simulace)`);
        logger.log(`💾 MQTT credentials uloženy pro zařízení ${deviceId}`, 'success');
    },
    
    /**
     * Načte MQTT credentials pro konkrétní zařízení
     * @param {string} deviceId - Device ID (volitelné, pokud není zadáno, vrátí aktuální)
     */
    load(deviceId = null) {
        if (deviceId) {
            // Načti credentials pro konkrétní zařízení
            const allCredentials = this.loadAll();
            return allCredentials[deviceId] || null;
        } else {
            // Pro zpětnou kompatibilitu: načti aktuální zařízení
            const data = localStorage.getItem(this.STORAGE_KEY);
            if (!data) {
                return null;
            }
            
            try {
                return JSON.parse(data);
            } catch (error) {
                console.error('Chyba při načítání credentials:', error);
                return null;
            }
        }
    },
    
    /**
     * Načte všechny uložené credentials pro všechna zařízení
     * @returns {Object} Objekt s deviceId jako klíče
     */
    loadAll() {
        const data = localStorage.getItem(this.STORAGE_KEY_MULTI);
        if (!data) {
            // Migrace: pokud existuje starý formát, načti ho
            const oldData = localStorage.getItem(this.STORAGE_KEY);
            if (oldData) {
                try {
                    const parsed = JSON.parse(oldData);
                    if (parsed.deviceId) {
                        return { [parsed.deviceId]: parsed };
                    }
                } catch (e) {
                    // Ignoruj chyby při migraci
                }
            }
            return {};
        }
        
        try {
            return JSON.parse(data);
        } catch (error) {
            console.error('Chyba při načítání všech credentials:', error);
            return {};
        }
    },
    
    /**
     * Zkontroluje, zda jsou credentials uložené pro dané zařízení
     * @param {string} deviceId - Device ID (volitelné)
     */
    hasCredentials(deviceId = null) {
        if (deviceId) {
            return this.load(deviceId) !== null;
        }
        return this.load() !== null;
    },
    
    /**
     * Vymaže uložené credentials pro konkrétní zařízení nebo všechna
     * @param {string} deviceId - Device ID (volitelné, pokud není zadáno, vymaže všechna)
     */
    clear(deviceId = null) {
        if (deviceId) {
            // Vymaž credentials pro konkrétní zařízení
            const allCredentials = this.loadAll();
            delete allCredentials[deviceId];
            localStorage.setItem(this.STORAGE_KEY_MULTI, JSON.stringify(allCredentials));
            console.log(`🗑️ Credentials vymazány pro zařízení ${deviceId}`);
            logger.log(`🗑️ MQTT credentials vymazány pro zařízení ${deviceId}`, 'info');
        } else {
            // Vymaž všechna credentials
            localStorage.removeItem(this.STORAGE_KEY);
            localStorage.removeItem(this.STORAGE_KEY_MULTI);
            console.log('🗑️ Všechna credentials vymazána z localStorage');
            logger.log('🗑️ Všechna MQTT credentials vymazána', 'info');
        }
    },
    
    /**
     * Vrátí Device ID z uložených credentials
     * @param {string} deviceId - Device ID (volitelné)
     */
    getDeviceId(deviceId = null) {
        const data = this.load(deviceId);
        return data ? data.deviceId : null;
    },
    
    /**
     * Vrátí seznam všech deviceId, pro které jsou uložené credentials
     * @returns {string[]} Pole deviceId
     */
    getAllDeviceIds() {
        const allCredentials = this.loadAll();
        return Object.keys(allCredentials);
    }
};

if (typeof module !== 'undefined') {
    module.exports = CredentialsStorage;
}

