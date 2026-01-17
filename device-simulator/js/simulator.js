/**
 * MQTT Simulator Main
 */

const simulator = {
    client: null,
    deviceId: null,
    connected: false,
    rfidModules: [], // Seznam RFID modulů připojených k zařízení

    /**
     * Připojí se k MQTT brokeru pomocí uložených credentials
     */
    connectWithCredentials(credentials, deviceId = null) {
        // DŮLEŽITÉ: Device ID by mělo být předáno jako parametr nebo načteno z formuláře
        // NEPOUŽÍVAT CredentialsStorage.getDeviceId() - může vracet starou hodnotu
        if (!deviceId) {
            // Zkusit načíst z formuláře (nejaktuálnější hodnota)
            const deviceIdInput = document.getElementById('deviceId');
            deviceId = deviceIdInput ? deviceIdInput.value : null;
        }

        // Fallback: zkusit načíst z credentials nebo localStorage
        if (!deviceId) {
            deviceId = CredentialsStorage.getDeviceId();
        }

        // Pokud stále nemáme Device ID, použít username (pokud je ve formátu device_X)
        if (!deviceId && credentials.username) {
            const match = credentials.username.match(/^device_(\d+)$/);
            if (match) {
                deviceId = match[1];
                console.log(`📡 Device ID extrahováno z username: ${deviceId}`);
            }
        }

        this.deviceId = deviceId;

        // Použít konfiguraci z ServerConfig místo uloženého brokerWs
        // (uložené brokerWs může obsahovat Docker hostname "mosquitto", který nefunguje v prohlížeči)
        const config = typeof ServerConfig !== 'undefined' ? ServerConfig.getConfig() : null;
        const brokerUrl = config?.mqtt?.url || credentials.brokerWs || credentials.broker || 'ws://localhost:9001/mqtt';

        // Normalizovat broker URL - nahradit Docker hostname "mosquitto" za "localhost" (legacy)
        const normalizedBrokerUrl = brokerUrl.replace(/mosquitto/g, 'localhost');

        const username = credentials.username;
        const password = credentials.password;

        console.log('📡 Using broker URL from config:', normalizedBrokerUrl);
        console.log('📡 Original broker URL (if different):', brokerUrl);
        console.log('🆔 Device ID for connection:', deviceId);

        this._connectInternal(normalizedBrokerUrl, username, password, deviceId);
    },

    /**
     * Připojí se k MQTT brokeru (standardní metoda - z formuláře)
     */
    connect() {
        console.log('🔌 Connect button clicked');
        console.log('mqtt available:', typeof mqtt !== 'undefined');
        console.log('ServerConfig available:', typeof ServerConfig !== 'undefined');

        // Validace závislostí
        if (typeof mqtt === 'undefined') {
            logger.log('❌ MQTT knihovna není načtená! Zkontrolujte připojení k internetu.', 'error');
            alert('❌ MQTT knihovna není načtená!\n\nZkontrolujte:\n1. Připojení k internetu\n2. Konzoli prohlížeče pro více informací');
            return;
        }

        if (typeof ServerConfig === 'undefined') {
            logger.log('❌ ServerConfig není načtený! Zkontrolujte, že shared/config.js je dostupný.', 'error');
            alert('❌ Konfigurace serveru není načtená!\n\nZkontrolujte, že server běží z kořenové složky smartfarm/');
            return;
        }

        // Validace vstupů
        const deviceId = document.getElementById('deviceId').value;
        let username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!deviceId) {
            logger.log('❌ Zadejte Device ID', 'error');
            alert('⚠️ Zadejte Device ID');
            document.getElementById('deviceId').focus();
            return;
        }

        // Validace username - musí být MQTT username, ne Device ID
        if (!username) {
            logger.log('❌ Zadejte Username', 'error');
            alert('⚠️ Zadejte MQTT Username');
            document.getElementById('username').focus();
            return;
        }

        // Pokud username vypadá jako Device ID (jen číslo nebo krátký string), zkusit vytvořit správný MQTT username
        if (username === deviceId || (username.length <= 3 && /^\d+$/.test(username))) {
            logger.log(`⚠️ Username "${username}" vypadá jako Device ID, používám konvenci device_${deviceId}`, 'warning');
            username = `device_${deviceId}`;
            document.getElementById('username').value = username;
        }

        if (!password) {
            logger.log('❌ Zadejte Password', 'error');
            alert('⚠️ Zadejte MQTT Password\n\nPokud nemáte password, použijte tlačítko "Autentizovat zařízení" nebo zadejte password ručně.');
            document.getElementById('password').focus();
            return;
        }

        // Get broker URL from server config
        const config = ServerConfig.getConfig();
        const brokerUrl = config.mqtt.url;

        if (!brokerUrl) {
            logger.log('❌ MQTT Broker URL není nastavený v konfiguraci', 'error');
            alert('❌ MQTT Broker URL není nastavený!\n\nVyberte server profil nebo nastavte vlastní konfiguraci.');
            return;
        }

        this._connectInternal(brokerUrl, username, password, deviceId);
    },

    /**
     * Interní metoda pro připojení k MQTT brokeru
     */
    _connectInternal(brokerUrl, username, password, deviceId = null) {
        if (!deviceId) {
            deviceId = this.deviceId || document.getElementById('deviceId').value;
        }

        this.deviceId = deviceId;
        const clientId = `device_${this.deviceId}_${Date.now()}`;

        // Validace credentials
        if (!username) {
            logger.log('❌ MQTT Username není vyplněný', 'error');
            alert('⚠️ Zadejte MQTT Username');
            return;
        }

        if (!password) {
            logger.log('❌ MQTT Password není vyplněný', 'error');
            alert('⚠️ Zadejte MQTT Password\n\nPokud nemáte password, použijte tlačítko "Autentizovat zařízení" nebo zadejte password ručně.');
            return;
        }

        // Validace: username by měl odpovídat Device ID (konvence: device_{deviceId})
        const expectedUsername = `device_${deviceId}`;
        if (username !== expectedUsername && !username.startsWith('device_')) {
            logger.log(`⚠️ VAROVÁNÍ: Username "${username}" neodpovídá Device ID ${deviceId} (očekáváno: ${expectedUsername})`, 'warning');
            logger.log('⚠️ Pokud se nepřipojíte, zkontrolujte, zda username a Device ID jsou správně spárované', 'warning');
        }

        console.log('📡 Broker URL:', brokerUrl);
        console.log('👤 Username:', username);
        console.log('🔑 Password:', password ? '***' : 'PRÁZDNÉ');
        console.log('🆔 Device ID:', deviceId);
        console.log('🆔 Client ID:', clientId);
        console.log('🔍 Očekávaný username (konvence):', expectedUsername);

        const profile = typeof ServerConfig !== 'undefined' ? ServerConfig.getActiveProfile() : 'custom';
        logger.log(`🔌 Připojuji k ${brokerUrl} (${profile})...`, 'info');
        logger.log(`👤 Username: ${username}`, 'info');
        logger.log(`🔑 Password: ${password ? '***' : 'PRÁZDNÉ'}`, password ? 'info' : 'error');

        try {
            this.client = mqtt.connect(brokerUrl, {
                clientId,
                username: username.trim(), // Oříznout mezery
                password: password.trim(), // Oříznout mezery
                clean: true,
                reconnectPeriod: 1000,
                connectTimeout: 10000, // 10 sekund timeout
            });
            console.log('✅ MQTT klient vytvořen:', this.client);
            console.log('📊 Klient stav:', {
                connected: this.client.connected,
                disconnecting: this.client.disconnecting,
                options: {
                    ...this.client.options,
                    password: this.client.options.password ? '***' : undefined
                }
            });
        } catch (error) {
            console.error('❌ Chyba při vytváření klienta:', error);
            logger.log(`❌ Chyba při vytváření MQTT klienta: ${error.message}`, 'error');
            alert(`❌ Chyba při připojování:\n\n${error.message}`);
            return;
        }

        // Zkontrolujme stav klienta po chvíli
        setTimeout(() => {
            if (this.client) {
                console.log('📊 Klient stav po 1s:', {
                    connected: this.client.connected,
                    disconnecting: this.client.disconnecting,
                    reconnecting: this.client.reconnecting
                });
            }
        }, 1000);

        // Přidáme timeout pro připojení (10 sekund)
        const connectionTimeout = setTimeout(() => {
            if (!this.connected) {
                console.error('⏱️ Timeout: Připojení trvá příliš dlouho');
                logger.log('⏱️ Timeout: Připojení trvá příliš dlouho. Zkontrolujte broker URL a credentials.', 'error');
                alert('⏱️ Připojení trvá příliš dlouho.\n\nZkontrolujte:\n1. MQTT broker je spuštěný\n2. Broker URL je správný\n3. Credentials jsou správné');
            }
        }, 10000);

        this.client.on('connect', () => {
            clearTimeout(connectionTimeout);
            console.log('✅ MQTT connect event fired');
            this.connected = true;
            this.updateStatus();
            logger.log('✅ Připojeno k MQTT brokeru', 'success');

            // Aktualizovat status credentials
            const statusDiv = document.getElementById('credentialsStatus');
            const statusText = document.getElementById('credentialsStatusText');
            if (statusDiv && statusText) {
                statusDiv.style.background = '#d1fae5';
                statusText.innerHTML = '<span>✅</span> <span>Připojeno k MQTT brokeru</span>';
                statusText.style.color = '#065f46';
            }

            // Subscribe to command topics
            // Používáme deviceId pro commands (zařízení může přijímat příkazy na kurník)
            // Pro moduly by to mělo být smartcoop/{moduleId}/commands
            const topics = [
                `smartcoop/${this.deviceId}/commands`,
                `smartcoop/${this.deviceId}/system`,
                `smartcoop/${this.deviceId}/config`,
                // Příkazy pro moduly připojené přes toto zařízení
                `smartcoop/${this.deviceId}/modules/+/command`,
                // Status requesty pro moduly
                `smartcoop/${this.deviceId}/modules/+/status_request`,
                // PŘÍMÉ PŘÍKAZY Z FRONTENDU (pro offline debugging)
                `app/commands/+`
            ];

            // Přidat subskripce pro všechny RFID moduly připojené k tomuto zařízení
            // Frontend publikuje na smartcoop/{deviceId}/modules/{moduleId}/command
            this.subscribeToRfidModules();

            topics.forEach(topic => {
                this.client.subscribe(topic, (err) => {
                    if (!err) {
                        logger.log(`📨 Subscribed: ${topic}`, 'success');
                    }
                });
            });

            // Send initial status
            this.publishAllStatus();

            // Přihlásit se k RFID modulům pro příkazy skenování
            this.subscribeToRfidModules();
            // Přihlásit se na kameru v režimu gateway (smartcoop/{deviceId}/camera/#)
            const cameraTopic = `smartcoop/${this.deviceId}/camera/#`;
            this.client.subscribe(cameraTopic, (err) => {
                if (err) {
                    console.error(`[Simulator] Failed to subscribe to camera topic ${cameraTopic}:`, err);
                } else {
                    logger.log(`📡 Naslouchám kamerám na ${cameraTopic}`, 'info');
                }
            });

            document.getElementById('connectBtn').style.display = 'none';
            document.getElementById('disconnectBtn').style.display = 'inline-flex';
        });

        this.client.on('message', (topic, message) => {
            this.handleMessage(topic, message);
        });

        this.client.on('error', (err) => {
            clearTimeout(connectionTimeout);
            console.error('❌ MQTT Error event:', err);
            console.error('❌ Error details:', {
                message: err.message,
                code: err.code,
                errno: err.errno,
                syscall: err.syscall,
                address: err.address,
                port: err.port
            });

            logger.log(`❌ MQTT Error: ${err.message}`, 'error');

            // Aktualizovat status credentials
            const statusDiv = document.getElementById('credentialsStatus');
            const statusText = document.getElementById('credentialsStatusText');
            if (statusDiv && statusText) {
                statusDiv.style.display = 'block';
                statusDiv.style.background = '#fee2e2';

                let errorMessage = err.message;
                if (err.message.includes('Not authorized') || err.message.includes('Connection refused')) {
                    errorMessage = 'Connection refused: Not authorized - Zkontrolujte username a password';
                }

                statusText.innerHTML = `<span>❌</span> <span>Chyba připojení: ${errorMessage}</span>`;
                statusText.style.color = '#991b1b';
            }

            // Zobrazit detailní chybovou zprávu
            let alertMessage = `❌ Chyba připojení k MQTT brokeru:\n\n${err.message}\n\n`;
            if (err.message.includes('Not authorized') || err.message.includes('Connection refused')) {
                alertMessage += 'Možné příčiny:\n';
                alertMessage += '1. Username nebo password jsou nesprávné\n';
                alertMessage += '2. Uživatel neexistuje v Mosquitto\n';
                alertMessage += '3. ACL pravidla neumožňují připojení\n\n';
                alertMessage += 'Řešení:\n';
                alertMessage += '- Zkontrolujte credentials v Management Console\n';
                alertMessage += '- Použijte tlačítko "Autentizovat zařízení"\n';
                alertMessage += '- Zadejte správný username a password ručně';

                // Ukončit automatické reconnecty, aby se uživatel dostal k dialogu
                if (this.client) {
                    try {
                        this.client.end(true);
                    } catch (e) {
                        console.warn('⚠️ Failed to stop MQTT client after auth error:', e);
                    }
                }
                this.connected = false;

                // Vyvolat dialog pro novou autorizaci (pokud je dostupný helper z app.js)
                if (typeof promptDeviceReauth === 'function') {
                    setTimeout(() => promptDeviceReauth(this.deviceId, err.message), 150);
                }
            } else {
                alertMessage += 'Zkontrolujte:\n1. Broker je spuštěný\n2. URL je správné\n3. Credentials jsou správné';
            }

            alert(alertMessage);
        });

        this.client.on('close', () => {
            clearTimeout(connectionTimeout);
            console.log('⚠️ MQTT close event fired');
            console.log('📊 Client state on close:', {
                connected: this.client?.connected,
                disconnecting: this.client?.disconnecting,
                reconnecting: this.client?.reconnecting
            });
            this.connected = false;
            this.updateStatus();
            logger.log('⚠️ Odpojeno od MQTT brokeru', 'warning');

            // Pokud se připojení zavře bez error eventu, může to znamenat problém s autentizací
            if (!this.client?.reconnecting) {
                logger.log('⚠️ Připojení se zavřelo bez error eventu - možný problém s autentizací nebo brokerem', 'warning');
            }
        });

        this.client.on('offline', () => {
            console.log('📴 MQTT offline event fired');
            logger.log('📴 MQTT klient offline', 'warning');
        });

        this.client.on('reconnect', () => {
            console.log('🔄 MQTT reconnect event fired');
            logger.log('🔄 Pokus o opětovné připojení...', 'info');
        });
    },

    disconnect() {
        if (this.client) {
            this.client.end();
            this.client = null;
        }
        this.connected = false;
        this.updateStatus();
        logger.log('🔌 Odpojeno', 'info');

        document.getElementById('connectBtn').style.display = 'inline-flex';
        document.getElementById('disconnectBtn').style.display = 'none';

        // Zobrazit tlačítko pro autentizaci, pokud nejsou credentials uložené
        if (!CredentialsStorage.hasCredentials()) {
            document.getElementById('authBtn').style.display = 'inline-flex';
        }
    },

    updateStatus() {
        const badge = document.getElementById('deviceStatus');
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
        if (!this.isConnected()) return;

        const message = typeof payload === 'string' ? payload : JSON.stringify(payload);

        this.client.publish(topic, message, { qos: 1 }, (err) => {
            if (err) {
                logger.log(`❌ Publish failed: ${err.message}`, 'error');
            }
        });
    },

    handleMessage(topic, message) {
        try {
            let payload;
            try {
                payload = JSON.parse(message.toString());
            } catch (e) {
                // Pokud není JSON, zkusit jako plain string
                payload = { command: message.toString() };
            }

            logger.log(`📨 Message: ${topic}`, 'info');

            // Handle commands
            // Struktura: smartcoop/{deviceId}/commands, smartcoop/{deviceId}/system, smartcoop/{deviceId}/config
            // Moduly: smartcoop/{deviceId}/modules/{moduleId}/command
            // Frontend direct: app/commands/{moduleId}
            if (topic.includes('/camera/')) {
                if (typeof modules !== 'undefined' && typeof modules.handleCameraGatewayMessage === 'function') {
                    modules.handleCameraGatewayMessage(topic, payload, this.deviceId);
                }
            }
            else if (topic.startsWith('app/commands/')) {
                const moduleId = topic.split('/')[2];
                logger.log(`📨 Direct command for module ${moduleId}: ${payload.action || payload.command}`, 'info');

                // Párování RFID tagů (přímo z frontendu – offline/debug)
                if (payload.action === 'start_pairing') {
                    if (typeof chickens !== 'undefined' && typeof chickens.handleRemotePairingRequest === 'function') {
                        chickens.handleRemotePairingRequest(moduleId);
                        return;
                    }
                }
                if (payload.action === 'stop_pairing') {
                    if (typeof chickens !== 'undefined' && typeof chickens.cancelRemotePairing === 'function') {
                        chickens.cancelRemotePairing();
                        return;
                    }
                }
                if (payload.action === 'add_authorized_tag') {
                    const tag = payload?.payload?.tag || payload?.tag;
                    logger.log(`🏷️ add_authorized_tag (simulátor): ${tag || '(missing tag)'}`, 'info');
                    // Simulátor zatím neudržuje whitelist – pouze logujeme.
                    return;
                }

                // Pokud je to příkaz pro dveře (nebo pokud moduleId odpovídá dveřím)
                // Zde bychom ideálně měli zkontrolovat, zda moduleId odpovídá dveřím
                // Ale pro zjednodušení, pokud je akce 'open'/'close', pošleme to na dveře
                const doorActions = ['open', 'close', 'stop', 'toggle', 'updateSettings'];
                if (doorActions.includes(payload.action)) {
                    // Automaticky aktualizovat moduleId dveřím podle příchozího příkazu
                    // Pokud moduleId obsahuje 'door' nebo je to default 'door', aktualizovat
                    if (door.moduleId === 'door' || !door.moduleId || moduleId.includes('door')) {
                        if (door.moduleId !== moduleId) {
                            console.log(`[Simulator] Updating Door moduleId from '${door.moduleId}' to '${moduleId}'`);
                            door.moduleId = moduleId;
                        }
                        door.handleCommand(payload.action, payload);
                        return;
                    }

                    if (door.moduleId === moduleId) {
                        door.handleCommand(payload.action, payload);
                        return;
                    }
                }

                // Pokud to není pro hlavní dveře, zkusit moduly
                if (typeof modules !== 'undefined') {
                    // Simulovat topic strukturu pro modules.handleModuleMessage (command)
                    const simulatedTopic = `smartcoop/${this.deviceId}/modules/${moduleId}/command`;
                    modules.handleModuleMessage(simulatedTopic, payload);
                }
            }
            else if (topic.includes('/modules/')) {
                // Zprávy pro moduly připojené přes toto zařízení
                if (typeof modules !== 'undefined') {
                    modules.handleModuleMessage(topic, payload);
                }
            }
            else if (topic.includes('/commands') || topic.includes('/command')) {
                // Příkazy pro moduly (door, feeder, atd.)
                if (payload.action) {
                    const doorActions = ['open', 'close', 'stop', 'toggle', 'updateSettings'];
                    const feederActions = ['manual_feed', 'feed', 'refill', 'schedule_update'];
                    const cameraActions = ['capture', 'photo', 'take_photo', 'start_recording', 'record_start', 'record', 'stop_recording', 'record_stop', 'stream_on', 'stream_off'];

                    if (doorActions.includes(payload.action)) {
                        door.handleCommand(payload.action, payload);
                    } else if (feederActions.includes(payload.action)) {
                        if (typeof feeder !== 'undefined' && typeof feeder.handleCommand === 'function') {
                            feeder.handleCommand(payload.action, payload);
                        } else {
                            logger.log('⚠️ Feeder modul není dostupný pro zpracování příkazu', 'warning');
                        }
                    } else if (cameraActions.includes(payload.action)) {
                        if (typeof cameraModule !== 'undefined' && typeof cameraModule.handleCommand === 'function') {
                            cameraModule.handleCommand(payload.action, payload);
                        } else {
                            logger.log('⚠️ Kamera modul není dostupný pro zpracování příkazu', 'warning');
                        }
                    } else {
                        // Fallback na door modul pro ostatní legacy příkazy
                        door.handleCommand(payload.action, payload);
                    }
                }
            }
            else if (topic.includes('/system')) {
                // Systémové příkazy
                if (payload.action === 'get_status') {
                    this.publishAllStatus();
                } else if (payload.action === 'restart') {
                    system.restart();
                } else if (payload.action === 'set_rtc') {
                    logger.log(`⏰ RTC čas aktualizován: ${payload.time}`, 'info');
                }
            }
            else if (topic.includes('/config')) {
                logger.log(`⚙️ Config update received`, 'info');
                // Handle config updates
                if (payload.doorAutoMode !== undefined) {
                    document.getElementById('doorAutoMode').checked = payload.doorAutoMode;
                    door.setAutoMode(payload.doorAutoMode);
                }
            }

        } catch (e) {
            logger.log(`⚠️ Failed to parse message: ${e.message}`, 'warning');
        }
    },

    publishAllStatus() {
        setTimeout(() => sensors.publish(), 100);
        setTimeout(() => door.publishStatus(), 200);
        setTimeout(() => chickens.publishStatus(), 300);
        setTimeout(() => {
            if (typeof feeder !== 'undefined' && typeof feeder.publishStatus === 'function') {
                feeder.publishStatus();
            }
        }, 350);
        setTimeout(() => {
            if (typeof cameraModule !== 'undefined' && typeof cameraModule.publishStatus === 'function') {
                cameraModule.publishStatus();
            }
        }, 400);
        setTimeout(() => network.publishStatus(), 450);
        setTimeout(() => {
            if (typeof modules !== 'undefined' && typeof modules.publishAllModulesStatus === 'function') {
                modules.publishAllModulesStatus();
            }
        }, 500);
        setTimeout(() => system.sendHeartbeat(), 550);
    },

    /**
     * Přihlásí se k odběru příkazů pro všechny RFID moduly připojené k zařízení
     */
    async subscribeToRfidModules() {
        if (!this.client || !this.connected || !this.deviceId) return;

        try {
            const config = ServerConfig.getConfig();
            const apiUrl = config.api?.url || 'http://localhost:5555';
            const token = localStorage.getItem('jwt_token');

            if (!token) {
                console.log('[Simulator] No token available for fetching RFID modules');
                return;
            }

            const response = await fetch(`${apiUrl}/api/mqtt/devices/${this.deviceId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const modules = data.device?.mqttModules || [];

                // Najít všechny RFID moduly
                const rfidModules = modules.filter(m =>
                    m.type === 'rfid-gate' || m.type === 'rfid' || m.type === 'rfid-reader'
                );

                this.rfidModules = rfidModules;

                // Přihlásit se k odběru příkazů pro každý RFID modul (nový formát modulových topiců)
                rfidModules.forEach(module => {
                    const moduleId = module.moduleId;
                    if (moduleId) {
                        const topic = `smartcoop/${this.deviceId}/modules/${moduleId}/command`;
                        this.client.subscribe(topic, (err) => {
                            if (!err) {
                                logger.log(`📨 Subscribed to RFID module: ${topic}`, 'success');
                                console.log(`[Simulator] Subscribed to RFID module command topic: ${topic}`);
                            } else {
                                console.error(`[Simulator] Failed to subscribe to ${topic}:`, err);
                            }
                        });
                    }
                });

                if (rfidModules.length > 0) {
                    logger.log(`📡 Přihlášeno k ${rfidModules.length} RFID modulům pro příkazy skenování`, 'info');
                }
            }
        } catch (error) {
            console.warn('[Simulator] Could not fetch RFID modules for subscription:', error);
        }
    }
};

