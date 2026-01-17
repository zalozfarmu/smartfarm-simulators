/**
 * Door Simulation with Smart Timer
 */

const door = {
    state: 'closed', // closed, opening, open, closing
    position: 0, // 0-100%
    autoMode: false,
    interval: null,
    lastUpdate: null,
    lastSettingsSync: null,

    // Smart scheduling
    mode: 'sun', // 'timer' nebo 'sun'
    enabled: true, // Zapnuto/vypnuto automatické ovládání
    openTime: '06:00',
    closeTime: '21:00',
    openOffset: 0, // Offset v minutách (+ nebo -)
    closeOffset: 0,
    sunTimes: null, // { sunrise: '05:30', sunset: '20:45' }
    sunTimesTable: [], // Tabulka časů pro celý rok [{ date, sunrise, sunset }]
    schedulerTimer: null,
    nextScheduledAction: null, // { action: 'open'|'close', time: 'HH:MM', timestamp: number }

    init() {
        this.loadSettings();
        this.update();
        this.syncUIWithSettings();
        this.startScheduler();
        this.setupModeChangeHandler();
    },

    /**
     * Synchronizuje UI s nastaveními
     */
    syncUIWithSettings() {
        const modeSelect = document.getElementById('doorMode');
        const enabledCheckbox = document.getElementById('doorEnabled');
        const openTimeInput = document.getElementById('doorOpenTime');
        const closeTimeInput = document.getElementById('doorCloseTime');
        const openOffsetInput = document.getElementById('doorOpenOffset');
        const closeOffsetInput = document.getElementById('doorCloseOffset');

        if (modeSelect) modeSelect.value = this.mode;
        if (enabledCheckbox) enabledCheckbox.checked = this.enabled;
        if (openTimeInput) openTimeInput.value = this.openTime;
        if (closeTimeInput) closeTimeInput.value = this.closeTime;
        if (openOffsetInput) openOffsetInput.value = this.openOffset;
        if (closeOffsetInput) closeOffsetInput.value = this.closeOffset;

        this.updateModeDisplay();
    },

    /**
     * Nastaví handler pro změnu režimu
     */
    setupModeChangeHandler() {
        const modeSelect = document.getElementById('doorMode');
        if (modeSelect) {
            modeSelect.addEventListener('change', () => {
                this.updateModeDisplay();
            });
        }
        this.updateModeDisplay(); // Inicializovat
    },

    /**
     * Aktualizuje zobrazení podle vybraného režimu
     */
    updateModeDisplay() {
        const timerSettings = document.getElementById('doorTimerSettings');
        const sunSettings = document.getElementById('doorSunSettings');

        if (this.mode === 'timer') {
            if (timerSettings) timerSettings.style.display = 'block';
            if (sunSettings) sunSettings.style.display = 'none';
        } else {
            if (timerSettings) timerSettings.style.display = 'none';
            if (sunSettings) sunSettings.style.display = 'block';
        }
    },

    update() {
        const visual = document.getElementById('doorVisual');
        const stateLabel = document.getElementById('doorState');
        const positionLabel = document.getElementById('doorPosition');

        visual.className = 'door ' + this.state;

        const labels = {
            'closed': 'ZAVŘENO',
            'opening': 'OTVÍRÁ SE',
            'open': 'OTEVŘENO',
            'closing': 'ZAVÍRÁ SE'
        };
        visual.querySelector('.door-label').textContent = labels[this.state];

        stateLabel.textContent = this.state;
        stateLabel.className = 'badge badge-' + (this.state === 'open' ? 'success' : this.state === 'closed' ? 'danger' : 'warning');

        positionLabel.textContent = this.position + '%';
    },

    open() {
        if (this.state === 'open') return;

        this.state = 'opening';
        this.lastUpdate = new Date();
        this.update();
        logger.log('🚪 Dveře se otvírají', 'info');

        this.stopMovement();
        this.interval = setInterval(() => {
            this.position += 5;
            if (this.position >= 100) {
                this.position = 100;
                this.state = 'open';
                this.stopMovement();
                this.lastUpdate = new Date();
                logger.log('🚪 Dveře otevřeny', 'success');
            }
            this.update();
            this.publishStatus();
        }, 100);
    },

    close() {
        if (this.state === 'closed') return;

        this.state = 'closing';
        this.lastUpdate = new Date();
        this.update();
        logger.log('🚪 Dveře se zavírají', 'info');

        this.stopMovement();
        this.interval = setInterval(() => {
            this.position -= 5;
            if (this.position <= 0) {
                this.position = 0;
                this.state = 'closed';
                this.stopMovement();
                this.lastUpdate = new Date();
                logger.log('🚪 Dveře zavřeny', 'success');
            }
            this.update();
            this.publishStatus();
        }, 100);
    },

    stop() {
        this.stopMovement();
        this.state = this.position > 50 ? 'open' : 'closed';
        this.lastUpdate = new Date();
        this.update();
        this.publishStatus();
        logger.log('🚪 Dveře zastaveny', 'warning');
    },

    stopMovement() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    },

    setAutoMode(enabled) {
        this.autoMode = enabled;
        this.lastUpdate = new Date();
        logger.log(`🚪 Auto režim ${enabled ? 'zapnut' : 'vypnut'}`, 'info');
        // Auto mode změna se publikuje jako status update
        if (simulator.isConnected()) {
            this.publishStatus();
        }
    },

    moduleId: 'door', // Default moduleId, can be overwritten

    publishStatus(extra = {}) {
        if (simulator.isConnected()) {
            // Status pro door modul: smartcoop/{deviceId}/modules/{moduleId}/status
            // Pokud není moduleId, použije se fallback na smartcoop/{deviceId}/status
            const topic = this.moduleId
                ? `smartcoop/${simulator.deviceId}/modules/${this.moduleId}/status`
                : `smartcoop/${simulator.deviceId}/status`;

            const payload = {
                moduleId: this.moduleId,
                doorStatus: this.state,
                doorPosition: this.position,
                doorAutoMode: this.autoMode,
                doorControl: {
                    mode: this.mode,
                    enabled: this.enabled,
                    openTime: this.openTime,
                    closeTime: this.closeTime,
                    openOffset: this.openOffset,
                    closeOffset: this.closeOffset,
                },
                lastUpdate: this.lastUpdate ? new Date(this.lastUpdate).toISOString() : null,
                lastSettingsSync: this.lastSettingsSync ? new Date(this.lastSettingsSync).toISOString() : null,
                timestamp: Date.now(),
                // Přidat i action/status pro kompatibilitu s RealtimeDataContext
                action: this.state,
                status: this.state,
                ...extra
            };
            simulator.publish(topic, payload);

            // Pro kompatibilitu s přímým posíláním na user topic (pokud známe userId)
            // Toto je hack pro offline debugging bez backendu
            const userId = localStorage.getItem('debug_userId');
            if (userId && this.moduleId) {
                const directTopic = `user/${userId}/coop/${simulator.deviceId}/device/${this.moduleId}/status`;
                simulator.publish(directTopic, payload);
                console.log('[Door] Published direct status to:', directTopic);
            }
        }
    },

    handleCommand(action, payload = {}) {
        logger.log(`📨 Příkaz přijat: ${action}`, 'info');
        let success = true;

        switch (action) {
            case 'open':
                this.open();
                break;
            case 'close':
                this.close();
                break;
            case 'stop':
                this.stop();
                break;
            case 'toggle':
                if (this.state === 'closed' || this.state === 'closing') {
                    this.open();
                } else {
                    this.close();
                }
                break;
            case 'updateSettings':
                if (payload.mode) this.mode = payload.mode;
                if (payload.openTime) this.openTime = payload.openTime;
                if (payload.closeTime) this.closeTime = payload.closeTime;
                if (payload.openOffset !== undefined) this.openOffset = payload.openOffset;
                if (payload.closeOffset !== undefined) this.closeOffset = payload.closeOffset;
                if (payload.enabled !== undefined) this.enabled = payload.enabled;
                this.saveSettings();
                this.calculateNextAction();
                this.lastSettingsSync = new Date();
                this.lastUpdate = new Date();
                this.publishStatus({ event: 'settings_applied' });
                logger.log('⚙️ Nastavení dveří aktualizováno', 'success');
                break;
            default:
                logger.log(`⚠️ Neznámý příkaz pro dveře: ${action}`, 'warning');
                success = false;
                break;
        }

        // Send ACK - Device Shadow pattern: smartcoop/{deviceId}/command_ack
        if (simulator.isConnected()) {
            // Command ACK for Device Shadow
            const ackTopic = `smartcoop/${simulator.deviceId}/command_ack`;
            simulator.publish(ackTopic, {
                commandId: payload.requestId || payload.commandId,
                requestId: payload.requestId || payload.commandId,
                action,
                success,
                status: success ? 'success' : 'unknown_command',
                timestamp: Date.now()
            });
            console.log(`[Door] Command ACK sent to ${ackTopic}`);

            if (this.moduleId) {
                const moduleAckTopic = `smartcoop/${simulator.deviceId}/modules/${this.moduleId}/command_ack`;
                simulator.publish(moduleAckTopic, {
                    commandId: payload.requestId || payload.commandId,
                    requestId: payload.requestId || payload.commandId,
                    moduleId: this.moduleId,
                    action,
                    success,
                    status: success ? 'success' : 'unknown_command',
                    timestamp: Date.now()
                });
                console.log(`[Door] Module Command ACK sent to ${moduleAckTopic}`);
            }

            // Also send legacy response for backwards compatibility
            const responseTopic = `smartcoop/${simulator.deviceId}/response`;
            simulator.publish(responseTopic, {
                requestId: payload.requestId || `req_${Date.now()}`,
                action,
                status: 'success',
                timestamp: Date.now()
            });
        }
    },

    /**
     * Načte nastavení z localStorage
     */
    loadSettings() {
        const deviceId = simulator.deviceId || 'default';
        const storageKey = `device_${deviceId}_door_settings`;

        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const settings = JSON.parse(stored);
                this.mode = settings.mode || 'sun';
                this.enabled = settings.enabled !== undefined ? settings.enabled : true;
                this.openTime = settings.openTime || '06:00';
                this.closeTime = settings.closeTime || '21:00';
                this.openOffset = settings.openOffset || 0;
                this.closeOffset = settings.closeOffset || 0;
                this.sunTimesTable = settings.sunTimesTable || [];
                console.log('[Door] Nastavení načteno z localStorage');
            }
        } catch (error) {
            console.error('[Door] Chyba při načítání nastavení:', error);
        }
    },

    /**
     * Uloží nastavení do localStorage
     */
    saveSettings() {
        const deviceId = simulator.deviceId || 'default';
        const storageKey = `device_${deviceId}_door_settings`;

        try {
            const settings = {
                mode: this.mode,
                enabled: this.enabled,
                openTime: this.openTime,
                closeTime: this.closeTime,
                openOffset: this.openOffset,
                closeOffset: this.closeOffset,
                sunTimesTable: this.sunTimesTable
            };
            localStorage.setItem(storageKey, JSON.stringify(settings));
            console.log('[Door] Nastavení uloženo do localStorage');
        } catch (error) {
            console.error('[Door] Chyba při ukládání nastavení:', error);
        }
    },

    /**
     * Spustí scheduler pro automatické ovládání
     */
    startScheduler() {
        if (this.schedulerTimer) {
            clearInterval(this.schedulerTimer);
        }

        this.calculateNextAction();

        // Kontrola každou minutu
        this.schedulerTimer = setInterval(() => {
            if (!this.enabled) return;

            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            if (this.nextScheduledAction && this.nextScheduledAction.time === currentTime) {
                if (this.nextScheduledAction.action === 'open') {
                    logger.log('🌅 Automatické otevření dveří (naplánováno)', 'info');
                    this.open();
                } else {
                    logger.log('🌆 Automatické zavření dveří (naplánováno)', 'info');
                    this.close();
                }
                // Přepočítat další akci
                setTimeout(() => this.calculateNextAction(), 1000);
            }
        }, 60000); // Každou minutu

        console.log('[Door] Scheduler spuštěn');
    },

    /**
     * Vypočítá další naplánovanou akci
     */
    calculateNextAction() {
        if (!this.enabled) {
            this.nextScheduledAction = null;
            this.updateScheduleDisplay();
            return;
        }

        const now = new Date();
        let openTime, closeTime;

        if (this.mode === 'sun' && this.sunTimes) {
            // Použít časy slunce + offset
            openTime = this.calculateTimeWithOffset(this.sunTimes.sunrise, this.openOffset);
            closeTime = this.calculateTimeWithOffset(this.sunTimes.sunset, this.closeOffset);
        } else if (this.mode === 'sun' && this.sunTimesTable.length > 0) {
            // Najít dnešní časy v tabulce
            const today = now.toISOString().split('T')[0];
            const todayEntry = this.sunTimesTable.find(e => e.date === today);
            if (todayEntry) {
                openTime = this.calculateTimeWithOffset(todayEntry.sunrise, this.openOffset);
                closeTime = this.calculateTimeWithOffset(todayEntry.sunset, this.closeOffset);
            } else {
                // Fallback na pevné časy
                openTime = this.openTime;
                closeTime = this.closeTime;
            }
        } else {
            // Timer režim - pevné časy
            openTime = this.openTime;
            closeTime = this.closeTime;
        }

        // Vytvořit Date objekty pro dnes
        const [openHours, openMinutes] = openTime.split(':').map(Number);
        const [closeHours, closeMinutes] = closeTime.split(':').map(Number);

        const openDate = new Date(now);
        openDate.setHours(openHours, openMinutes, 0, 0);

        const closeDate = new Date(now);
        closeDate.setHours(closeHours, closeMinutes, 0, 0);

        // Najít nejbližší budoucí akci
        const actions = [
            { action: 'open', time: openTime, timestamp: openDate.getTime() },
            { action: 'close', time: closeTime, timestamp: closeDate.getTime() }
        ];

        // Pokud je čas v minulosti, přidat den
        actions.forEach(a => {
            if (a.timestamp < now.getTime()) {
                a.timestamp += 24 * 60 * 60 * 1000;
            }
        });

        // Seřadit podle času a vybrat nejbližší
        actions.sort((a, b) => a.timestamp - b.timestamp);
        this.nextScheduledAction = actions[0];

        console.log('[Door] Další naplánovaná akce:', this.nextScheduledAction);
        this.updateScheduleDisplay();
    },

    /**
     * Vypočítá čas s offsetem
     */
    calculateTimeWithOffset(time, offsetMinutes) {
        const [hours, minutes] = time.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        date.setMinutes(date.getMinutes() + offsetMinutes);

        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    },

    /**
     * Aktualizuje zobrazení plánu
     */
    updateScheduleDisplay() {
        const scheduleEl = document.getElementById('doorScheduleDisplay');
        const nextActionEl = document.getElementById('doorNextAction');

        if (!scheduleEl || !nextActionEl) return;

        if (!this.enabled) {
            scheduleEl.textContent = 'Automatika vypnuta';
            nextActionEl.textContent = '-';
            return;
        }

        if (this.mode === 'sun') {
            scheduleEl.textContent = '☀️ Režim podle slunce';
        } else {
            scheduleEl.textContent = '⏰ Režim časovače';
        }

        if (this.nextScheduledAction) {
            const actionText = this.nextScheduledAction.action === 'open' ? '🌅 Otevření' : '🌆 Zavření';
            nextActionEl.textContent = `${actionText} v ${this.nextScheduledAction.time}`;
        } else {
            nextActionEl.textContent = '-';
        }
    },

    /**
     * Načte časy slunce z API
     */
    async loadSunTimesFromApi(coopId) {
        try {
            const config = ServerConfig.getConfig();
            const apiUrl = config.api?.url || 'http://localhost:5555';
            const token = localStorage.getItem('jwt_token');

            if (!token) {
                logger.log('⚠️ Pro načtení časů slunce je potřeba být přihlášen', 'warning');
                return;
            }

            logger.log('🌅 Načítám časy slunce z API...', 'info');

            const response = await fetch(`${apiUrl}/api/coops/${coopId}/sun-times`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.times && Array.isArray(data.times)) {
                this.sunTimesTable = data.times.map(entry => ({
                    date: entry.date || entry.d,
                    sunrise: entry.sunrise || entry.sr,
                    sunset: entry.sunset || entry.ss
                }));

                // Použít dnešní časy pro sunTimes
                const today = new Date().toISOString().split('T')[0];
                const todayEntry = this.sunTimesTable.find(e => e.date === today);
                if (todayEntry) {
                    this.sunTimes = {
                        sunrise: todayEntry.sunrise,
                        sunset: todayEntry.sunset
                    };
                }

                this.saveSettings();
                this.calculateNextAction();
                this.lastSettingsSync = new Date();
                this.lastUpdate = new Date();
                this.publishStatus({ event: 'settings_saved' });

                logger.log(`✅ Načteno ${this.sunTimesTable.length} časů slunce`, 'success');
            }
        } catch (error) {
            console.error('[Door] Chyba při načítání časů slunce:', error);
            logger.log(`❌ Chyba při načítání časů slunce: ${error.message}`, 'error');
        }
    }
};

