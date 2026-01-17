/**
 * Network Simulation - Enhanced with AP Mode, WiFi Client, and GSM
 * Mimics ESP32 network behavior for SmartFarm chicken coop system
 */

// Network modes enum
const NetworkMode = {
    AP_MODE: 'ap_mode',           // WiFi Direct - initial setup / configuration
    WIFI_CLIENT: 'wifi_client',   // Normal operation - connected to router
    GSM: 'gsm',                    // Fallback/backup - periodic check-ins
    OFFLINE: 'offline'             // No connectivity
};

const network = {
    // Current active mode
    currentMode: NetworkMode.OFFLINE,

    // AP Mode configuration (Access Point for initial setup)
    apMode: {
        enabled: false,
        ssid: 'SmartCoop_SETUP',
        password: '',              // Empty = open network, filled = WPA2
        security: 'open',          // 'open' or 'wpa2'
        ip: '192.168.4.1',         // Default ESP32 AP IP
        clients: [],               // Connected clients
        channel: 1
    },

    // WiFi Client mode (normal operation)
    wifiClient: {
        configured: false,         // Has SSID and password been set?
        ssid: '',
        password: '',
        connected: false,
        rssi: -45,                 // Signal strength
        ip: '',
        mac: 'AA:BB:CC:DD:EE:FF',
        gateway: '',
        autoReconnect: true
    },

    // GSM module configuration
    gsm: {
        enabled: false,
        simInserted: true,
        signal: 0,                 // 0-31 (RSSI)
        operator: '',
        connected: false,
        imei: '123456789012345',
        apn: 'internet',
        phoneNumber: '+420123456789',
        credit: 150,               // CZK
        creditCurrency: 'CZK',
        dataLimit: 1000,           // MB per month
        dataUsed: 0,               // MB used this month
        dataStatus: 'active',      // 'active' | 'limited' | 'exhausted'
        periodicMode: true,        // True = only periodic check-ins (not continuous)
        lastCheckIn: null,
        checkInInterval: 300000    // 5 minutes in ms
    },

    // Configuration hash (for WiFi Direct sync detection)
    configHash: '',
    lastConfigChange: null,

    // Intervals for auto modes
    intervals: {
        gsmCheckIn: null,
        signalSimulation: null
    },

    // WiFi scan results
    availableNetworks: [],
    isScanning: false,

    // SMS history
    smsHistory: [],

    init() {
        console.log('[Network] Initializing enhanced network simulation...');

        // Load saved configuration from localStorage
        this.loadConfiguration();

        // Generate MAC address if not set
        if (this.wifiClient.mac === 'AA:BB:CC:DD:EE:FF') {
            this.wifiClient.mac = this.generateMacAddress();
        }

        // Default to offline mode on startup
        this.currentMode = NetworkMode.OFFLINE;

        // If WiFi is configured, try to connect
        if (this.wifiClient.configured && this.wifiClient.ssid) {
            this.switchToWifiClient();
        } else {
            // Start in AP Mode for initial setup
            this.switchToApMode();
        }

        this.update();

        // Start signal simulation (fluctuations)
        this.startSignalSimulation();

        console.log('[Network] Initialization complete. Mode:', this.currentMode);
    },

    /**
     * Generate random MAC address for WiFi
     */
    generateMacAddress() {
        const hex = '0123456789ABCDEF';
        let mac = '';
        for (let i = 0; i < 6; i++) {
            if (i > 0) mac += ':';
            mac += hex.charAt(Math.floor(Math.random() * 16));
            mac += hex.charAt(Math.floor(Math.random() * 16));
        }
        return mac;
    },

    /**
     * Calculate SHA256 hash of configuration (simplified for simulator)
     */
    calculateConfigHash() {
        const configString = [
            this.wifiClient.ssid,
            this.wifiClient.password,
            this.gsm.apn,
            this.gsm.dataLimit,
            door.openTime || '',
            door.closeTime || '',
            door.mode || ''
        ].join('|');

        // Simplified hash (in real ESP32, use mbedtls SHA256)
        let hash = 0;
        for (let i = 0; i < configString.length; i++) {
            const char = configString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16).padStart(16, '0').substring(0, 16);
    },

    /**
     * Called when configuration changes (via AP Mode or API)
     */
    onConfigChange() {
        this.lastConfigChange = Date.now();
        this.configHash = this.calculateConfigHash();
        this.saveConfiguration();

        logger.log(`⚙️ Config změněna - nový hash: ${this.configHash}`, 'info');

        // If connected to MQTT, send immediate heartbeat with new hash
        if (simulator.isConnected()) {
            setTimeout(() => system.sendHeartbeat(), 500);
        }
    },

    /**
     * Save configuration to localStorage
     */
    saveConfiguration() {
        const config = {
            wifiClient: this.wifiClient,
            gsm: this.gsm,
            apMode: {
                ssid: this.apMode.ssid,
                password: this.apMode.password,
                security: this.apMode.security
            },
            configHash: this.configHash,
            lastConfigChange: this.lastConfigChange
        };
        localStorage.setItem('network_config', JSON.stringify(config));
    },

    /**
     * Load configuration from localStorage
     */
    loadConfiguration() {
        const saved = localStorage.getItem('network_config');
        if (saved) {
            try {
                const config = JSON.parse(saved);
                this.wifiClient = { ...this.wifiClient, ...config.wifiClient };
                this.gsm = { ...this.gsm, ...config.gsm };
                if (config.apMode) {
                    this.apMode.ssid = config.apMode.ssid || this.apMode.ssid;
                    this.apMode.password = config.apMode.password || '';
                    this.apMode.security = config.apMode.security || 'open';
                }
                this.configHash = config.configHash || this.calculateConfigHash();
                this.lastConfigChange = config.lastConfigChange || null;

                console.log('[Network] Configuration loaded from storage');
            } catch (e) {
                console.warn('[Network] Failed to load configuration:', e);
            }
        }
    },

    /**
     * Switch to AP Mode (Access Point for configuration)
     */
    switchToApMode() {
        console.log('[Network] Switching to AP Mode...');

        // Disconnect WiFi client if connected
        if (this.wifiClient.connected) {
            this.wifiClient.connected = false;
        }

        // Disconnect GSM if connected
        if (this.gsm.connected) {
            this.stopGsmCheckIn();
            this.gsm.connected = false;
        }

        // Enable AP Mode
        this.apMode.enabled = true;
        this.currentMode = NetworkMode.AP_MODE;

        logger.log(`📡 AP Mode aktivován: ${this.apMode.ssid}`, 'success');
        logger.log(`🔓 Síť: ${this.apMode.security === 'open' ? 'Otevřená' : 'WPA2 zabezpečená'}`, 'info');
        logger.log(`🌐 IP adresa: ${this.apMode.ip}`, 'info');

        this.update();
        this.publishStatus();
    },

    /**
     * Switch to WiFi Client mode (normal operation)
     */
    switchToWifiClient() {
        console.log('[Network] Switching to WiFi Client mode...');

        if (!this.wifiClient.configured || !this.wifiClient.ssid) {
            logger.log('❌ WiFi není nakonfigurováno! Použijte AP Mode pro nastavení.', 'error');
            this.switchToApMode();
            return;
        }

        // Disable AP Mode
        this.apMode.enabled = false;

        // Simulate connection
        this.wifiClient.connected = true;
        this.wifiClient.rssi = -30 - Math.random() * 30; // -30 to -60 dBm
        this.wifiClient.ip = `192.168.1.${Math.floor(Math.random() * 200 + 10)}`;
        this.wifiClient.gateway = '192.168.1.1';

        this.currentMode = NetworkMode.WIFI_CLIENT;

        logger.log(`📶 WiFi připojeno: ${this.wifiClient.ssid}`, 'success');
        logger.log(`📡 Signal: ${Math.round(this.wifiClient.rssi)} dBm`, 'info');
        logger.log(`🌐 IP: ${this.wifiClient.ip}`, 'info');

        this.update();
        this.publishStatus();
    },

    /**
     * Switch to GSM mode (fallback/backup)
     */
    switchToGsm() {
        console.log('[Network] Switching to GSM mode...');

        if (!this.gsm.simInserted) {
            logger.log('❌ SIM karta není vložena!', 'error');
            return;
        }

        // Disable AP Mode
        this.apMode.enabled = false;

        // Disconnect WiFi
        if (this.wifiClient.connected) {
            this.wifiClient.connected = false;
        }

        // Connect GSM
        this.gsm.connected = true;
        this.gsm.signal = Math.floor(Math.random() * 15 + 15); // 15-30 (good signal)
        this.gsm.operator = 'T-Mobile CZ';

        this.currentMode = NetworkMode.GSM;

        logger.log(`📡 GSM připojeno: ${this.gsm.operator}`, 'success');
        logger.log(`📊 Signal: ${this.gsm.signal}/31`, 'info');

        if (this.gsm.periodicMode) {
            logger.log(`⏰ Periodic mode: Check-in každých ${this.gsm.checkInInterval / 1000}s`, 'info');
            this.startGsmCheckIn();
        } else {
            logger.log(`🔄 Continuous mode: Nepřetržité připojení`, 'info');
        }

        this.update();
        this.publishStatus();
    },

    /**
     * Disconnect all networks (go offline)
     */
    goOffline() {
        console.log('[Network] Going offline...');

        this.apMode.enabled = false;
        this.wifiClient.connected = false;
        this.gsm.connected = false;
        this.currentMode = NetworkMode.OFFLINE;

        this.stopGsmCheckIn();

        logger.log('📴 Všechna připojení odpojenna', 'warning');

        this.update();
    },

    /**
     * Configure WiFi credentials (called from AP Mode web interface)
     */
    configureWifi(ssid, password) {
        if (!ssid) {
            logger.log('❌ SSID je povinné!', 'error');
            return false;
        }

        this.wifiClient.ssid = ssid;
        this.wifiClient.password = password;
        this.wifiClient.configured = true;

        this.onConfigChange(); // Update hash

        logger.log(`✅ WiFi nakonfigurováno: ${ssid}`, 'success');

        // Try to connect
        setTimeout(() => {
            this.switchToWifiClient();
        }, 1000);

        return true;
    },

    /**
     * Start GSM periodic check-in (send heartbeat every X minutes)
     */
    startGsmCheckIn() {
        if (this.intervals.gsmCheckIn) return; // Already running

        this.gsm.lastCheckIn = Date.now();

        this.intervals.gsmCheckIn = setInterval(() => {
            if (this.currentMode === NetworkMode.GSM && this.gsm.periodicMode) {
                logger.log('📡 GSM Check-in: Odesílám heartbeat...', 'info');

                // Simulate data usage
                const dataUsedMB = Math.random() * 0.5; // 0-0.5 MB per check-in
                this.gsm.dataUsed += dataUsedMB;

                // Check data limit
                if (this.gsm.dataUsed >= this.gsm.dataLimit) {
                    this.gsm.dataStatus = 'exhausted';
                    logger.log('⚠️ GSM data limit dosažen!', 'warning');
                } else if (this.gsm.dataUsed >= this.gsm.dataLimit * 0.8) {
                    this.gsm.dataStatus = 'limited';
                }

                this.gsm.lastCheckIn = Date.now();

                // Send heartbeat if MQTT connected
                if (simulator.isConnected()) {
                    system.sendHeartbeat();
                }

                this.update();
            }
        }, this.gsm.checkInInterval);
    },

    /**
     * Stop GSM periodic check-in
     */
    stopGsmCheckIn() {
        if (this.intervals.gsmCheckIn) {
            clearInterval(this.intervals.gsmCheckIn);
            this.intervals.gsmCheckIn = null;
        }
    },

    /**
     * Simulate signal strength fluctuations
     */
    startSignalSimulation() {
        if (this.intervals.signalSimulation) return;

        this.intervals.signalSimulation = setInterval(() => {
            if (this.wifiClient.connected) {
                // WiFi signal fluctuation
                this.wifiClient.rssi = -30 - Math.random() * 30; // -30 to -60
            }

            if (this.gsm.connected) {
                // GSM signal fluctuation
                const baseSignal = 20;
                this.gsm.signal = Math.max(0, Math.min(31, baseSignal + Math.floor(Math.random() * 10 - 5)));
            }

            this.update();
        }, 5000); // Update every 5 seconds
    },

    /**
     * Update UI with current network status
     */
    update() {
        // Update mode badge
        const modeBadge = document.getElementById('networkMode');
        if (modeBadge) {
            const modeLabels = {
                [NetworkMode.AP_MODE]: '🔓 AP Mode',
                [NetworkMode.WIFI_CLIENT]: '📶 WiFi',
                [NetworkMode.GSM]: '📡 GSM',
                [NetworkMode.OFFLINE]: '📴 Offline'
            };
            modeBadge.textContent = modeLabels[this.currentMode] || '❓ Unknown';
            modeBadge.className = 'badge badge-' + (
                this.currentMode === NetworkMode.WIFI_CLIENT ? 'success' :
                this.currentMode === NetworkMode.GSM ? 'warning' :
                this.currentMode === NetworkMode.AP_MODE ? 'info' : 'danger'
            );
        }

        // Update WiFi status
        const wifiStatus = document.getElementById('wifiStatus');
        if (wifiStatus) {
            if (this.currentMode === NetworkMode.AP_MODE) {
                wifiStatus.textContent = 'AP Mode';
                wifiStatus.className = 'badge badge-info';
            } else if (this.wifiClient.connected) {
                wifiStatus.textContent = 'Connected';
                wifiStatus.className = 'badge badge-success';
            } else {
                wifiStatus.textContent = this.wifiClient.configured ? 'Disconnected' : 'Not Configured';
                wifiStatus.className = 'badge badge-danger';
            }
        }

        const wifiSignal = document.getElementById('wifiSignal');
        if (wifiSignal) {
            if (this.currentMode === NetworkMode.AP_MODE) {
                wifiSignal.textContent = this.apMode.ip;
            } else if (this.wifiClient.connected) {
                wifiSignal.textContent = `${Math.round(this.wifiClient.rssi)} dBm`;
            } else {
                wifiSignal.textContent = '--';
            }
        }

        // Update WiFi SSID display
        const wifiSsid = document.getElementById('wifiSsid');
        if (wifiSsid) {
            if (this.currentMode === NetworkMode.AP_MODE) {
                wifiSsid.textContent = this.apMode.ssid;
            } else if (this.wifiClient.configured) {
                wifiSsid.textContent = this.wifiClient.ssid;
            } else {
                wifiSsid.textContent = 'Not configured';
            }
        }

        // Update GSM status
        const gsmStatus = document.getElementById('gsmStatus');
        if (gsmStatus) {
            gsmStatus.textContent = this.gsm.connected ? 'Connected' : 'Disabled';
            gsmStatus.className = 'badge badge-' + (this.gsm.connected ? 'success' : 'warning');
        }

        const gsmSignal = document.getElementById('gsmSignal');
        if (gsmSignal) {
            if (this.gsm.connected) {
                gsmSignal.textContent = `${this.gsm.signal}/31`;
            } else {
                gsmSignal.textContent = '--';
            }
        }

        // Update GSM operator
        const gsmOperator = document.getElementById('gsmOperator');
        if (gsmOperator) {
            gsmOperator.textContent = this.gsm.connected ? this.gsm.operator : 'N/A';
        }

        // Update GSM data usage
        const gsmDataUsage = document.getElementById('gsmDataUsage');
        if (gsmDataUsage) {
            gsmDataUsage.textContent = `${this.gsm.dataUsed.toFixed(1)} / ${this.gsm.dataLimit} MB`;
        }
    },

    /**
     * Publish network status to MQTT
     */
    publishStatus() {
        if (!simulator.isConnected()) return;

        const topic = `smartcoop/${simulator.deviceId}/status`;
        const payload = {
            network: {
                mode: this.currentMode,
                wifi: this.currentMode === NetworkMode.WIFI_CLIENT ? {
                    ssid: this.wifiClient.ssid,
                    rssi: Math.round(this.wifiClient.rssi),
                    connected: this.wifiClient.connected,
                    ip: this.wifiClient.ip,
                    mac: this.wifiClient.mac
                } : (this.currentMode === NetworkMode.AP_MODE ? {
                    apMode: true,
                    ssid: this.apMode.ssid,
                    ip: this.apMode.ip,
                    clients: this.apMode.clients.length
                } : null),
                gsm: this.gsm.connected ? {
                    operator: this.gsm.operator,
                    signal: this.gsm.signal,
                    connected: this.gsm.connected,
                    imei: this.gsm.imei,
                    apn: this.gsm.apn,
                    phoneNumber: this.gsm.phoneNumber,
                    credit: this.gsm.credit,
                    dataUsage: this.gsm.dataUsed,
                    dataLimit: this.gsm.dataLimit,
                    dataStatus: this.gsm.dataStatus
                } : null,
                mqtt: {
                    connected: simulator.isConnected(),
                    broker: typeof ServerConfig !== 'undefined' ? ServerConfig.getConfig().mqtt.url : 'unknown'
                }
            },
            configHash: this.configHash,
            lastConfigChange: this.lastConfigChange,
            timestamp: Date.now()
        };

        simulator.publish(topic, payload);
    },

    // Legacy methods for backward compatibility
    wifiConnect() {
        this.switchToWifiClient();
    },

    wifiDisconnect() {
        if (this.currentMode === NetworkMode.WIFI_CLIENT) {
            this.goOffline();
        }
    },

    gsmConnect() {
        this.switchToGsm();
    },

    gsmDisconnect() {
        if (this.currentMode === NetworkMode.GSM) {
            this.goOffline();
        }
    },

    /**
     * Scan for available WiFi networks
     */
    async scanWifiNetworks() {
        if (this.isScanning) {
            logger.log('⚠️ WiFi scan již probíhá...', 'warning');
            return;
        }

        this.isScanning = true;
        logger.log('🔍 Hledám dostupné WiFi sítě...', 'info');

        // Show scanning indicator
        const scanBtn = document.getElementById('wifiScanBtn');
        if (scanBtn) {
            scanBtn.disabled = true;
            scanBtn.textContent = '⏳ Hledám...';
        }

        // Simulate scan delay (real ESP32 takes 2-3 seconds)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Generate fictitious WiFi networks
        const networks = [
            { ssid: 'SmartHome_2.4GHz', rssi: -35, security: 'WPA2', channel: 6 },
            { ssid: 'Vodafone-5G', rssi: -48, security: 'WPA3', channel: 11 },
            { ssid: 'T-Mobile_WiFi', rssi: -52, security: 'WPA2', channel: 1 },
            { ssid: 'FreeWiFi_Guest', rssi: -67, security: 'Open', channel: 6 },
            { ssid: 'O2-Internet-Fast', rssi: -71, security: 'WPA2', channel: 3 },
            { ssid: 'TP-Link_Home', rssi: -75, security: 'WPA2', channel: 9 },
            { ssid: 'NETGEAR_Office', rssi: -78, security: 'WPA2', channel: 11 },
            { ssid: 'UPC_WiFi', rssi: -82, security: 'WPA2', channel: 1 }
        ];

        // Add some randomness to signal strength
        this.availableNetworks = networks.map(net => ({
            ...net,
            rssi: net.rssi + Math.floor(Math.random() * 10 - 5)
        }));

        // Sort by signal strength (best first)
        this.availableNetworks.sort((a, b) => b.rssi - a.rssi);

        this.isScanning = false;

        // Update UI
        this.displayWifiScanResults();

        logger.log(`✅ Nalezeno ${this.availableNetworks.length} WiFi sítí`, 'success');

        // Restore scan button
        if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.textContent = '🔍 Hledat sítě';
        }
    },

    /**
     * Display WiFi scan results in UI
     */
    displayWifiScanResults() {
        const container = document.getElementById('wifiScanResults');
        if (!container) return;

        if (this.availableNetworks.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 10px; color: #9ca3af; font-size: 12px;">Žádné sítě nenalezeny</div>';
            container.style.display = 'block';
            return;
        }

        let html = '<div style="max-height: 200px; overflow-y: auto;">';

        this.availableNetworks.forEach((network, index) => {
            const signalStrength = this.getSignalStrengthIcon(network.rssi);
            const securityIcon = network.security === 'Open' ? '🔓' : '🔒';
            const signalColor = network.rssi > -50 ? '#10b981' : network.rssi > -70 ? '#f59e0b' : '#ef4444';

            html += `
                <div onclick="network.selectWifiNetwork('${network.ssid}', '${network.security}')"
                     style="padding: 10px; border-bottom: 1px solid #e5e7eb; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;"
                     onmouseover="this.style.background='#f9fafb'"
                     onmouseout="this.style.background='white'">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 13px; color: #1f2937; display: flex; align-items: center; gap: 6px;">
                            ${securityIcon} ${network.ssid}
                        </div>
                        <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">
                            ${network.security} • Ch ${network.channel}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 20px; color: ${signalColor};">${signalStrength}</span>
                        <span style="font-size: 11px; color: #6b7280;">${network.rssi} dBm</span>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
        container.style.display = 'block';
    },

    /**
     * Get signal strength icon
     */
    getSignalStrengthIcon(rssi) {
        if (rssi > -50) return '📶'; // Excellent
        if (rssi > -60) return '📶'; // Good
        if (rssi > -70) return '📶'; // Fair
        return '📶'; // Weak
    },

    /**
     * Select WiFi network from scan results
     */
    selectWifiNetwork(ssid, security) {
        logger.log(`📡 Vybrána síť: ${ssid}`, 'info');

        // Pre-fill WiFi configuration
        document.getElementById('wifiConfigSsid').value = ssid;

        if (security === 'Open') {
            document.getElementById('wifiConfigPassword').value = '';
            document.getElementById('wifiConfigPassword').placeholder = 'Otevřená síť - heslo není potřeba';
        } else {
            document.getElementById('wifiConfigPassword').value = '';
            document.getElementById('wifiConfigPassword').placeholder = 'Zadejte heslo...';
            document.getElementById('wifiConfigPassword').focus();
        }

        // Show config section
        document.getElementById('wifiConfigSection').style.display = 'block';
        document.getElementById('wifiConfigBtn').textContent = '❌ Zrušit';

        // Hide scan results
        const scanResults = document.getElementById('wifiScanResults');
        if (scanResults) {
            scanResults.style.display = 'none';
        }
    },

    /**
     * Configure GSM (APN, phone number)
     */
    configureGsm(apn, phoneNumber) {
        if (!apn) {
            logger.log('❌ APN je povinné!', 'error');
            return false;
        }

        this.gsm.apn = apn;
        if (phoneNumber) {
            this.gsm.phoneNumber = phoneNumber;
        }

        this.onConfigChange(); // Update hash

        logger.log(`✅ GSM nakonfigurováno: APN=${apn}`, 'success');
        this.saveConfiguration();

        return true;
    },

    /**
     * Send test SMS
     */
    async sendTestSms(recipient, message) {
        if (!this.gsm.connected) {
            logger.log('❌ GSM není připojeno! Nelze odeslat SMS.', 'error');
            alert('⚠️ GSM není připojeno!\n\nPřipojte GSM modul před odesláním SMS.');
            return false;
        }

        if (!this.gsm.simInserted) {
            logger.log('❌ SIM karta není vložena!', 'error');
            alert('⚠️ SIM karta není vložena!');
            return false;
        }

        if (!recipient || !message) {
            logger.log('❌ Vyplňte příjemce a zprávu!', 'error');
            return false;
        }

        logger.log(`📱 Odesílám SMS na ${recipient}...`, 'info');

        // Show sending indicator
        const sendBtn = document.getElementById('gsmSendSmsBtn');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = '⏳ Odesílám...';
        }

        // Simulate SMS send delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Calculate SMS cost (2 CZK per SMS in Czech Republic)
        const smsCost = 2;
        this.gsm.credit -= smsCost;

        // Add to SMS history
        const smsRecord = {
            id: Date.now(),
            recipient,
            message,
            timestamp: new Date().toISOString(),
            status: 'sent',
            cost: smsCost
        };
        this.smsHistory.unshift(smsRecord);

        // Keep only last 50 SMS
        if (this.smsHistory.length > 50) {
            this.smsHistory = this.smsHistory.slice(0, 50);
        }

        logger.log(`✅ SMS odeslána! Kredit: ${this.gsm.credit} ${this.gsm.creditCurrency}`, 'success');

        // Restore send button
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = '📤 Odeslat SMS';
        }

        // Update UI
        this.update();
        this.displaySmsHistory();

        // Publish SMS event to MQTT
        if (simulator.isConnected()) {
            simulator.publish(`smartcoop/${simulator.deviceId}/sms/sent`, {
                recipient,
                message,
                timestamp: smsRecord.timestamp,
                credit: this.gsm.credit
            });
        }

        return true;
    },

    /**
     * Display SMS history
     */
    displaySmsHistory() {
        const container = document.getElementById('gsmSmsHistory');
        if (!container) return;

        if (this.smsHistory.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 10px; color: #9ca3af; font-size: 12px;">Žádné odeslané SMS</div>';
            return;
        }

        let html = '<div style="max-height: 150px; overflow-y: auto;">';

        this.smsHistory.slice(0, 10).forEach(sms => {
            const time = new Date(sms.timestamp).toLocaleString('cs-CZ');
            html += `
                <div style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-weight: 600; color: #1f2937;">📱 ${sms.recipient}</span>
                        <span style="color: #6b7280;">${time}</span>
                    </div>
                    <div style="color: #6b7280; margin-bottom: 4px;">${sms.message}</div>
                    <div style="font-size: 10px; color: #9ca3af;">
                        Cena: ${sms.cost} ${this.gsm.creditCurrency} • Status: ${sms.status === 'sent' ? '✅ Odesláno' : '⏳ Čeká'}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    },

    /**
     * Test GSM signal quality
     */
    async testGsmSignal() {
        if (!this.gsm.simInserted) {
            logger.log('❌ SIM karta není vložena!', 'error');
            alert('⚠️ SIM karta není vložena!');
            return;
        }

        logger.log('📡 Testuji GSM signál...', 'info');

        const testBtn = document.getElementById('gsmSignalTestBtn');
        if (testBtn) {
            testBtn.disabled = true;
            testBtn.textContent = '⏳ Testuji...';
        }

        // Simulate signal test delay
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Generate signal test results
        const results = {
            rssi: this.gsm.signal, // 0-31
            rssiDbm: -113 + (this.gsm.signal * 2), // Convert to dBm (-113 to -51 dBm)
            quality: this.gsm.signal > 20 ? 'Výborný' : this.gsm.signal > 15 ? 'Dobrý' : this.gsm.signal > 10 ? 'Průměrný' : 'Slabý',
            operator: this.gsm.operator || 'Neznámý',
            networkType: '4G LTE', // Simulace
            cellTower: `Tower-${Math.floor(Math.random() * 9999)}`,
            latency: Math.floor(Math.random() * 50 + 30) + ' ms'
        };

        logger.log(`📊 GSM Signal Test Results:`, 'info');
        logger.log(`   Signal: ${results.rssi}/31 (${results.rssiDbm} dBm)`, 'info');
        logger.log(`   Quality: ${results.quality}`, 'info');
        logger.log(`   Operator: ${results.operator}`, 'info');
        logger.log(`   Network: ${results.networkType}`, 'info');

        // Display results in UI
        const resultsDiv = document.getElementById('gsmSignalTestResults');
        if (resultsDiv) {
            const qualityColor = results.rssi > 20 ? '#10b981' : results.rssi > 15 ? '#f59e0b' : results.rssi > 10 ? '#fb923c' : '#ef4444';

            resultsDiv.innerHTML = `
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; margin-top: 10px;">
                    <div style="font-size: 12px; font-weight: 600; color: #166534; margin-bottom: 8px;">📊 Výsledky testu signálu:</div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
                        <div style="padding: 6px; background: white; border-radius: 4px;">
                            <div style="color: #6b7280; margin-bottom: 2px;">Síla signálu</div>
                            <div style="font-weight: 600; color: ${qualityColor};">${results.rssi}/31 (${results.rssiDbm} dBm)</div>
                        </div>

                        <div style="padding: 6px; background: white; border-radius: 4px;">
                            <div style="color: #6b7280; margin-bottom: 2px;">Kvalita</div>
                            <div style="font-weight: 600; color: ${qualityColor};">${results.quality}</div>
                        </div>

                        <div style="padding: 6px; background: white; border-radius: 4px;">
                            <div style="color: #6b7280; margin-bottom: 2px;">Operátor</div>
                            <div style="font-weight: 600; color: #1f2937;">${results.operator}</div>
                        </div>

                        <div style="padding: 6px; background: white; border-radius: 4px;">
                            <div style="color: #6b7280; margin-bottom: 2px;">Síť</div>
                            <div style="font-weight: 600; color: #1f2937;">${results.networkType}</div>
                        </div>

                        <div style="padding: 6px; background: white; border-radius: 4px;">
                            <div style="color: #6b7280; margin-bottom: 2px;">Věž</div>
                            <div style="font-weight: 600; color: #1f2937; font-size: 10px;">${results.cellTower}</div>
                        </div>

                        <div style="padding: 6px; background: white; border-radius: 4px;">
                            <div style="color: #6b7280; margin-bottom: 2px;">Latence</div>
                            <div style="font-weight: 600; color: #1f2937;">${results.latency}</div>
                        </div>
                    </div>
                </div>
            `;
            resultsDiv.style.display = 'block';
        }

        if (testBtn) {
            testBtn.disabled = false;
            testBtn.textContent = '📊 Test signálu';
        }
    },

    /**
     * Check GSM credit balance
     */
    async checkGsmCredit() {
        if (!this.gsm.connected) {
            logger.log('❌ GSM není připojeno!', 'error');
            alert('⚠️ GSM není připojeno!\n\nPřipojte GSM modul pro kontrolu kreditu.');
            return;
        }

        if (!this.gsm.simInserted) {
            logger.log('❌ SIM karta není vložena!', 'error');
            alert('⚠️ SIM karta není vložena!');
            return;
        }

        logger.log('💳 Kontroluji stav kreditu...', 'info');

        const checkBtn = document.getElementById('gsmCreditCheckBtn');
        if (checkBtn) {
            checkBtn.disabled = true;
            checkBtn.textContent = '⏳ Kontroluji...';
        }

        // Simulate USSD query delay (real GSM takes 2-5 seconds)
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Generate credit details
        const creditDetails = {
            balance: this.gsm.credit,
            currency: this.gsm.creditCurrency,
            validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('cs-CZ'),
            dataRemaining: this.gsm.dataLimit - this.gsm.dataUsed,
            dataTotal: this.gsm.dataLimit,
            phoneNumber: this.gsm.phoneNumber,
            tariff: 'Předplacená karta',
            smsSent: this.smsHistory.length,
            lastRecharge: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toLocaleDateString('cs-CZ')
        };

        logger.log(`✅ Kredit: ${creditDetails.balance} ${creditDetails.currency}`, 'success');
        logger.log(`   Data: ${creditDetails.dataRemaining.toFixed(1)} / ${creditDetails.dataTotal} MB`, 'info');

        // Display credit details
        const detailsDiv = document.getElementById('gsmCreditDetails');
        if (detailsDiv) {
            const creditColor = creditDetails.balance > 100 ? '#10b981' : creditDetails.balance > 50 ? '#f59e0b' : '#ef4444';
            const dataPercent = ((creditDetails.dataTotal - creditDetails.dataRemaining) / creditDetails.dataTotal * 100).toFixed(0);

            detailsDiv.innerHTML = `
                <div style="background: #fefce8; border: 1px solid #fde047; border-radius: 6px; padding: 12px; margin-top: 10px;">
                    <div style="font-size: 12px; font-weight: 600; color: #854d0e; margin-bottom: 8px;">💳 Stav kreditu:</div>

                    <div style="background: white; border-radius: 6px; padding: 10px; margin-bottom: 8px;">
                        <div style="font-size: 24px; font-weight: 700; color: ${creditColor}; text-align: center;">
                            ${creditDetails.balance} ${creditDetails.currency}
                        </div>
                        <div style="font-size: 10px; color: #6b7280; text-align: center; margin-top: 4px;">
                            Platnost do ${creditDetails.validUntil}
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; margin-bottom: 8px;">
                        <div style="padding: 6px; background: white; border-radius: 4px;">
                            <div style="color: #6b7280; margin-bottom: 2px;">Telefon</div>
                            <div style="font-weight: 600; color: #1f2937; font-size: 10px;">${creditDetails.phoneNumber}</div>
                        </div>

                        <div style="padding: 6px; background: white; border-radius: 4px;">
                            <div style="color: #6b7280; margin-bottom: 2px;">Tarif</div>
                            <div style="font-weight: 600; color: #1f2937;">${creditDetails.tariff}</div>
                        </div>
                    </div>

                    <div style="background: white; border-radius: 4px; padding: 8px; margin-bottom: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-size: 11px; color: #6b7280;">Datový limit</span>
                            <span style="font-size: 11px; font-weight: 600; color: #1f2937;">${creditDetails.dataRemaining.toFixed(1)} / ${creditDetails.dataTotal} MB</span>
                        </div>
                        <div style="height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden;">
                            <div style="height: 100%; background: linear-gradient(90deg, #10b981 0%, #f59e0b 100%); width: ${dataPercent}%; transition: width 0.3s;"></div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 10px;">
                        <div style="padding: 4px; background: white; border-radius: 4px; text-align: center;">
                            <div style="color: #6b7280;">SMS odesláno</div>
                            <div style="font-weight: 600; color: #1f2937;">${creditDetails.smsSent}</div>
                        </div>

                        <div style="padding: 4px; background: white; border-radius: 4px; text-align: center;">
                            <div style="color: #6b7280;">Poslední dobití</div>
                            <div style="font-weight: 600; color: #1f2937;">${creditDetails.lastRecharge}</div>
                        </div>
                    </div>
                </div>
            `;
            detailsDiv.style.display = 'block';
        }

        if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.textContent = '💳 Kontrola kreditu';
        }
    }
};
