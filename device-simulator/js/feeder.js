/**
 * Feeder Module Simulation
 * Inspirováno obrazovkou FeederScreen v Expo aplikaci
 */

const feeder = {
    hopperCapacity: 200, // gramů
    state: {
        foodLevel: 75,
        totalDispensedToday: 130,
        lastFeedAt: null,
        lastSettingsSync: null,
        lastUpdate: null,
        manualAmount: 25,
        activeTab: 'overview',
        isSaving: false,
        isDispensing: false,
        lastManualAction: null,
        moduleInfo: null,
        schedules: [
            { id: 'sch-1', time: '07:00', amount: 50, enabled: true },
            { id: 'sch-2', time: '12:00', amount: 30, enabled: true },
            { id: 'sch-3', time: '18:00', amount: 50, enabled: true }
        ]
    },
    elements: {},

    init() {
        this.cacheDom();
        if (!this.elements.card) {
            console.warn('[Feeder] DOM elements not found, skipping init');
            return;
        }
        this.bindStaticEvents();
        this.render();
    },

    cacheDom() {
        this.elements = {
            card: document.getElementById('feederCard'),
            tabButtons: Array.from(document.querySelectorAll('#feederTabButtons button')),
            tabPanels: Array.from(document.querySelectorAll('.feeder-tab-panel')),
            foodLevelValue: document.getElementById('feederFoodLevelValue'),
            foodLevelPercent: document.getElementById('feederFoodLevelPercent'),
            progressFill: document.getElementById('feederProgressFill'),
            lastFeedValue: document.getElementById('feederLastFeedValue'),
            dailyTotalValue: document.getElementById('feederDailyTotalValue'),
            activeSchedulesValue: document.getElementById('feederActiveSchedulesValue'),
            lastSyncValue: document.getElementById('feederLastSync'),
            lastUpdateValue: document.getElementById('feederLastUpdate'),
            levelRange: document.getElementById('feederLevelRange'),
            quickFeedBtn: document.getElementById('feederQuickFeedBtn'),
            scheduleShortcutBtn: document.getElementById('feederScheduleShortcut'),
            refillBtn: document.getElementById('feederRefillBtn'),
            statusBadge: document.getElementById('feederStatusBadge'),
            moduleName: document.getElementById('feederModuleName'),
            moduleId: document.getElementById('feederModuleId'),
            scheduleList: document.getElementById('feederScheduleList'),
            scheduleEmpty: document.getElementById('feederScheduleEmpty'),
            addScheduleBtn: document.getElementById('feederAddScheduleBtn'),
            saveScheduleBtn: document.getElementById('feederSaveScheduleBtn'),
            manualInput: document.getElementById('feederManualInput'),
            manualInfo: document.getElementById('feederManualInfo'),
            presetButtons: document.getElementById('feederPresetButtons'),
            manualFeedBtn: document.getElementById('feederManualFeedBtn'),
            manualButtonsWrapper: document.getElementById('feederManualButtons'),
            simulateJamBtn: document.getElementById('feederSimulateJamBtn'),
            moduleWarning: document.getElementById('feederModuleStatus')
        };
    },

    bindStaticEvents() {
        this.elements.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab');
                this.setActiveTab(tab);
            });
        });

        if (this.elements.quickFeedBtn) {
            this.elements.quickFeedBtn.addEventListener('click', () => this.quickFeed());
        }

        if (this.elements.scheduleShortcutBtn) {
            this.elements.scheduleShortcutBtn.addEventListener('click', () => this.setActiveTab('schedule'));
        }

        if (this.elements.levelRange) {
            this.elements.levelRange.addEventListener('input', (event) => {
                const level = parseInt(event.target.value, 10) || 0;
                this.setFoodLevel(level);
            });
        }

        if (this.elements.refillBtn) {
            this.elements.refillBtn.addEventListener('click', () => this.refill());
        }

        if (this.elements.addScheduleBtn) {
            this.elements.addScheduleBtn.addEventListener('click', () => this.addSchedule());
        }

        if (this.elements.saveScheduleBtn) {
            this.elements.saveScheduleBtn.addEventListener('click', () => this.saveSchedules());
        }

        if (this.elements.manualFeedBtn) {
            this.elements.manualFeedBtn.addEventListener('click', () => this.handleManualFeed());
        }

        if (this.elements.manualInput) {
            this.elements.manualInput.addEventListener('input', (event) => {
                const value = parseInt(event.target.value, 10);
                if (!isNaN(value)) {
                    this.setManualAmount(value);
                }
            });
        }

        if (this.elements.presetButtons) {
            this.elements.presetButtons.addEventListener('click', (event) => {
                const btn = event.target.closest('button[data-amount]');
                if (!btn) return;
                const value = parseInt(btn.getAttribute('data-amount'), 10);
                if (!isNaN(value)) {
                    this.setManualAmount(value);
                }
            });
        }

        if (this.elements.simulateJamBtn) {
            this.elements.simulateJamBtn.addEventListener('click', () => this.simulateJam());
        }
    },

    render() {
        this.setActiveTab(this.state.activeTab, true);
        this.renderStats();
        this.renderScheduleList();
        this.renderManualInfo();
        this.updateModuleMeta();
    },

    renderStats() {
        const level = Math.round(this.state.foodLevel);
        if (this.elements.foodLevelValue) {
            this.elements.foodLevelValue.textContent = `${level}%`;
        }
        if (this.elements.foodLevelPercent) {
            this.elements.foodLevelPercent.textContent = `${level}%`;
        }
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${level}%`;
            if (level <= 20) {
                this.elements.progressFill.style.background = '#ef4444';
            } else if (level <= 50) {
                this.elements.progressFill.style.background = '#f59e0b';
            } else {
                this.elements.progressFill.style.background = '#10b981';
            }
        }
        if (this.elements.levelRange) {
            this.elements.levelRange.value = level;
        }

        if (this.elements.lastFeedValue) {
            this.elements.lastFeedValue.textContent = this.state.lastFeedAt
                ? this.formatRelative(this.state.lastFeedAt)
                : '–';
        }

        if (this.elements.dailyTotalValue) {
            this.elements.dailyTotalValue.textContent = `${this.state.totalDispensedToday} g`;
        }

        if (this.elements.activeSchedulesValue) {
            const active = this.state.schedules.filter(s => s.enabled).length;
            this.elements.activeSchedulesValue.textContent = active.toString();
        }

        if (this.elements.lastSyncValue) {
            this.elements.lastSyncValue.textContent = this.state.lastSettingsSync
                ? this.formatRelative(this.state.lastSettingsSync)
                : '–';
        }

        if (this.elements.lastUpdateValue) {
            this.elements.lastUpdateValue.textContent = this.state.lastUpdate
                ? this.formatRelative(this.state.lastUpdate)
                : '–';
        }

        if (this.elements.quickFeedBtn) {
            this.elements.quickFeedBtn.textContent = `▶️ Nakrmit ${this.state.manualAmount} g`;
            this.elements.quickFeedBtn.disabled = this.state.isDispensing;
        }

        if (this.elements.manualFeedBtn) {
            this.elements.manualFeedBtn.textContent = this.state.isDispensing ? '⏳ Probíhá...' : '▶️ Vydat krmivo';
            this.elements.manualFeedBtn.disabled = this.state.isDispensing;
        }

        if (this.elements.simulateJamBtn) {
            this.elements.simulateJamBtn.disabled = this.state.isDispensing;
        }

        if (this.elements.saveScheduleBtn) {
            this.elements.saveScheduleBtn.textContent = this.state.isSaving ? '💾 Ukládám...' : '💾 Uložit rozvrh';
            this.elements.saveScheduleBtn.disabled = this.state.isSaving;
        }

        if (this.elements.manualInput && !this.elements.manualInput.matches(':focus')) {
            this.elements.manualInput.value = this.state.manualAmount;
        }

        this.updatePresetButtons();
        this.updateStatusBadge();
    },

    renderScheduleList() {
        if (!this.elements.scheduleList) return;

        this.elements.scheduleList.innerHTML = '';

        if (this.state.schedules.length === 0) {
            if (this.elements.scheduleEmpty) this.elements.scheduleEmpty.style.display = 'block';
            return;
        }

        if (this.elements.scheduleEmpty) this.elements.scheduleEmpty.style.display = 'none';

        this.state.schedules.forEach(schedule => {
            const item = document.createElement('div');
            item.className = `feeder-schedule-item${schedule.enabled ? '' : ' disabled'}`;
            item.setAttribute('data-id', schedule.id);
            item.innerHTML = `
                <div>
                    <label>Čas</label>
                    <input type="time" value="${schedule.time}" data-field="time">
                </div>
                <div>
                    <label>Množství</label>
                    <input type="number" min="5" max="200" value="${schedule.amount}" data-field="amount">
                </div>
                <div class="feeder-schedule-actions">
                    <button type="button" class="feeder-toggle ${schedule.enabled ? 'active' : 'inactive'}" data-action="toggle">
                        ${schedule.enabled ? 'Aktivní' : 'Vypnuto'}
                    </button>
                    <button type="button" class="feeder-remove" data-action="remove">🗑️</button>
                </div>
            `;

            const timeInput = item.querySelector('input[data-field="time"]');
            const amountInput = item.querySelector('input[data-field="amount"]');
            const toggleBtn = item.querySelector('button[data-action="toggle"]');
            const removeBtn = item.querySelector('button[data-action="remove"]');

            timeInput.addEventListener('change', (event) => {
                this.updateSchedule(schedule.id, { time: event.target.value || '00:00' });
            });

            amountInput.addEventListener('change', (event) => {
                const value = parseInt(event.target.value, 10) || 0;
                this.updateSchedule(schedule.id, { amount: Math.max(5, value) });
                event.target.value = Math.max(5, value);
            });

            toggleBtn.addEventListener('click', () => this.toggleSchedule(schedule.id));
            removeBtn.addEventListener('click', () => this.removeSchedule(schedule.id));

            this.elements.scheduleList.appendChild(item);
        });
    },

    renderManualInfo() {
        if (!this.elements.manualInfo) return;

        if (!this.state.lastManualAction) {
            this.elements.manualInfo.textContent = 'Žádná';
            return;
        }

        const { description, time } = this.state.lastManualAction;
        this.elements.manualInfo.textContent = `${description} • ${this.formatRelative(time)}`;
    },

    setActiveTab(tab, skipRender = false) {
        if (!tab) return;
        this.state.activeTab = tab;

        this.elements.tabButtons.forEach(btn => {
            const isActive = btn.getAttribute('data-tab') === tab;
            btn.classList.toggle('active', isActive);
        });

        this.elements.tabPanels.forEach(panel => {
            const isActive = panel.getAttribute('data-tab') === tab;
            panel.style.display = isActive ? 'block' : 'none';
        });

        if (!skipRender) {
            this.render();
        }
    },

    setManualAmount(amount) {
        if (Number.isNaN(amount) || amount <= 0) return;
        this.state.manualAmount = amount;
        if (this.elements.manualInput && document.activeElement !== this.elements.manualInput) {
            this.elements.manualInput.value = amount;
        }
        this.renderStats();
    },

    updatePresetButtons() {
        if (!this.elements.presetButtons) return;
        const buttons = Array.from(this.elements.presetButtons.querySelectorAll('button[data-amount]'));
        buttons.forEach(btn => {
            const amount = parseInt(btn.getAttribute('data-amount'), 10);
            btn.classList.toggle('active', amount === this.state.manualAmount);
        });
    },

    addSchedule() {
        const newSchedule = {
            id: `sch-${Date.now()}`,
            time: '08:00',
            amount: 25,
            enabled: true
        };
        this.state.schedules.push(newSchedule);
        this.renderScheduleList();
        this.renderStats();
        this.log('🆕 Přidán nový čas krmení v 08:00');
    },

    updateSchedule(id, updates) {
        this.state.schedules = this.state.schedules.map(schedule =>
            schedule.id === id ? { ...schedule, ...updates } : schedule
        );
        this.renderStats();
        this.publishStatus();
    },

    toggleSchedule(id) {
        this.state.schedules = this.state.schedules.map(schedule =>
            schedule.id === id ? { ...schedule, enabled: !schedule.enabled } : schedule
        );
        this.renderScheduleList();
        this.renderStats();
        this.publishStatus();
    },

    removeSchedule(id) {
        this.state.schedules = this.state.schedules.filter(schedule => schedule.id !== id);
        this.renderScheduleList();
        this.renderStats();
        this.publishStatus();
    },

    saveSchedules() {
        if (this.state.isSaving) return;
        this.state.isSaving = true;
        this.renderStats();

        setTimeout(() => {
            this.state.isSaving = false;
            this.state.lastSettingsSync = new Date();
            this.renderStats();
            this.log('💾 Rozvrh uložen a odeslán do zařízení', 'success');
            this.publishStatus({ event: 'schedule_saved' });
        }, 1200);
    },

    handleManualFeed() {
        const amount = parseInt(this.state.manualAmount, 10);
        if (!amount || amount <= 0) {
            alert('Zadejte množství krmiva v gramech');
            return;
        }
        this.dispense(amount, 'manuální dávka');
    },

    quickFeed() {
        this.dispense(this.state.manualAmount, 'rychlá dávka');
    },

    dispense(amount, description = 'automatická dávka') {
        if (this.state.isDispensing) return;
        if (amount > this.getHopperContent()) {
            this.log('⚠️ Nedostatek krmiva v zásobníku', 'warning');
        }

        this.state.isDispensing = true;
        this.renderStats();

        setTimeout(() => {
            const gramsLeft = Math.max(0, this.getHopperContent() - amount);
            this.state.foodLevel = Math.round((gramsLeft / this.hopperCapacity) * 100);
            this.state.totalDispensedToday = Math.max(0, this.state.totalDispensedToday + amount);
            this.state.lastFeedAt = new Date();
            this.state.lastUpdate = new Date();
            this.state.isDispensing = false;
            this.state.lastManualAction = {
                description: `${description}: ${amount} g`,
                time: new Date()
            };
            this.render();
            this.log(`🌾 Vydáno ${amount} g (${description})`, 'success');
            this.publishStatus({ event: 'manual_feed', amount });
        }, 1000);
    },

    refill() {
        this.state.foodLevel = 100;
        this.state.lastUpdate = new Date();
        this.renderStats();
        this.log('🔄 Zásobník doplněn na 100 %', 'info');
        this.publishStatus({ event: 'refill' });
    },

    simulateJam() {
        this.state.lastManualAction = {
            description: '⚠️ Simulovaný zásek',
            time: new Date()
        };
        this.renderManualInfo();
        this.log('⚠️ Simulován zásek šneku – odešlete technikovi diagnostiku.', 'warning');
        this.publishStatus({ event: 'jam_detected' });
    },

    setFoodLevel(level) {
        this.state.foodLevel = Math.min(100, Math.max(0, level));
        this.state.lastUpdate = new Date();
        this.renderStats();
        this.publishStatus({ event: 'level_adjusted' });
    },

    getHopperContent() {
        return Math.round((this.state.foodLevel / 100) * this.hopperCapacity);
    },

    updateStatusBadge() {
        if (!this.elements.statusBadge) return;
        const status = this.getConnectionState();
        this.elements.statusBadge.classList.remove('online', 'offline', 'sync');

        if (status === 'online') {
            this.elements.statusBadge.classList.add('online');
            this.elements.statusBadge.textContent = '🟢 Připojeno';
        } else if (status === 'sync') {
            this.elements.statusBadge.classList.add('sync');
            this.elements.statusBadge.textContent = '🔄 Synchronizace';
        } else {
            this.elements.statusBadge.classList.add('offline');
            this.elements.statusBadge.textContent = '⚫ Odpojeno';
        }
    },

    getConnectionState() {
        if (!this.state.moduleInfo) return 'offline';
        if (this.state.isSaving) return 'sync';

        const moduleStatus = this.state.moduleInfo.status || 'offline';
        if (moduleStatus === 'online') return 'online';

        if (typeof simulator !== 'undefined' && simulator.isConnected && simulator.isConnected()) {
            return 'online';
        }
        return 'offline';
    },

    updateModuleMeta() {
        if (this.elements.moduleName) {
            this.elements.moduleName.textContent = this.state.moduleInfo?.name || 'Simulované krmítko';
        }
        if (this.elements.moduleId) {
            const moduleId = this.state.moduleInfo?.moduleId || '-';
            this.elements.moduleId.textContent = `ID: ${moduleId}`;
        }
        if (this.elements.moduleWarning) {
            this.elements.moduleWarning.style.display = this.state.moduleInfo ? 'none' : 'block';
        }
    },

    attachModule(module) {
        this.state.moduleInfo = module || null;
        this.updateModuleMeta();
        this.renderStats();
    },

    handleCommand(action, payload = {}) {
        let success = true;

        switch (action) {
            case 'manual_feed':
            case 'feed':
                this.dispense(payload.amount || 25, 'MQTT příkaz');
                break;
            case 'refill':
                this.refill();
                break;
            case 'schedule_update':
                if (Array.isArray(payload.schedules)) {
                    this.state.schedules = payload.schedules.map((item, index) => ({
                        id: item.id || `sch-${index}`,
                        time: item.time || '00:00',
                        amount: item.amount || 20,
                        enabled: item.enabled !== false
                    }));
                    this.state.lastSettingsSync = new Date();
                    this.state.lastUpdate = new Date();
                    this.renderScheduleList();
                    this.renderStats();
                    this.log('🔄 Rozvrh aktualizován z aplikace (MQTT)', 'info');
                    this.publishStatus({ event: 'schedule_applied' });
                }
                break;
            default:
                this.log(`ℹ️ Neznámý příkaz pro krmítko: ${action}`, 'info');
                success = false;
        }

        // Send ACK - Device Shadow pattern
        if (typeof simulator !== 'undefined' && simulator.isConnected && simulator.isConnected()) {
            const moduleId = this.state.moduleInfo?.moduleId || 'feeder-sim';
            const ackTopic = `smartcoop/${simulator.deviceId}/modules/${moduleId}/command_ack`;
            simulator.publish(ackTopic, {
                commandId: payload.requestId || payload.commandId,
                requestId: payload.requestId || payload.commandId,
                moduleId,
                action,
                success,
                status: success ? 'success' : 'unknown_command',
                timestamp: Date.now()
            });
            console.log(`[Feeder] Command ACK sent to ${ackTopic}`);
        }
    },

    publishStatus(extra = {}) {
        if (typeof simulator === 'undefined' || !simulator.isConnected || !simulator.isConnected()) return;
        if (!this.state.moduleInfo) return;

        const moduleId = this.state.moduleInfo.moduleId || 'feeder-sim';
        const topic = `smartcoop/${simulator.deviceId}/modules/${moduleId}/status`;
        const payload = {
            moduleId,
            type: 'feeder',
            status: this.getConnectionState(),
            foodLevel: this.state.foodLevel,
            totalDispensedToday: this.state.totalDispensedToday,
            lastFeedAt: this.state.lastFeedAt ? new Date(this.state.lastFeedAt).toISOString() : null,
            lastSettingsSync: this.state.lastSettingsSync ? new Date(this.state.lastSettingsSync).toISOString() : null,
            schedules: this.state.schedules.map(schedule => ({
                id: schedule.id,
                time: schedule.time,
                amount: schedule.amount,
                enabled: schedule.enabled
            })),
            timestamp: new Date().toISOString(),
            ...extra
        };

        simulator.publish(topic, payload);
    },

    formatRelative(date) {
        const value = typeof date === 'string' ? new Date(date) : date;
        if (!value) return '–';
        const diffMs = Date.now() - value.getTime();
        const minutes = Math.floor(diffMs / 60000);
        if (minutes < 1) return 'Právě teď';
        if (minutes < 60) return `Před ${minutes} min`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Před ${hours} h`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `Před ${days} d`;
        return value.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
    },

    log(message, level = 'info') {
        if (typeof logger !== 'undefined') {
            logger.log(message, level);
        } else {
            console.log(message);
        }
    }
};
