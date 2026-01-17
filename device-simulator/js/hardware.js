/**
 * Hardware Status Module
 * Simuluje stav fyzických komponent připojených kabelem k ESP32
 *
 * Komponenty:
 * - RTC DS3231 (I2C)
 * - SD Karta (SPI)
 * - RFID Readers (Wiegand 26-bit, GPIO)
 * - Egg Buttons (GPIO)
 * - GSM SIM800L (UART)
 */

const hardware = {
    // Hardware state
    state: {
        rtc: {
            ok: true,
            time: new Date(),
            drift: 0, // drift in seconds from server time
            lastSync: null
        },
        sdCard: {
            ok: true,
            capacity: 32 * 1024, // 32 GB in MB
            free: 28.5 * 1024,   // 28.5 GB in MB
            mounted: true
        },
        rfidReaders: {
            in: { ok: true, lastScan: null, errorCount: 0 },
            out: { ok: true, lastScan: null, errorCount: 0 },
            nest1: { ok: true, lastScan: null, errorCount: 0 },
            nest2: { ok: true, lastScan: null, errorCount: 0 }
        },
        eggButtons: {
            nest1: { pressed: false, lastPress: null },
            nest2: { pressed: false, lastPress: null }
        },
        gsm: {
            ok: true,
            uart: 'GPIO 16/17',
            baudRate: 9600,
            atResponding: true
        },
        pendingChickens: [] // Unknown RFID tags waiting for user approval
    },

    // Update interval
    updateInterval: null,

    /**
     * Initialize hardware simulation
     */
    init() {
        console.log('[HARDWARE] Initializing hardware simulation...');

        // Start RTC clock simulation
        this.startRtcSimulation();

        // Update UI initially
        this.updateUI();

        // Start periodic UI updates
        this.updateInterval = setInterval(() => this.updateUI(), 1000);

        logger.info('Hardware simulation initialized');
    },

    /**
     * Start RTC clock simulation
     */
    startRtcSimulation() {
        // Sync RTC time with system time (with small random drift)
        this.state.rtc.time = new Date();
        this.state.rtc.drift = Math.random() * 2 - 1; // -1 to +1 seconds initial drift
        this.state.rtc.lastSync = new Date();
    },

    /**
     * Get current RTC time (with drift)
     */
    getRtcTime() {
        if (!this.state.rtc.ok) return null;

        const now = new Date();
        const driftMs = this.state.rtc.drift * 1000;
        return new Date(now.getTime() + driftMs);
    },

    /**
     * Set RTC error state
     */
    setRtcError(hasError) {
        this.state.rtc.ok = !hasError;
        this.updateUI();

        if (hasError) {
            logger.warning('RTC DS3231 - simulating error (I2C communication failed)');
        } else {
            logger.info('RTC DS3231 - error cleared');
        }
    },

    /**
     * Set SD card error state
     */
    setSdCardError(hasError) {
        this.state.sdCard.ok = !hasError;
        this.state.sdCard.mounted = !hasError;
        this.updateUI();

        if (hasError) {
            logger.warning('SD Card - simulating disconnection');
        } else {
            logger.info('SD Card - reconnected');
        }
    },

    /**
     * Set RFID reader error state
     */
    setRfidReaderError(reader, hasError) {
        if (this.state.rfidReaders[reader]) {
            this.state.rfidReaders[reader].ok = !hasError;
            if (hasError) {
                this.state.rfidReaders[reader].errorCount++;
            }
            this.updateUI();
        }
    },

    /**
     * Set GSM module error state
     */
    setGsmError(hasError) {
        this.state.gsm.ok = !hasError;
        this.state.gsm.atResponding = !hasError;
        this.updateUI();

        if (hasError) {
            logger.warning('GSM SIM800L - simulating error (AT commands not responding)');
        } else {
            logger.info('GSM SIM800L - error cleared');
        }
    },

    /**
     * Simulate egg button press
     */
    pressEggButton(nestNumber) {
        const nest = nestNumber === 1 ? 'nest1' : 'nest2';
        this.state.eggButtons[nest].pressed = true;
        this.state.eggButtons[nest].lastPress = new Date();

        // Update UI immediately
        const statusEl = document.getElementById(`eggButton${nestNumber}Status`);
        if (statusEl) {
            statusEl.textContent = 'Pressed!';
            statusEl.className = 'badge badge-danger';
        }

        logger.event(`Egg button ${nestNumber} pressed - simulating egg detection in nest ${nestNumber}`);

        // Get current chicken in nest (if any) and trigger egg detection
        this.triggerEggDetection(nestNumber);

        // Reset button state after 500ms
        setTimeout(() => {
            this.state.eggButtons[nest].pressed = false;
            if (statusEl) {
                statusEl.textContent = 'Idle';
                statusEl.className = 'badge badge-secondary';
            }
        }, 500);
    },

    /**
     * Trigger egg detection event via MQTT
     */
    triggerEggDetection(nestNumber) {
        if (!simulator || !simulator.isConnected) {
            logger.warning('Cannot send egg detection - not connected to MQTT');
            return;
        }

        // Get current chicken in nest from chickens module (if available)
        let chickenInNest = null;
        if (typeof chickens !== 'undefined') {
            const knownChickens = Array.isArray(chickens.localChickens) ? chickens.localChickens : [];

            // Prefer slepici, která je aktuálně uvnitř (typicky sedí v hnízdě)
            chickenInNest = knownChickens.find(c => chickens.chickensInside?.has?.(c.tagId));

            // Fallback: první známá slepice, abychom alespoň poslali tagId/chickenName
            if (!chickenInNest && knownChickens.length > 0) {
                chickenInNest = knownChickens[0];
            }
        }

        const deviceId = simulator.deviceId || document.getElementById('deviceId')?.value || '123';
        const moduleId = `NEST${nestNumber}`;

        const topic = `smartcoop/${deviceId}/modules/${moduleId}/egg_detected`;
        const payload = {
            nestNumber: nestNumber,
            chickenId: chickenInNest?.serverId || chickenInNest?.id || null,
            chickenName: chickenInNest?.name || null,
            tagId: chickenInNest?.tagId || null,
            timestamp: new Date().toISOString()
        };

        simulator.client.publish(topic, JSON.stringify(payload));
        logger.mqtt(`Published egg detection to ${topic}`);

        // Also update smart counter if available
        if (typeof smartCounter !== 'undefined' && chickenInNest) {
            smartCounter.recordEgg(chickenInNest.id || chickenInNest.name);
        }
    },

    /**
     * Simulate unknown RFID tag scan
     */
    simulateUnknownTag() {
        if (!simulator || !simulator.isConnected) {
            logger.warning('Cannot send RFID scan - not connected to MQTT');
            return;
        }

        // Generate random tag ID
        const tagId = this.generateRandomTagId();

        const deviceId = simulator.deviceId || document.getElementById('deviceId')?.value || '123';
        const moduleId = 'RFID_IN'; // Use RFID IN reader

        const topic = `smartcoop/${deviceId}/modules/${moduleId}/rfid_scan`;
        const payload = {
            tagId: tagId,
            direction: 'in',
            timestamp: new Date().toISOString()
        };

        simulator.client.publish(topic, JSON.stringify(payload));
        logger.mqtt(`Published unknown RFID tag to ${topic}: ${tagId}`);

        // Add to pending chickens list locally
        this.addPendingChicken(tagId, moduleId);
    },

    /**
     * Generate random RFID tag ID (Wiegand 26-bit format)
     */
    generateRandomTagId() {
        // Wiegand 26-bit: 8-bit facility code + 16-bit card number
        const facilityCode = Math.floor(Math.random() * 256);
        const cardNumber = Math.floor(Math.random() * 65536);

        // Format as hex string
        return `${facilityCode.toString(16).padStart(2, '0').toUpperCase()}${cardNumber.toString(16).padStart(4, '0').toUpperCase()}`;
    },

    /**
     * Add pending chicken to local list
     */
    addPendingChicken(tagId, moduleId) {
        // Check if already exists
        const existing = this.state.pendingChickens.find(p => p.tagId === tagId);
        if (existing) {
            existing.lastSeenAt = new Date();
            existing.scanCount++;
        } else {
            this.state.pendingChickens.push({
                tagId: tagId,
                moduleId: moduleId,
                firstSeenAt: new Date(),
                lastSeenAt: new Date(),
                scanCount: 1
            });
        }

        this.updatePendingChickensUI();
    },

    /**
     * Remove pending chicken from local list (when approved via API)
     */
    removePendingChicken(tagId) {
        this.state.pendingChickens = this.state.pendingChickens.filter(p => p.tagId !== tagId);
        this.updatePendingChickensUI();
    },

    /**
     * Update pending chickens UI
     */
    updatePendingChickensUI() {
        const countEl = document.getElementById('pendingChickensCount');
        const listEl = document.getElementById('pendingChickensList');

        if (countEl) {
            countEl.textContent = this.state.pendingChickens.length;
            countEl.className = this.state.pendingChickens.length > 0 ? 'badge badge-warning' : 'badge badge-secondary';
        }

        if (listEl) {
            if (this.state.pendingChickens.length === 0) {
                listEl.innerHTML = '<div style="text-align: center; padding: 8px; color: #9ca3af;">Žádné neznámé tagy</div>';
            } else {
                listEl.innerHTML = this.state.pendingChickens.map(p => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px; background: white; border-radius: 4px; margin-bottom: 4px;">
                        <div>
                            <span style="font-family: monospace; font-weight: 600;">${p.tagId}</span>
                            <span style="font-size: 10px; color: #9ca3af; margin-left: 6px;">(${p.scanCount}x)</span>
                        </div>
                        <span style="font-size: 10px; color: #6b7280;">${p.moduleId}</span>
                    </div>
                `).join('');
            }
        }
    },

    /**
     * Update all hardware status UI elements
     */
    updateUI() {
        // RTC
        const rtcStatusBadge = document.getElementById('rtcStatusBadge');
        const rtcTime = document.getElementById('rtcTime');
        const rtcDrift = document.getElementById('rtcDrift');

        if (rtcStatusBadge) {
            if (this.state.rtc.ok) {
                rtcStatusBadge.textContent = 'OK';
                rtcStatusBadge.className = 'badge badge-success';
            } else {
                rtcStatusBadge.textContent = 'ERROR';
                rtcStatusBadge.className = 'badge badge-danger';
            }
        }

        if (rtcTime) {
            const time = this.getRtcTime();
            rtcTime.textContent = time ? time.toLocaleTimeString('cs-CZ') : 'N/A';
        }

        if (rtcDrift) {
            rtcDrift.textContent = this.state.rtc.ok ? `${this.state.rtc.drift.toFixed(1)}s` : 'N/A';
        }

        // SD Card
        const sdCardStatusBadge = document.getElementById('sdCardStatusBadge');
        const sdCardCapacity = document.getElementById('sdCardCapacity');
        const sdCardFree = document.getElementById('sdCardFree');

        if (sdCardStatusBadge) {
            if (this.state.sdCard.ok) {
                sdCardStatusBadge.textContent = 'Připojena';
                sdCardStatusBadge.className = 'badge badge-success';
            } else {
                sdCardStatusBadge.textContent = 'Odpojeno';
                sdCardStatusBadge.className = 'badge badge-danger';
            }
        }

        if (sdCardCapacity) {
            sdCardCapacity.textContent = this.state.sdCard.ok ? `${(this.state.sdCard.capacity / 1024).toFixed(0)} GB` : 'N/A';
        }

        if (sdCardFree) {
            sdCardFree.textContent = this.state.sdCard.ok ? `${(this.state.sdCard.free / 1024).toFixed(1)} GB` : 'N/A';
        }

        // RFID Readers
        const rfidReadersStatusBadge = document.getElementById('rfidReadersStatusBadge');
        const rfidInStatus = document.getElementById('rfidInStatus');
        const rfidOutStatus = document.getElementById('rfidOutStatus');
        const rfidNest1Status = document.getElementById('rfidNest1Status');
        const rfidNest2Status = document.getElementById('rfidNest2Status');

        const workingReaders = Object.values(this.state.rfidReaders).filter(r => r.ok).length;
        if (rfidReadersStatusBadge) {
            rfidReadersStatusBadge.textContent = `${workingReaders}/4`;
            rfidReadersStatusBadge.className = workingReaders === 4 ? 'badge badge-success' :
                                               workingReaders > 0 ? 'badge badge-warning' : 'badge badge-danger';
        }

        if (rfidInStatus) {
            rfidInStatus.textContent = this.state.rfidReaders.in.ok ? 'OK' : 'ERR';
            rfidInStatus.className = this.state.rfidReaders.in.ok ? 'badge badge-success' : 'badge badge-danger';
        }
        if (rfidOutStatus) {
            rfidOutStatus.textContent = this.state.rfidReaders.out.ok ? 'OK' : 'ERR';
            rfidOutStatus.className = this.state.rfidReaders.out.ok ? 'badge badge-success' : 'badge badge-danger';
        }
        if (rfidNest1Status) {
            rfidNest1Status.textContent = this.state.rfidReaders.nest1.ok ? 'OK' : 'ERR';
            rfidNest1Status.className = this.state.rfidReaders.nest1.ok ? 'badge badge-success' : 'badge badge-danger';
        }
        if (rfidNest2Status) {
            rfidNest2Status.textContent = this.state.rfidReaders.nest2.ok ? 'OK' : 'ERR';
            rfidNest2Status.className = this.state.rfidReaders.nest2.ok ? 'badge badge-success' : 'badge badge-danger';
        }

        // Egg Buttons Status Badge
        const eggButtonsStatusBadge = document.getElementById('eggButtonsStatusBadge');
        if (eggButtonsStatusBadge) {
            // Both egg buttons are always "OK" unless RFID nest readers are down
            const nest1Ok = this.state.rfidReaders.nest1.ok;
            const nest2Ok = this.state.rfidReaders.nest2.ok;
            const working = (nest1Ok ? 1 : 0) + (nest2Ok ? 1 : 0);
            eggButtonsStatusBadge.textContent = `${working}/2`;
            eggButtonsStatusBadge.className = working === 2 ? 'badge badge-success' :
                                              working > 0 ? 'badge badge-warning' : 'badge badge-danger';
        }

        // GSM Module
        const gsmModuleStatusBadge = document.getElementById('gsmModuleStatusBadge');
        const gsmUartStatus = document.getElementById('gsmUartStatus');
        const gsmBaudRate = document.getElementById('gsmBaudRate');

        if (gsmModuleStatusBadge) {
            if (this.state.gsm.ok) {
                gsmModuleStatusBadge.textContent = 'OK';
                gsmModuleStatusBadge.className = 'badge badge-success';
            } else {
                gsmModuleStatusBadge.textContent = 'ERROR';
                gsmModuleStatusBadge.className = 'badge badge-danger';
            }
        }

        if (gsmUartStatus) gsmUartStatus.textContent = this.state.gsm.uart;
        if (gsmBaudRate) gsmBaudRate.textContent = this.state.gsm.baudRate;

        // Update pending chickens
        this.updatePendingChickensUI();
    },

    /**
     * Get hardware status for heartbeat/status message
     */
    getStatusPayload() {
        return {
            rtcOk: this.state.rtc.ok,
            rtcTime: this.getRtcTime()?.toISOString(),
            rtcDrift: this.state.rtc.drift,
            sdCardOk: this.state.sdCard.ok,
            sdCardFreeSpace: this.state.sdCard.ok ? `${(this.state.sdCard.free / 1024).toFixed(1)} GB` : null,
            rfidReaders: {
                in: this.state.rfidReaders.in.ok,
                out: this.state.rfidReaders.out.ok,
                nest1: this.state.rfidReaders.nest1.ok,
                nest2: this.state.rfidReaders.nest2.ok
            },
            gsmOk: this.state.gsm.ok,
            pendingChickensCount: this.state.pendingChickens.length
        };
    },

    /**
     * Cleanup
     */
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    hardware.init();
});
