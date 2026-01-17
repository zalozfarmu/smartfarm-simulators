/**
 * MQTT Client for Camera Simulator
 * Handles connection to MQTT broker and message publishing/subscribing
 */

const mqttClient = {
    client: null,
    cameraId: null,
    connected: false,
    connectionMode: 'direct', // direct | gateway
    gatewayId: null,
    gatewayStatus: 'idle', // idle | pending | confirmed | failed
    gatewayHandshakeTimer: null,

    connect(cameraId, username, password, mode = 'direct', gatewayId = null) {
        this.cameraId = cameraId;
        this.connectionMode = mode || 'direct';
        this.gatewayId = gatewayId || null;
        this.setGatewayStatus('idle');

        // Get broker URL from server config
        const config = typeof ServerConfig !== 'undefined' ? ServerConfig.getConfig() : null;
        const brokerUrl = config?.mqtt?.url || 'ws://localhost:9001/mqtt';

        // Normalize broker URL
        const normalizedBrokerUrl = brokerUrl.replace(/mosquitto/g, 'localhost');

        const clientId = `camera_${this.cameraId}_${Date.now()}`;

        logger.log(`🔌 Připojuji k ${normalizedBrokerUrl}...`, 'info');
        logger.log(`👤 Username: ${username}`, 'info');
        logger.log(`🆔 Camera ID: ${cameraId}`, 'info');
        logger.log(`🌐 Režim: ${this.connectionMode === 'gateway' ? 'Přes gateway' : 'Přímo na server'}`, 'info');

        try {
            this.client = mqtt.connect(normalizedBrokerUrl, {
                clientId,
                username: username.trim(),
                password: password.trim(),
                clean: true,
                reconnectPeriod: 1000,
                connectTimeout: 10000,
            });

            this.client.on('connect', () => {
                this.connected = true;
                this.updateStatus();
                logger.log('✅ Připojeno k MQTT brokeru', 'success');

                // Subscribe to command topics (přímé)
                const topics = [
                    `smartcoop/camera/${this.cameraId}/command`,
                    `smartcoop/camera/${this.cameraId}/config`
                ];

                topics.forEach(topic => {
                    this.client.subscribe(topic, (err) => {
                        if (!err) {
                            logger.log(`📨 Subscribed: ${topic}`, 'success');
                        }
                    });
                });

                // Přihlásit se na ack z gateway, pokud je potřeba
                if (this.connectionMode === 'gateway' && this.gatewayId) {
                    const gatewayTopics = [
                        `smartcoop/${this.gatewayId}/camera/${this.cameraId}/handshake/ack`,
                        `smartcoop/${this.gatewayId}/camera/${this.cameraId}/command`,
                        `smartcoop/${this.gatewayId}/camera/${this.cameraId}/config`
                    ];
                    gatewayTopics.forEach(topic => {
                        this.client.subscribe(topic, (err) => {
                            if (!err) {
                                logger.log(`📨 Subscribed: ${topic}`, 'success');
                            }
                        });
                    });
                    this.startGatewayHandshake();
                } else {
                    this.setGatewayStatus('confirmed');
                }

                // Send initial status
                this.publishStatus();
            });

            this.client.on('message', (topic, message) => {
                this.handleMessage(topic, message);
            });

            this.client.on('error', (err) => {
                logger.log(`❌ MQTT Error: ${err.message}`, 'error');
                this.connected = false;
                this.updateStatus();
                this.setGatewayStatus('failed');
            });

            this.client.on('close', () => {
                this.connected = false;
                this.updateStatus();
                this.setGatewayStatus('idle');
                logger.log('⚠️ Odpojeno od MQTT brokeru', 'warning');
            });

            this.client.on('offline', () => {
                logger.log('📴 MQTT klient offline', 'warning');
            });

            this.client.on('reconnect', () => {
                logger.log('🔄 Pokus o opětovné připojení...', 'info');
            });

        } catch (error) {
            logger.log(`❌ Chyba při vytváření klienta: ${error.message}`, 'error');
        }
    },

    disconnect() {
        if (this.client) {
            this.client.end();
            this.client = null;
        }
        this.connected = false;
        this.updateStatus();
        this.setGatewayStatus('idle');
        logger.log('🔌 Odpojeno', 'info');
    },

    updateStatus() {
        const badge = document.getElementById('cameraStatus');
        if (this.connected) {
            badge.className = 'status-badge online';
            badge.textContent = '🟢 ONLINE';
        } else {
            badge.className = 'status-badge offline';
            badge.textContent = '⚫ OFFLINE';
        }
    },

    isConnected() {
        return this.connected && this.client && this.client.connected;
    },

    publish(topic, payload) {
        if (!this.isConnected()) {
            logger.log('⚠️ Nelze publikovat - kamera není připojena', 'warning');
            return;
        }

        const message = typeof payload === 'string' ? payload : JSON.stringify(payload);

        this.client.publish(topic, message, { qos: 1 }, (err) => {
            if (err) {
                logger.log(`❌ Publish failed: ${err.message}`, 'error');
            }
        });
    },

    publishStatus() {
        if (!this.isConnected()) return;

        const baseTopic = this.connectionMode === 'gateway' && this.gatewayId
            ? `smartcoop/${this.gatewayId}/camera/${this.cameraId}`
            : `smartcoop/camera/${this.cameraId}`;

        const payload = {
            cameraId: this.cameraId,
            type: 'camera',
            status: 'online',
            battery: camera.status.battery,
            signal: camera.status.signal,
            resolution: camera.settings.resolution,
            quality: camera.settings.quality,
            storage: {
                used: camera.status.storageUsed,
                total: camera.status.storageTotal
            },
            temperature: camera.status.temperature,
            memory: camera.status.memory,
            route: this.connectionMode,
            gatewayId: this.gatewayId || undefined,
            timestamp: new Date().toISOString()
        };

        this.publish(`${baseTopic}/status`, payload);
    },

    publishSnapshot(snapshotData) {
        if (!this.isConnected()) return;

        const baseTopic = this.connectionMode === 'gateway' && this.gatewayId
            ? `smartcoop/${this.gatewayId}/camera/${this.cameraId}`
            : `smartcoop/camera/${this.cameraId}`;

        const payload = {
            cameraId: this.cameraId,
            snapshotId: snapshotData.id,
            timestamp: snapshotData.timestamp,
            type: snapshotData.type,
            size: snapshotData.size,
            resolution: camera.settings.resolution,
            thumbnail: snapshotData.thumbnail,
            route: this.connectionMode,
            gatewayId: this.gatewayId || undefined,
        };

        this.publish(`${baseTopic}/snapshot`, payload);
        logger.log(`📸 Snímek publikován: ${snapshotData.id} (${this.connectionMode === 'gateway' ? 'gateway' : 'server'})`, 'success');
    },

    handleMessage(topic, message) {
        try {
            const payload = JSON.parse(message.toString());
            logger.log(`📨 Message: ${topic}`, 'info');

            if (topic.includes('/command')) {
                this.handleCommand(payload);
            } else if (topic.includes('/config')) {
                this.handleConfig(payload);
            } else if (topic.includes('/handshake/ack')) {
                this.handleGatewayAck(payload);
            } else if (topic.includes('/snapshot/ack')) {
                this.handleSnapshotAck(payload);
            } else if (topic.includes('/pair/ack')) {
                this.handlePairAck(payload);
            }
        } catch (e) {
            logger.log(`⚠️ Failed to parse message: ${e.message}`, 'warning');
        }
    },

    handleCommand(payload) {
        const action = payload.action;
        logger.log(`🎬 Příkaz přijat: ${action}`, 'info');

        switch (action) {
            case 'capture':
            case 'photo':
            case 'take_photo':
                camera.capturePhoto();
                break;
            case 'start_recording':
            case 'record':
                camera.startRecording();
                break;
            case 'stop_recording':
                camera.stopRecording();
                break;
            case 'get_status':
                this.publishStatus();
                break;
            default:
                logger.log(`ℹ️ Neznámý příkaz: ${action}`, 'info');
        }
    },

    startGatewayHandshake(force = false) {
        if (this.connectionMode !== 'gateway' || !this.gatewayId) return;
        if (!force && this.gatewayStatus === 'confirmed') return;

        this.setGatewayStatus('pending');

        const topic = `smartcoop/${this.gatewayId}/camera/${this.cameraId}/handshake`;
        const payload = {
            cameraId: this.cameraId,
            gatewayId: this.gatewayId,
            action: 'handshake',
            timestamp: new Date().toISOString()
        };
        this.publish(topic, payload);
        logger.log(`🤝 Odeslán handshake na gateway ${this.gatewayId}`, 'info');

        if (this.gatewayHandshakeTimer) clearTimeout(this.gatewayHandshakeTimer);
        this.gatewayHandshakeTimer = setTimeout(() => {
            if (this.gatewayStatus !== 'confirmed') {
                this.setGatewayStatus('failed');
                logger.log('⚠️ Handshake s gateway nepotvrzen', 'warning');
            }
        }, 4000);
    },

    handleGatewayAck(payload) {
        if (payload?.status === 'ok') {
            this.setGatewayStatus('confirmed');
            if (this.gatewayHandshakeTimer) clearTimeout(this.gatewayHandshakeTimer);
            logger.log(`✅ Gateway ${payload.gatewayId || this.gatewayId} potvrdila spojení`, 'success');
        }
    },

    handleSnapshotAck(payload) {
        if (payload?.status === 'ok') {
            logger.log(`✅ Gateway potvrdila snímek ${payload.snapshotId}`, 'success');
        } else {
            logger.log(`⚠️ Gateway nepotvrdila snímek ${payload?.snapshotId || ''}`, 'warning');
        }
    },

    sendPairRequest() {
        if (this.connectionMode !== 'gateway' || !this.gatewayId) {
            alert('Pairing je dostupný jen v režimu přes gateway.');
            return;
        }
        if (!this.isConnected()) {
            alert('Kamera není připojena k MQTT, nejdřív se připojte.');
            return;
        }
        this.setGatewayStatus('pending');
        const cameraName = document.getElementById('cameraName')?.value || 'ESP32-CAM';
        const username = document.getElementById('username')?.value || '';
        const password = document.getElementById('password')?.value || '';
        const topic = `smartcoop/${this.gatewayId}/camera/${this.cameraId}/pair`;
        const payload = {
            action: 'pair_request',
            cameraId: this.cameraId,
            cameraName,
            gatewayId: this.gatewayId,
            mqttUsername: username,
            mqttPassword: password,
            timestamp: new Date().toISOString()
        };
        this.publish(topic, payload);
        logger.log(`🤝 Pair request odeslán na ${topic}`, 'info');
    },

    handlePairAck(payload) {
        if (!payload || payload.cameraId !== this.cameraId) return;
        if (payload.status === 'ok') {
            this.setGatewayStatus('confirmed');
            // Přenést credentials z ack, pokud jsou
            if (payload.mqttUsername) {
                const userInput = document.getElementById('username');
                if (userInput) userInput.value = payload.mqttUsername;
            }
            if (payload.mqttPassword) {
                const passInput = document.getElementById('password');
                if (passInput) passInput.value = payload.mqttPassword;
            }
            logger.log(`✅ Pair ACK z gateway, kamera spárována`, 'success');
        } else {
            this.setGatewayStatus('failed');
            logger.log(`⚠️ Pair ACK s chybou: ${payload.status}`, 'warning');
        }
    },

    setGatewayStatus(status) {
        this.gatewayStatus = status;
        const el = document.getElementById('gatewayStatus');
        if (!el) return;
        switch (status) {
            case 'pending':
                el.className = 'badge badge-warning';
                el.textContent = 'Čekám na potvrzení...';
                break;
            case 'confirmed':
                el.className = 'badge badge-success';
                el.textContent = 'Spojeno';
                break;
            case 'failed':
                el.className = 'badge badge-danger';
                el.textContent = 'Nepotvrzeno';
                break;
            default:
                el.className = 'badge badge-secondary';
                el.textContent = 'Neaktivní';
        }
    },

    resetGatewayStatus() {
        this.setGatewayStatus('idle');
        if (this.gatewayHandshakeTimer) clearTimeout(this.gatewayHandshakeTimer);
        this.gatewayHandshakeTimer = null;
    },

    handleConfig(payload) {
        logger.log('⚙️ Konfigurace aktualizována', 'info');

        if (payload.resolution) {
            camera.setResolution(payload.resolution);
        }
        if (payload.quality !== undefined) {
            camera.setQuality(payload.quality);
        }
        if (payload.autoCapture !== undefined) {
            camera.toggleAutoCapture(payload.autoCapture);
        }
        if (payload.motionDetection !== undefined) {
            camera.toggleMotionDetection(payload.motionDetection);
        }
    }
};
