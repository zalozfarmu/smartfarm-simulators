/**
 * System Simulation
 */

const system = {
    startTime: Date.now(),
    heartbeatInterval: null,
    autoHeartbeat: true,

    init() {
        this.update();
        if (this.autoHeartbeat) {
            this.startHeartbeat();
        }
    },

    update() {
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        
        let uptimeStr = '';
        if (hours > 0) uptimeStr += `${hours}h `;
        if (minutes > 0) uptimeStr += `${minutes}m `;
        uptimeStr += `${seconds}s`;
        
        document.getElementById('uptime').textContent = uptimeStr;
        
        // Simulate RAM usage
        const freeRam = 200 + Math.floor(Math.random() * 50);
        document.getElementById('freeRam').textContent = `${freeRam}KB`;
    },

    sendHeartbeat() {
        if (simulator.isConnected()) {
            // Heartbeat: smartcoop/{deviceId}/heartbeat nebo jako součást status
            const topic = `smartcoop/${simulator.deviceId}/heartbeat`;

            // Get hardware status if available
            const hardwareStatus = typeof hardware !== 'undefined' ? hardware.getStatusPayload() : {};

            const payload = {
                online: true,
                uptime: Math.floor((Date.now() - this.startTime) / 1000),
                freeRam: 200 + Math.floor(Math.random() * 50),
                firmware: 'v1.2.5',

                // Config hash for WiFi Direct sync detection
                configHash: typeof network !== 'undefined' ? network.configHash : '',
                lastModified: typeof network !== 'undefined' ? network.lastConfigChange : null,
                lastSyncWithServer: Date.now(),

                // Network mode indicator
                wifiDirect: typeof network !== 'undefined' && network.currentMode === 'ap_mode',
                networkMode: typeof network !== 'undefined' ? network.currentMode : 'unknown',

                // Hardware status (RTC, SD Card, RFID readers, GSM, pending chickens)
                ...hardwareStatus,

                timestamp: Date.now()
            };
            simulator.publish(topic, payload);
            logger.log('💓 Heartbeat odeslán', 'info');
        }
    },

    toggleHeartbeat(enabled) {
        this.autoHeartbeat = enabled;
        if (enabled) {
            this.startHeartbeat();
        } else {
            this.stopHeartbeat();
        }
    },

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
            this.update();
        }, 10000); // Every 10 seconds
    },

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    },

    restart() {
        if (!confirm('Opravdu chcete restartovat simulátor?')) return;
        
        logger.log('🔄 Simulátor se restartuje...', 'warning');
        
        // Restart after 2 seconds
        setTimeout(() => {
            location.reload();
        }, 2000);
    }
};

