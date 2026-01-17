/**
 * Server Selector Component
 * Reusable komponenta pro výběr serveru ve všech MQTT aplikacích
 */

class ServerSelector {
    constructor(options = {}) {
        this.containerId = options.containerId || 'serverSelector';
        this.onChange = options.onChange || (() => {});
        this.showCredentials = options.showCredentials !== false; // default true
        
        this.render();
        this.attachListeners();
        this.updateStatusBanner(ServerConfig.getConfig());
    }
    
    /**
     * Vykreslí server selector UI
     */
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`Container #${this.containerId} not found`);
            return;
        }
        
        const activeProfile = ServerConfig.getActiveProfile();
        const config = ServerConfig.getConfig();
        const profiles = ServerConfig.getAllProfiles();
        
        container.innerHTML = `
            <div class="server-selector-card">
                <div class="server-selector-header">
                    <span class="server-selector-icon">🌐</span>
                    <h3 class="server-selector-title">Výběr serveru</h3>
                </div>
                
                <div class="server-selector-body">
                    <div class="form-group">
                        <label>Profil serveru</label>
                        <select id="profileSelect" class="form-control">
                            ${profiles.map(p => `
                                <option value="${p.key}" ${p.key === activeProfile ? 'selected' : ''}>
                                    ${p.name}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    
                    <div class="server-info">
                        <div class="info-item">
                            <span class="info-label">MQTT Broker:</span>
                            <span class="info-value" id="mqttBrokerInfo">${config.mqtt.url}</span>
                        </div>
                        ${config.api ? `
                            <div class="info-item">
                                <span class="info-label">API:</span>
                                <span class="info-value" id="apiInfo">${config.api.url}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${this.showCredentials ? `
                        <div class="credentials-section" id="credentialsSection">
                            <h4>Přihlašovací údaje</h4>
                            <div class="form-group">
                                <label>MQTT Username</label>
                                <input type="text" id="mqttUsername" class="form-control" 
                                       value="${config.credentials.mqtt.user}" readonly>
                            </div>
                            <div class="form-group">
                                <label>MQTT Password</label>
                                <input type="password" id="mqttPassword" class="form-control" 
                                       value="${config.credentials.mqtt.password}" readonly>
                                <button type="button" class="btn-small" onclick="this.previousElementSibling.type = this.previousElementSibling.type === 'password' ? 'text' : 'password'">
                                    👁️ Zobrazit
                                </button>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div id="customConfigSection" style="display: ${activeProfile === 'custom' ? 'block' : 'none'};">
                        <h4>Vlastní nastavení</h4>
                        <div class="form-group">
                            <label>MQTT Broker URL</label>
                            <input type="text" id="customMqttUrl" class="form-control" 
                                   placeholder="ws://localhost:9001/mqtt" value="${activeProfile === 'custom' ? config.mqtt.url : ''}">
                        </div>
                        <div class="form-group">
                            <label>API URL (volitelné)</label>
                            <input type="text" id="customApiUrl" class="form-control" 
                                   placeholder="http://localhost:3000/api" value="${activeProfile === 'custom' && config.api ? config.api.url : ''}">
                        </div>
                        <div class="form-group">
                            <label>MQTT Username</label>
                            <input type="text" id="customUsername" class="form-control" 
                                   placeholder="sf_mqtt_user" value="${activeProfile === 'custom' ? config.credentials.mqtt.user : ''}">
                        </div>
                        <div class="form-group">
                            <label>MQTT Password</label>
                            <input type="password" id="customPassword" class="form-control" 
                                   placeholder="heslo" value="${activeProfile === 'custom' ? config.credentials.mqtt.password : ''}">
                        </div>
                        <button type="button" class="btn btn-primary" onclick="serverSelector.saveCustomConfig()">
                            💾 Uložit vlastní nastavení
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.updateStatusBanner(config);
    }
    
    /**
     * Připojí event listenery
     */
    attachListeners() {
        const profileSelect = document.getElementById('profileSelect');
        if (profileSelect) {
            profileSelect.addEventListener('change', (e) => {
                const newProfile = e.target.value;
                ServerConfig.setActiveProfile(newProfile);
                this.render();
                this.attachListeners();
                
                // Zavolej callback
                this.onChange(ServerConfig.getConfig());
            });
        }
    }
    
    /**
     * Uloží vlastní konfiguraci
     */
    saveCustomConfig() {
        const mqttUrl = document.getElementById('customMqttUrl').value;
        const apiUrl = document.getElementById('customApiUrl').value;
        const username = document.getElementById('customUsername').value;
        const password = document.getElementById('customPassword').value;
        
        if (!mqttUrl || !username || !password) {
            alert('⚠️ Vyplňte MQTT URL, Username a Password');
            return;
        }
        
        // Parse URL
        let host, port, protocol;
        try {
            const url = new URL(mqttUrl);
            protocol = url.protocol;
            host = url.hostname;
            port = parseInt(url.port) || 9001;
        } catch (e) {
            alert('❌ Neplatná MQTT URL');
            return;
        }
        
        const customConfig = {
            name: '⚙️ Vlastní nastavení',
            mqtt: {
                host,
                port,
                protocol,
                url: mqttUrl
            },
            api: apiUrl ? { url: apiUrl } : undefined,
            credentials: {
                mqtt: {
                    user: username,
                    password: password
                }
            }
        };
        
        ServerConfig.saveCustomConfig(customConfig);
        alert('✅ Vlastní nastavení uloženo');
        
        this.render();
        this.attachListeners();
        const updatedConfig = ServerConfig.getConfig();
        this.updateStatusBanner(updatedConfig);
        this.onChange(updatedConfig);
    }
    
    /**
     * Získá aktuální konfiguraci
     */
    getConfig() {
        return ServerConfig.getConfig();
    }

    /**
     * Aktualizuje globální banner se stavem serveru
     */
    updateStatusBanner(config) {
        const elements = document.querySelectorAll('[data-server-status]');
        if (!elements.length) return;

        const profileName = ServerConfig.getActiveProfile();
        const profileLabel = ServerProfiles[profileName]?.name || profileName;
        const apiUrl = config.api?.url || '—';
        const mqttUrl = config.mqtt?.url || '—';

        elements.forEach((el) => {
            el.innerHTML = `
                <span class="server-status-pill">${profileLabel}</span>
                <span class="server-status-detail">API: <strong>${apiUrl}</strong></span>
                <span class="server-status-detail">MQTT: <strong>${mqttUrl}</strong></span>
            `;
        });
    }
}

// Export pro použití v aplikacích
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServerSelector;
}

