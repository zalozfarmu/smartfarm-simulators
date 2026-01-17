/**
 * Connected Modules Management
 * Manages communication with modules connected to the device
 */

const modules = {
    connectedModules: [], // Seznam modulů připojených k zařízení
    pairedCameras: new Map(), // cameraId -> module info
    deviceId: null,

    /**
     * Načte moduly připojené k zařízení
     */
    async loadModules(deviceId) {
        if (!deviceId) {
            console.log('[Modules] No deviceId provided');
            return;
        }

        this.deviceId = deviceId;

        try {
            const config = ServerConfig.getConfig();
            const apiUrl = config.api?.url || 'http://localhost:5555';
            const token = localStorage.getItem('jwt_token');

            if (!token) {
                console.log('[Modules] No token available for fetching modules');
                this.updateSectionStates(); // Aktualizovat i bez tokenů
                return;
            }

            const response = await fetch(`${apiUrl}/api/mqtt/devices/${deviceId}`, {
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
            const deviceModules = data.device?.modules || [];

            // Filtrovat pouze moduly připojené přes zařízení (via_device)
            // Moduly s direct_mqtt mají vlastní MQTT připojení a nejsou součástí device-simulatoru
            this.connectedModules = deviceModules.filter(m =>
                m.connectionType === 'via_device' && !m.hasWifi
            );

            console.log(`[Modules] Loaded ${this.connectedModules.length} via_device modules for device ${deviceId}`);

            // Zobrazit moduly v UI
            this.displayModules();

            // Aktualizovat stav sekcí podle připojených modulů
            this.updateSectionStates();

        } catch (error) {
            console.error('[Modules] Error loading modules:', error);
            logger.log(`⚠️ Nepodařilo se načíst moduly: ${error.message}`, 'warning');
            this.updateSectionStates(); // Aktualizovat i při chybě
        }
    },

    /**
     * Zobrazí moduly v UI
     */
    displayModules() {
        const card = document.getElementById('connectedModulesCard');
        const container = document.getElementById('connectedModulesList');

        if (!card || !container) {
            console.error('[Modules] UI elements not found');
            return;
        }

        // Pokud nejsou žádné moduly, skrýt kartu
        if (this.connectedModules.length === 0) {
            card.style.display = 'none';
            return;
        }

        // Zobrazit kartu
        card.style.display = 'block';

        // Vytvořit UI pro každý modul
        container.innerHTML = this.connectedModules.map(module => {
            return this.createModuleCard(module);
        }).join('');

        logger.log(`📦 Zobrazeno ${this.connectedModules.length} modulů připojených přes zařízení`, 'info');
    },

    /**
     * Vytvoří HTML kartu pro modul
     */
    createModuleCard(module) {
        const statusBadge = module.status === 'online' ? '🟢' : '⚫';
        const statusText = module.status === 'online' ? 'Online' : 'Offline';

        // Podle typu modulu vytvořit specifické UI
        switch (module.type) {
            case 'rfid':
            case 'rfid-gate':
            case 'rfid-reader':
                return this.createRfidModuleCard(module, statusBadge, statusText);

            case 'camera':
                return this.createCameraModuleCard(module, statusBadge, statusText);

            case 'feeder':
                return this.createFeederModuleCard(module, statusBadge, statusText);

            case 'egg-counter':
            case 'smart-counter':
                return this.createEggCounterModuleCard(module, statusBadge, statusText);

            default:
                return this.createGenericModuleCard(module, statusBadge, statusText);
        }
    },

    /**
     * Vytvoří kartu pro RFID modul
     */
    createRfidModuleCard(module, statusBadge, statusText) {
        // Zjistit, kolik slepic má přiřazené RFID tagy
        const chickensWithTags = (chickens.chickensFromApi || []).filter(c => c.tagId);
        const totalChickens = chickens.chickensFromApi ? chickens.chickensFromApi.length : 0;
        const hasChickensWithTags = chickensWithTags.length > 0;

        let chickensStatusHtml = '';
        if (totalChickens === 0) {
            chickensStatusHtml = `
                <div style="padding: 8px; background: #fef3c7; border-radius: 6px; margin-bottom: 10px; font-size: 11px; color: #92400e;">
                    ⚠️ Žádné slepice nejsou načtené. Nový tag bude připraven k přiřazení nové slepici.
                </div>
            `;
        } else if (!hasChickensWithTags) {
            chickensStatusHtml = `
                <div style="padding: 8px; background: #fef3c7; border-radius: 6px; margin-bottom: 10px; font-size: 11px; color: #92400e;">
                    ⚠️ ${totalChickens} slepic bez RFID tagů. Nový tag bude připraven k přiřazení.
                </div>
            `;
        } else {
            chickensStatusHtml = `
                <div style="padding: 8px; background: #d1fae5; border-radius: 6px; margin-bottom: 10px; font-size: 11px; color: #065f46;">
                    ✅ ${chickensWithTags.length}/${totalChickens} slepic má přiřazený RFID tag
                </div>
            `;
        }

        return `
            <div class="card" style="margin: 0; background: #f0f9ff; border: 2px solid #3b82f6;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; font-size: 16px;">📡 ${module.name || 'RFID Čtečka'}</h3>
                    <span style="font-size: 12px;">${statusBadge} ${statusText}</span>
                </div>

                <div style="font-size: 12px; color: #6b7280; margin-bottom: 15px;">
                    <div>ID: <code>${module.moduleId}</code></div>
                    <div>Typ: ${module.type}</div>
                    <div>Připojení: 🔌 Přes zařízení</div>
                </div>

                ${chickensStatusHtml}

                <div id="rfid_${module.moduleId}_chicken_stats" style="padding: 10px; background: #f9fafb; border-radius: 6px; margin-bottom: 10px;">
                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">Aktuální stav kurníku:</div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px;">
                        <div style="text-align: center;">
                            <div style="font-weight: bold; color: #10b981;" id="rfid_${module.moduleId}_inside">0</div>
                            <div style="font-size: 10px; color: #6b7280;">Uvnitř</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-weight: bold; color: #6b7280;" id="rfid_${module.moduleId}_outside">0</div>
                            <div style="font-size: 10px; color: #6b7280;">Venku</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-weight: bold; color: #3b82f6;" id="rfid_${module.moduleId}_total">0</div>
                            <div style="font-size: 10px; color: #6b7280;">Celkem</div>
                        </div>
                    </div>
                </div>

                <div id="rfid_${module.moduleId}_status" style="padding: 10px; background: #e5e7eb; border-radius: 6px; margin-bottom: 10px; text-align: center; font-size: 12px; color: #6b7280;">
                    Klikněte na tlačítko pro simulaci RFID skenu
                </div>

                <div id="rfid_${module.moduleId}_scanned" style="display: none; padding: 10px; background: #d1fae5; border-radius: 6px; margin-bottom: 10px;">
                    <div style="font-size: 12px; color: #065f46; margin-bottom: 8px;">Naskenovaný tag:</div>
                    <div style="font-family: monospace; font-size: 14px; font-weight: bold; color: #047857;" id="rfid_${module.moduleId}_tag"></div>
                    <div id="rfid_${module.moduleId}_chicken_info" style="font-size: 11px; color: #065f46; margin-top: 4px;"></div>
                </div>

                <div style="margin-top: 10px;">
                    <button class="btn btn-primary btn-small" onclick="modules.simulateRfidScan('${module.moduleId}')" style="width: 100%;">
                        🎲 Simulovat sken RFID
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Vytvoří kartu pro kameru
     */
    createCameraModuleCard(module, statusBadge, statusText) {
        return `
            <div class="card" style="margin: 0; background: #fef3c7; border: 2px solid #f59e0b;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; font-size: 16px;">📷 ${module.name || 'Kamera'}</h3>
                    <span style="font-size: 12px;">${statusBadge} ${statusText}</span>
                </div>

                <div style="font-size: 12px; color: #6b7280; margin-bottom: 15px;">
                    <div>ID: <code>${module.moduleId}</code></div>
                    <div>Typ: ${module.type}</div>
                    <div>Připojení: 🔌 Přes zařízení</div>
                </div>

                <div style="background: #1f2937; padding: 10px; border-radius: 6px; text-align: center; margin-bottom: 10px;">
                    <div style="color: #9ca3af; font-size: 12px;">📹 Simulace kamery</div>
                </div>

                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-success btn-small" onclick="modules.sendModuleCommand('${module.moduleId}', 'capture')" style="flex: 1;">
                        📸 Zachytit
                    </button>
                    <button class="btn btn-secondary btn-small" onclick="modules.sendModuleCommand('${module.moduleId}', 'stream')" style="flex: 1;">
                        🎥 Stream
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Vytvoří kartu pro krmítko
     */
    createFeederModuleCard(module, statusBadge, statusText) {
        return `
            <div class="card" style="margin: 0; background: #f0fdf4; border: 2px solid #10b981;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; font-size: 16px;">🌾 ${module.name || 'Krmítko'}</h3>
                    <span style="font-size: 12px;">${statusBadge} ${statusText}</span>
                </div>

                <div style="font-size: 12px; color: #6b7280; margin-bottom: 15px;">
                    <div>ID: <code>${module.moduleId}</code></div>
                    <div>Typ: ${module.type}</div>
                    <div>Připojení: 🔌 Přes zařízení</div>
                </div>

                <div id="feeder_${module.moduleId}_level" style="margin-bottom: 15px;">
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Hladina krmiva:</div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="flex: 1; background: #e5e7eb; height: 20px; border-radius: 10px; overflow: hidden;">
                            <div id="feeder_${module.moduleId}_bar" style="width: 75%; height: 100%; background: #10b981; transition: width 0.3s;"></div>
                        </div>
                        <div style="font-weight: bold; color: #1f2937;" id="feeder_${module.moduleId}_percent">75%</div>
                    </div>
                </div>

                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-success btn-small" onclick="modules.sendModuleCommand('${module.moduleId}', 'feed', {amount: 100})" style="flex: 1;">
                        ➕ Doplnit
                    </button>
                    <button class="btn btn-warning btn-small" onclick="modules.sendModuleCommand('${module.moduleId}', 'dispense', {portion: 50})" style="flex: 1;">
                        🌾 Vydat
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Vytvoří kartu pro počítadlo vajec / Smart Counter
     */
    createEggCounterModuleCard(module, statusBadge, statusText) {
        // Zjistit, kolik slepic má přiřazené RFID tagy (pro Smart Counter)
        const chickensWithTags = (chickens.chickensFromApi || []).filter(c => c.tagId);
        const totalChickens = chickens.chickensFromApi ? chickens.chickensFromApi.length : 0;

        console.log('[Modules] Creating Smart Counter card - chickensFromApi:', chickens.chickensFromApi);
        console.log('[Modules] Chickens with tags:', chickensWithTags.length, 'Total chickens:', totalChickens);

        let chickensStatusHtml = '';
        if (module.type === 'smart-counter') {
            if (totalChickens === 0) {
                chickensStatusHtml = `
                    <div style="padding: 8px; background: #fef3c7; border-radius: 6px; margin-bottom: 10px; font-size: 11px; color: #92400e;">
                        ⚠️ Žádné slepice nejsou načtené z API
                    </div>
                `;
            } else if (chickensWithTags.length === 0) {
                chickensStatusHtml = `
                    <div style="padding: 8px; background: #fef3c7; border-radius: 6px; margin-bottom: 10px; font-size: 11px; color: #92400e;">
                        ⚠️ ${totalChickens} slepic bez RFID tagů
                    </div>
                `;
            } else {
                chickensStatusHtml = `
                    <div style="padding: 8px; background: #d1fae5; border-radius: 6px; margin-bottom: 10px; font-size: 11px; color: #065f46;">
                        ✅ ${chickensWithTags.length}/${totalChickens} slepic má RFID tag
                    </div>
                `;
            }
        }

        // Smart Counter má RFID čtečku + tlačítko, běžný egg-counter jen tlačítko
        const isSmartCounter = module.type === 'smart-counter';

        return `
            <div class="card" style="margin: 0; background: #fef2f2; border: 2px solid #ef4444;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; font-size: 16px;">🥚 ${module.name || (isSmartCounter ? 'Smart Counter' : 'Počítadlo vajec')}</h3>
                    <span style="font-size: 12px;">${statusBadge} ${statusText}</span>
                </div>

                <div style="font-size: 12px; color: #6b7280; margin-bottom: 15px;">
                    <div>ID: <code>${module.moduleId}</code></div>
                    <div>Typ: ${module.type}</div>
                    <div>Připojení: 🔌 Přes zařízení</div>
                </div>

                ${chickensStatusHtml}

                <div style="text-align: center; margin-bottom: 15px;">
                    <div style="font-size: 48px; font-weight: bold; color: #ef4444;" id="egg_${module.moduleId}_count">0</div>
                    <div style="font-size: 12px; color: #6b7280;">Vajec dnes</div>
                </div>

                ${isSmartCounter ? `
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 500;">
                            Vyberte slepici (RFID sken):
                        </label>
                        <select id="smartCounter_${module.moduleId}_chickenSelect" style="width: 100%; padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 13px; background: white;" onchange="modules.handleSmartCounterChickenSelect('${module.moduleId}', event)">
                            <option value="">-- Vyberte slepici (${chickensWithTags.length} dostupných) --</option>
                            ${chickensWithTags.map(chicken => {
            const escapedName = (chicken.name || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const escapedTag = (chicken.tagId || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const serverId = chicken.serverId || '';
            const optionValue = serverId || chicken.id;
            return `<option value="${optionValue}" data-name="${escapedName}" data-tag="${escapedTag}" data-server-id="${serverId}">${escapedName} (${escapedTag})</option>`;
        }).join('')}
                        </select>
                    </div>

                    <div id="smartCounter_${module.moduleId}_selected" style="display: none; padding: 10px; background: #d1fae5; border-radius: 6px; margin-bottom: 10px;">
                        <div style="font-size: 12px; color: #065f46; margin-bottom: 8px;">
                            ✅ Vybrána: <span id="smartCounter_${module.moduleId}_selectedName" style="font-weight: bold;">-</span>
                        </div>
                        <div style="font-size: 11px; color: #065f46;">
                            RFID: <code style="background: #f0fdf4; padding: 2px 6px; border-radius: 4px;" id="smartCounter_${module.moduleId}_selectedTag">-</code>
                        </div>
                    </div>

                    <button class="btn btn-success btn-small" onclick="modules.simulateSmartCounterEgg('${module.moduleId}')" style="width: 100%;" id="smartCounter_${module.moduleId}_button">
                        🥚 Zaznamenat vejce
                    </button>
                ` : `
                    <button class="btn btn-primary btn-small" onclick="modules.simulateEggDetection('${module.moduleId}')" style="width: 100%;">
                        🥚 Simulovat detekci vejce
                    </button>
                `}
            </div>
        `;
    },

    /**
     * Vytvoří generickou kartu pro neznámý typ modulu
     */
    createGenericModuleCard(module, statusBadge, statusText) {
        return `
            <div class="card" style="margin: 0; background: #f9fafb; border: 2px solid #6b7280;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; font-size: 16px;">📦 ${module.name || 'Modul'}</h3>
                    <span style="font-size: 12px;">${statusBadge} ${statusText}</span>
                </div>

                <div style="font-size: 12px; color: #6b7280; margin-bottom: 15px;">
                    <div>ID: <code>${module.moduleId}</code></div>
                    <div>Typ: ${module.type}</div>
                    <div>Připojení: 🔌 Přes zařízení</div>
                </div>

                <div style="padding: 10px; background: #e5e7eb; border-radius: 6px; text-align: center; font-size: 12px; color: #6b7280;">
                    Generický modul - žádné specifické ovládání
                </div>
            </div>
        `;
    },

    /**
     * Odešle příkaz modulu přes zařízení
     */
    sendModuleCommand(moduleId, command, payload = {}) {
        if (!simulator.isConnected()) {
            logger.log('❌ Nelze odeslat příkaz - zařízení není připojeno k MQTT', 'error');
            return;
        }

        const module = this.connectedModules.find(m => m.moduleId === moduleId);
        if (!module) {
            logger.log(`❌ Modul ${moduleId} nebyl nalezen`, 'error');
            return;
        }

        // Moduly připojené přes zařízení (via_device) posílají zprávy přes device topic
        // Topic: smartcoop/{deviceId}/modules/{moduleId}/command
        const topic = `smartcoop/${this.deviceId}/modules/${moduleId}/command`;

        const message = {
            moduleId: moduleId,
            command: command,
            timestamp: new Date().toISOString(),
            ...payload
        };

        simulator.publish(topic, message);
        logger.log(`📤 Příkaz odeslán modulu ${module.name}: ${command}`, 'info');
        console.log(`[Modules] Sent command to module ${moduleId}:`, message);
    },

    /**
     * Simuluje sken RFID tagu
     */
    simulateRfidScan(moduleId) {
        const module = this.connectedModules.find(m => m.moduleId === moduleId);
        if (!module) return;

        // Nejdřív zkontrolovat, zda jsou načtené slepice s RFID tagy
        let tagId;
        let chickenInfo = null;

        if (chickens.chickensFromApi && chickens.chickensFromApi.length > 0) {
            // Máme slepice z API - použít náhodnou slepici s RFID tagem
            const chickensWithTags = chickens.chickensFromApi.filter(c => c.tagId);

            if (chickensWithTags.length > 0) {
                // Vybrat náhodnou slepici s RFID tagem
                const randomChicken = chickensWithTags[Math.floor(Math.random() * chickensWithTags.length)];
                tagId = randomChicken.tagId;
                chickenInfo = randomChicken;
                logger.log(`📡 Simulace skenu RFID: ${randomChicken.name} (${tagId})`, 'info');
            } else {
                // Slepice existují, ale nemají přiřazené RFID tagy
                logger.log('⚠️ Žádné slepice nemají přiřazené RFID tagy. Vygeneruji nový tag pro přiřazení.', 'warning');
                tagId = this.generateRandomRfidTag();
                logger.log(`📡 Simulace skenu RFID: nový tag ${tagId} (připraven k přiřazení)`, 'info');
            }
        } else {
            // Žádné slepice nejsou načtené - vygenerovat nový tag
            logger.log('⚠️ Nejsou načtené žádné slepice. Vygeneruji nový tag pro přiřazení nové slepice.', 'warning');
            tagId = this.generateRandomRfidTag();
            logger.log(`📡 Simulace skenu RFID: nový tag ${tagId} (připraven k přiřazení nové slepice)`, 'info');
        }

        // Zobrazit tag v UI
        const statusDiv = document.getElementById(`rfid_${moduleId}_status`);
        const scannedDiv = document.getElementById(`rfid_${moduleId}_scanned`);
        const tagDiv = document.getElementById(`rfid_${moduleId}_tag`);
        const chickenInfoDiv = document.getElementById(`rfid_${moduleId}_chicken_info`);

        if (statusDiv) statusDiv.style.display = 'none';
        if (scannedDiv) scannedDiv.style.display = 'block';
        if (tagDiv) tagDiv.textContent = tagId;

        const wasInside = chickenInfo ? chickens.chickensInside.has(chickenInfo.tagId) : false;

        // Zobrazit informaci o slepici, pokud je známá
        if (chickenInfoDiv) {
            if (chickenInfo) {
                const action = wasInside ? 'vychází ⬅️' : 'vchází ➡️';
                chickenInfoDiv.innerHTML = `🐔 ${chickenInfo.name} <strong>${action}</strong>`;
                chickenInfoDiv.style.display = 'block';
            } else {
                chickenInfoDiv.textContent = '⚠️ Tag připraven k přiřazení nové slepici';
                chickenInfoDiv.style.display = 'block';
            }
        }

        // Odeslat zprávu o skenu na MQTT
        // PRIMÁRNÍ TOPIC: smartcoop/{deviceId}/modules/{moduleId}/rfid_scan
        // Tento topic obsahuje plnou strukturu a backend ho primárně zpracovává

        const direction = wasInside ? 'out' : 'in';

        const message = {
            type: 'rfid_scan',
            moduleId: moduleId,
            deviceId: this.deviceId,
            tagId: tagId,
            timestamp: new Date().toISOString(),
            direction: direction, // směr získáme z toho, jestli slepice byla uvnitř
            source: 'module_via_device'
        };

        // PRIMÁRNÍ TOPIC: Specifický topic modulu s plnou strukturou
        // Backend subscribuje na: smartcoop/+/modules/+/rfid_scan
        const primaryTopic = `smartcoop/${this.deviceId}/modules/${moduleId}/rfid_scan`;
        simulator.publish(primaryTopic, message);

        logger.log(`📤 RFID sken odeslán na ${primaryTopic}: ${tagId}`, 'success');
        console.log(`[RFID] Published to primary topic:`, { topic: primaryTopic, message });

        // Pokud je známá slepice, aktualizovat chicken tracking
        // Simulujeme vstup/výstup slepice v sekci Chickens
        if (chickenInfo && typeof chickens !== 'undefined') {
            // Zjistit, zda je slepice uvnitř nebo venku
            const isInside = chickens.chickensInside.has(chickenInfo.tagId);

            if (isInside) {
                // Slepice je uvnitř -> simulovat výstup
                logger.log(`🐔 ${chickenInfo.name} vychází (RFID sken z modulu ${module.name})`, 'info');
                chickens.simulateExit(chickenInfo.tagId, chickenInfo.name, chickenInfo.id);
            } else {
                // Slepice je venku -> simulovat vstup
                logger.log(`🐔 ${chickenInfo.name} vchází (RFID sken z modulu ${module.name})`, 'info');
                chickens.simulateEnter(chickenInfo.tagId, chickenInfo.name, chickenInfo.id);
            }
        }

        // Po 3 sekundách resetovat UI
        setTimeout(() => {
            if (statusDiv) statusDiv.style.display = 'block';
            if (scannedDiv) scannedDiv.style.display = 'none';
        }, 3000);
    },

    /**
     * Simuluje detekci vejce
     */
    simulateEggDetection(moduleId, chickenId = null, chickenName = null, tagId = null) {
        const module = this.connectedModules.find(m => m.moduleId === moduleId);
        if (!module) return;

        // Inkrementovat počítadlo
        const countDiv = document.getElementById(`egg_${moduleId}_count`);
        if (countDiv) {
            const currentCount = parseInt(countDiv.textContent) || 0;
            countDiv.textContent = currentCount + 1;

            // Animace
            countDiv.style.transform = 'scale(1.2)';
            setTimeout(() => {
                countDiv.style.transform = 'scale(1)';
            }, 200);
        }

        // Odeslat zprávu o detekci vejce na MQTT
        const topic = `smartcoop/${this.deviceId}/modules/${moduleId}/egg_detected`;
        const normalizedChickenId = typeof chickenId === 'string' ? (parseInt(chickenId, 10) || chickenId) : chickenId;

        const message = {
            moduleId: moduleId,
            deviceId: this.deviceId,
            timestamp: new Date().toISOString(),
            count: parseInt(countDiv?.textContent || 1),
            ...(normalizedChickenId && { chickenId: normalizedChickenId }),
            ...(chickenName && { chickenName }),
            ...(tagId && { tagId })
        };

        simulator.publish(topic, message);

        if (chickenName) {
            logger.log(`🥚 Detekce vejce odeslána z modulu ${module.name}: ${chickenName}`, 'success');
        } else {
            logger.log(`🥚 Detekce vejce odeslána z modulu ${module.name}`, 'success');
        }
    },

    /**
     * Zpracuje výběr slepice v Smart Counter dropdownu
     */
    handleSmartCounterChickenSelect(moduleId, event) {
        const select = event.target;
        const selectedOption = select.options[select.selectedIndex];

        if (!selectedOption || !selectedOption.value) {
            // Žádná slepice vybrána - skrýt info panel
            const selectedDiv = document.getElementById(`smartCounter_${moduleId}_selected`);
            if (selectedDiv) selectedDiv.style.display = 'none';
            return;
        }

        const rawChickenId = selectedOption.dataset.serverId || selectedOption.value;
        const chickenId = rawChickenId && !isNaN(Number(rawChickenId)) ? Number(rawChickenId) : rawChickenId;
        const chickenName = selectedOption.dataset.name;
        const tagId = selectedOption.dataset.tag;

        // Uložit data do modulu
        if (!this.smartCounterData) {
            this.smartCounterData = {};
        }
        this.smartCounterData[moduleId] = {
            chickenId: chickenId,
            chickenName: chickenName,
            tagId: tagId,
            timestamp: new Date().toISOString()
        };

        // Aktualizovat UI - zobrazit info panel s vybranou slepicí
        const selectedDiv = document.getElementById(`smartCounter_${moduleId}_selected`);
        const selectedNameSpan = document.getElementById(`smartCounter_${moduleId}_selectedName`);
        const selectedTagCode = document.getElementById(`smartCounter_${moduleId}_selectedTag`);

        if (selectedDiv) selectedDiv.style.display = 'block';
        if (selectedNameSpan) selectedNameSpan.textContent = chickenName;
        if (selectedTagCode) selectedTagCode.textContent = tagId;

        logger.log(`✅ Vybrána slepice: ${chickenName} (${tagId})`, 'info');

        // Publikovat RFID událost (simulace skenu)
        const deviceId = simulator.deviceId || 'unknown';
        const topic = `smartcoop/${deviceId}/modules/${moduleId}/rfid_scan`;
        const message = {
            type: 'rfid_scan',
            deviceId,
            moduleId,
            tagId,
            chickenName,
            chickenId,
            direction: 'nest',
            location: 'NEST',
            context: 'egg_laying',
            timestamp: new Date().toISOString()
        };
        simulator.publish(topic, message);
    },

    /**
     * Zaznamenává vejce pro vybranou slepici v Smart Counter modulu
     */
    simulateSmartCounterEgg(moduleId) {
        const module = this.connectedModules.find(m => m.moduleId === moduleId);
        if (!module) return;

        // Zkontrolovat, zda byla vybrána slepice
        if (!this.smartCounterData || !this.smartCounterData[moduleId]) {
            logger.log('⚠️ Nejprve vyberte slepici', 'warning');
            return;
        }

        const data = this.smartCounterData[moduleId];
        const normalizedChickenId = typeof data.chickenId === 'string'
            ? (parseInt(data.chickenId, 10) || data.chickenId)
            : data.chickenId;

        // Zaznamenat vejce pro slepici
        this.simulateEggDetection(moduleId, normalizedChickenId, data.chickenName, data.tagId);

        // Resetovat výběr
        const select = document.getElementById(`smartCounter_${moduleId}_chickenSelect`);
        if (select) select.value = '';

        const selectedDiv = document.getElementById(`smartCounter_${moduleId}_selected`);
        if (selectedDiv) selectedDiv.style.display = 'none';

        // Vymazat uložená data
        delete this.smartCounterData[moduleId];

        logger.log(`✅ Vejce zaznamenáno pro ${data.chickenName}`, 'success');
    },

    /**
     * Vygeneruje náhodný RFID tag
     */
    generateRandomRfidTag() {
        // Formát: 8 hexadecimálních znaků (podobně jako reálné RFID tagy)
        return Array(8)
            .fill(0)
            .map(() => Math.floor(Math.random() * 16).toString(16).toUpperCase())
            .join('');
    },

    /**
     * Zpracuje zprávu pro modul
     */
    handleModuleMessage(topic, payload) {
        // Parsování topic: smartcoop/{deviceId}/modules/{moduleId}/{action}
        const match = topic.match(/smartcoop\/(\d+)\/modules\/([^/]+)\/(.+)/);
        if (!match) return;

        const [, deviceId, moduleId, action] = match;

        // Najít modul
        const module = this.connectedModules.find(m => m.moduleId === moduleId);
        if (!module) {
            console.log(`[Modules] Module ${moduleId} not found in connected modules`);
            return;
        }

        console.log(`[Modules] Received message for module ${moduleId}:`, action, payload);
        logger.log(`📨 Zpráva pro modul ${module.name}: ${action}`, 'info');

        // Zpracovat podle typu modulu a akce
        switch (action) {
            case 'status_request':
                this.sendModuleStatus(moduleId);
                break;

            case 'config_update':
                logger.log(`⚙️ Konfigurace modulu ${module.name} aktualizována`, 'info');
                break;

            case 'command':
                if (module.type === 'rfid' || module.type === 'rfid-gate' || module.type === 'rfid-reader') {
                    const cmd = payload?.action || payload?.command;
                    let success = true;
                    if (cmd === 'start_pairing') {
                        if (typeof chickens !== 'undefined' && typeof chickens.handleRemotePairingRequest === 'function') {
                            chickens.handleRemotePairingRequest(moduleId);
                            logger.log(`🏷️ RFID pairing started (${moduleId})`, 'success');
                        } else {
                            logger.log('⚠️ Chickens modul není dostupný pro párování RFID', 'warning');
                            success = false;
                        }
                        // fallthrough to ACK
                    }
                    if (cmd === 'stop_pairing') {
                        if (typeof chickens !== 'undefined' && typeof chickens.cancelRemotePairing === 'function') {
                            chickens.cancelRemotePairing();
                            logger.log(`⏹️ RFID pairing stopped (${moduleId})`, 'info');
                        } else {
                            success = false;
                        }
                        // fallthrough to ACK
                    }
                    if (cmd === 'add_authorized_tag') {
                        const tag = payload?.payload?.tag || payload?.tag;
                        logger.log(`✅ add_authorized_tag pro ${moduleId}: ${tag || '(missing tag)'}`, 'success');
                        // Simulátor zatím neudržuje whitelist – pouze logujeme.
                        // fallthrough to ACK
                    }
                    if (cmd !== 'start_pairing' && cmd !== 'stop_pairing' && cmd !== 'add_authorized_tag') {
                        logger.log(`⚠️ Neznámý příkaz pro RFID modul ${moduleId}: ${cmd || '(missing action)'}`, 'warning');
                        success = false;
                    }

                    // Device Shadow ACK for module commands
                    if (typeof simulator !== 'undefined' && simulator.isConnected && simulator.isConnected()) {
                        const ackTopic = `smartcoop/${deviceId}/modules/${moduleId}/command_ack`;
                        simulator.publish(ackTopic, {
                            commandId: payload?.requestId || payload?.commandId,
                            requestId: payload?.requestId || payload?.commandId,
                            moduleId,
                            action: cmd,
                            success,
                            status: success ? 'success' : 'unknown_command',
                            timestamp: Date.now()
                        });
                        console.log(`[Modules] RFID Command ACK sent to ${ackTopic}`);
                    }
                } else if (module.type === 'smart-door' || module.type === 'door') {
                    if (typeof door !== 'undefined' && typeof door.handleCommand === 'function') {
                        // Udržovat door.moduleId v sync s topicem (aby status chodil na správný modul)
                        if (door.moduleId !== moduleId) {
                            door.moduleId = moduleId;
                        }
                        door.handleCommand(payload.command || payload.action, payload);
                        logger.log(`🚪 Příkaz přeposlán modulu dveří: ${payload.command || payload.action}`, 'success');
                    }
                } else if (module.type === 'feeder' || module.type === 'smart-feeder' || module.type === 'automatic-feeder') {
                    if (typeof feeder !== 'undefined' && typeof feeder.handleCommand === 'function') {
                        feeder.handleCommand(payload.command || payload.action, payload);
                        logger.log(`🌾 Příkaz přeposlán krmítku: ${payload.command || payload.action}`, 'success');
                    } else {
                        logger.log('⚠️ Feeder modul není dostupný (feeder.js)', 'warning');
                    }
                } else if (module.type === 'camera') {
                    if (typeof cameraModule !== 'undefined' && typeof cameraModule.handleCommand === 'function') {
                        cameraModule.handleCommand(payload.command || payload.action, payload);
                        logger.log(`📷 Příkaz přeposlán kameře: ${payload.command || payload.action}`, 'success');
                    } else {
                        logger.log('⚠️ Kamera modul není dostupný (camera.js)', 'warning');
                    }
                } else {
                    const cmd = payload?.action || payload?.command;
                    logger.log(`⚠️ Příkaz pro modul ${module.name} (typ ${module.type}) není zatím podporován`, 'warning');

                    // Fail-fast ACK so Device Shadow doesn't stay pending forever for unsupported modules.
                    if (typeof simulator !== 'undefined' && simulator.isConnected && simulator.isConnected()) {
                        const ackTopic = `smartcoop/${deviceId}/modules/${moduleId}/command_ack`;
                        simulator.publish(ackTopic, {
                            commandId: payload?.requestId || payload?.commandId,
                            requestId: payload?.requestId || payload?.commandId,
                            moduleId,
                            action: cmd,
                            success: false,
                            status: 'unsupported_module',
                            timestamp: Date.now()
                        });
                        console.log(`[Modules] Unsupported module ACK sent to ${ackTopic}`);
                    }
                }
                break;

            default:
                console.log(`[Modules] Unknown action for module ${moduleId}:`, action);
        }
    },

    /**
     * Zpracuje zprávy z kamer v režimu gateway (handshake/status/snapshot/pair)
     */
    handleCameraGatewayMessage(topic, payload, gatewayId) {
        if (!topic.includes('/camera/')) return;
        const parts = topic.split('/');
        // smartcoop/{gatewayId}/camera/{cameraId}/{action}
        const cameraId = parts[3];
        const action = parts[4] || '';

        if (action === 'pair') {
            const accept = window.confirm(`Přijmout párování kamery ${cameraId} z gateway ${gatewayId}?`);
            let status = 'rejected';
            if (accept) {
                const moduleInfo = {
                    moduleId: cameraId,
                    name: payload?.cameraName || `Camera ${cameraId}`,
                    type: 'camera',
                    status: 'online',
                    connectionType: 'gateway',
                    gatewayId
                };
                this.pairedCameras.set(cameraId, moduleInfo);
                this.updateSectionStates();
                status = 'ok';
                if (typeof cameraModule !== 'undefined' && cameraModule.setGatewayPairing) {
                    cameraModule.setGatewayPairing(moduleInfo);
                }
            } else {
                logger.log(`❌ Párování kamery ${cameraId} odmítnuto`, 'warning');
            }
            const ackTopic = `smartcoop/${gatewayId}/camera/${cameraId}/pair/ack`;
            const ackPayload = {
                cameraId,
                gatewayId,
                status,
                mqttUsername: payload?.mqttUsername || `module_camera_${cameraId}_${gatewayId}`,
                mqttPassword: payload?.mqttPassword || payload?.mqttUsername || `module_camera_${cameraId}_${gatewayId}`,
                timestamp: new Date().toISOString()
            };
            simulator.publish(ackTopic, ackPayload);
            if (status === 'ok') {
                logger.log(`✅ Spárováno s kamerou ${cameraId} (pair ack -> ${ackTopic})`, 'success');
            } else {
                logger.log(`⚠️ Pair ACK odeslán s odmítnutím pro kameru ${cameraId}`, 'warning');
            }
            return;
        }

        if (action === 'handshake') {
            const moduleInfo = {
                moduleId: cameraId,
                name: payload?.cameraName || `Camera ${cameraId}`,
                type: 'camera',
                status: 'online',
                connectionType: 'gateway',
                gatewayId
            };
            this.pairedCameras.set(cameraId, moduleInfo);
            this.updateSectionStates();

            const ackTopic = `smartcoop/${gatewayId}/camera/${cameraId}/handshake/ack`;
            const ackPayload = {
                cameraId,
                gatewayId,
                status: 'ok',
                timestamp: new Date().toISOString()
            };
            simulator.publish(ackTopic, ackPayload);
            logger.log(`✅ Handshake s kamerou ${cameraId} (ack -> ${ackTopic})`, 'success');
            if (typeof cameraModule !== 'undefined' && cameraModule.setGatewayPairing) {
                cameraModule.setGatewayPairing(moduleInfo);
            }
            return;
        }

        if (action === 'status') {
            const moduleInfo = this.pairedCameras.get(cameraId) || {
                moduleId: cameraId,
                name: payload?.cameraName || `Camera ${cameraId}`,
                type: 'camera',
                status: 'online',
                connectionType: 'gateway',
                gatewayId
            };
            moduleInfo.status = payload?.status || 'online';
            this.pairedCameras.set(cameraId, moduleInfo);
            this.updateSectionStates();
            if (typeof cameraModule !== 'undefined' && cameraModule.updateStatusFromGateway) {
                cameraModule.updateStatusFromGateway(cameraId, payload);
            }
            return;
        }

        if (action === 'snapshot') {
            if (typeof cameraModule !== 'undefined' && cameraModule.addSnapshotFromGateway) {
                cameraModule.addSnapshotFromGateway(cameraId, payload, gatewayId);
            }
            return;
        }
    },

    /**
    * Zpracuje zprávy z kamer v režimu gateway (handshake/status/snapshot)
    */
    handleCameraGatewayMessage(topic, payload, gatewayId) {
        if (!topic.includes('/camera/')) return;
        const parts = topic.split('/');
        // smartcoop/{gatewayId}/camera/{cameraId}/{action}
        const cameraId = parts[3];
        const action = parts[4] || '';

        if (action === 'handshake') {
            const moduleInfo = {
                moduleId: cameraId,
                name: payload?.cameraName || `Camera ${cameraId}`,
                type: 'camera',
                status: 'online',
                connectionType: 'gateway',
                gatewayId
            };
            this.pairedCameras.set(cameraId, moduleInfo);
            this.updateSectionStates();

            const ackTopic = `smartcoop/${gatewayId}/camera/${cameraId}/handshake/ack`;
            const ackPayload = {
                cameraId,
                gatewayId,
                status: 'ok',
                timestamp: new Date().toISOString()
            };
            simulator.publish(ackTopic, ackPayload);
            logger.log(`✅ Spárováno s kamerou ${cameraId} (ack -> ${ackTopic})`, 'success');
            if (typeof cameraModule !== 'undefined' && cameraModule.setGatewayPairing) {
                cameraModule.setGatewayPairing(moduleInfo);
            }
            return;
        }

        if (action === 'status') {
            const moduleInfo = this.pairedCameras.get(cameraId) || {
                moduleId: cameraId,
                name: payload?.cameraName || `Camera ${cameraId}`,
                type: 'camera',
                status: 'online',
                connectionType: 'gateway',
                gatewayId
            };
            moduleInfo.status = payload?.status || 'online';
            this.pairedCameras.set(cameraId, moduleInfo);
            this.updateSectionStates();
            if (typeof cameraModule !== 'undefined' && cameraModule.updateStatusFromGateway) {
                cameraModule.updateStatusFromGateway(cameraId, payload);
            }
            return;
        }

        if (action === 'snapshot') {
            if (typeof cameraModule !== 'undefined' && cameraModule.addSnapshotFromGateway) {
                cameraModule.addSnapshotFromGateway(cameraId, payload, gatewayId);
            }
            return;
        }
    },

    /**
     * Odešle status modulu
     */
    sendModuleStatus(moduleId) {
        const module = this.connectedModules.find(m => m.moduleId === moduleId);
        if (!module) return;

        const topic = `smartcoop/${this.deviceId}/modules/${moduleId}/status`;
        const message = {
            moduleId: moduleId,
            deviceId: this.deviceId,
            type: module.type,
            status: 'online',
            timestamp: new Date().toISOString()
        };

        simulator.publish(topic, message);
        logger.log(`📤 Status modulu ${module.name} odeslán`, 'info');
    },

    /**
     * Odešle status všech připojených modulů
     */
    publishAllModulesStatus() {
        this.connectedModules.forEach(module => {
            this.sendModuleStatus(module.moduleId);
        });
    },

    /**
     * Aktualizuje statistiky slepic v RFID modulech
     */
    updateChickenStats() {
        // Aktualizovat statistiky ve všech RFID modulech
        this.connectedModules.forEach(module => {
            if (module.type === 'rfid' || module.type === 'rfid-gate' || module.type === 'rfid-reader') {
                const insideDiv = document.getElementById(`rfid_${module.moduleId}_inside`);
                const outsideDiv = document.getElementById(`rfid_${module.moduleId}_outside`);
                const totalDiv = document.getElementById(`rfid_${module.moduleId}_total`);

                if (insideDiv && outsideDiv && totalDiv && typeof chickens !== 'undefined') {
                    const inside = chickens.inside || 0;
                    const total = chickens.total || 0;
                    const outside = total - inside;

                    insideDiv.textContent = inside;
                    outsideDiv.textContent = outside;
                    totalDiv.textContent = total;
                }
            }
        });
    },

    /**
     * Obnoví zobrazení modulů (např. po načtení slepic)
     */
    refresh() {
        if (this.connectedModules.length > 0) {
            this.displayModules();
            // Po refreshi aktualizovat statistiky
            this.updateChickenStats();
            console.log('[Modules] Modules refreshed - Smart Counter dropdowns updated with new chickens');
        }
    },

    /**
     * Vyčistí seznam modulů
     */
    clear() {
        this.connectedModules = [];
        this.deviceId = null;
        const card = document.getElementById('connectedModulesCard');
        if (card) {
            card.style.display = 'none';
        }
        // Aktualizovat stav sekcí
        this.updateSectionStates();
    },

    /**
     * Aktualizuje stav sekcí podle připojených modulů
     */
    updateSectionStates() {
        // Smart Door modul
        const hasDoorModule = this.connectedModules.some(m =>
            m.type === 'smart-door' || m.type === 'door'
        );
        this.toggleSection('doorCard', 'doorModuleStatus', 'doorContent', hasDoorModule, 'doorButtons');

        // Sensor modul
        const hasSensorModule = this.connectedModules.some(m =>
            m.type === 'sensor' || m.type === 'sensors' || m.type === 'climate-sensor'
        );
        this.toggleSection('sensorsCard', 'sensorModuleStatus', 'sensorsContent', hasSensorModule);

        // RFID Gate modul (pro vstup/výstup slepic)
        const hasRfidGateModule = this.connectedModules.some(m =>
            m.type === 'rfid-gate' || m.type === 'rfid'
        );
        this.toggleRfidGateSection(hasRfidGateModule);

        // Smart Counter modul (RFID reader nebo egg-counter pro počítání vajec)
        const hasSmartCounterModule = this.connectedModules.some(m =>
            m.type === 'smart-counter' ||
            m.type === 'egg-counter' ||
            m.type === 'rfid-reader' ||
            m.type === 'rfid-gate'
        );
        this.toggleSmartCounterSection(hasSmartCounterModule);

        // Feeder modul
        const hasFeederModule = this.connectedModules.some(m =>
            m.type === 'feeder'
        );
        this.toggleSection(
            'feederCard',
            'feederModuleStatus',
            'feederContent',
            hasFeederModule,
            ['feederActions', 'feederManualButtons']
        );
        if (typeof feeder !== 'undefined' && typeof feeder.attachModule === 'function') {
            const feederModule = this.connectedModules.find(m => m.type === 'feeder');
            feeder.attachModule(hasFeederModule ? feederModule : null);
        }

        // Camera modul
        const hasCameraModule = this.connectedModules.some(m =>
            m.type === 'camera'
        ) || this.pairedCameras.size > 0;
        this.toggleSection(
            'cameraCard',
            'cameraModuleStatus',
            'cameraContent',
            hasCameraModule,
            ['cameraControls', 'cameraFilterButtons']
        );
        if (typeof cameraModule !== 'undefined' && typeof cameraModule.attachModule === 'function') {
            const camera = this.connectedModules.find(m => m.type === 'camera') ||
                (this.pairedCameras.size > 0 ? Array.from(this.pairedCameras.values())[0] : null);
            cameraModule.attachModule(hasCameraModule ? camera : null);
        }

        console.log('[Modules] Section states updated - Door:', hasDoorModule, 'Sensors:', hasSensorModule,
            'RFID Gate:', hasRfidGateModule, 'Smart Counter:', hasSmartCounterModule,
            'Feeder:', hasFeederModule, 'Camera:', hasCameraModule);
    },

    /**
     * Přepne RFID Gate sekci podle dostupnosti modulu
     */
    toggleRfidGateSection(isActive) {
        const addChickenBtn = document.getElementById('addChickenBtn');
        const syncChickensBtn = document.getElementById('syncChickensBtn');
        const statusBadge = document.getElementById('rfidModuleStatusBadge');
        const rfidSimulationSection = document.querySelector('#chickensCard > div:last-child > div:last-child');

        // Aktualizovat status badge
        if (statusBadge) {
            if (isActive) {
                statusBadge.style.background = '#10b981';
                statusBadge.innerHTML = '🟢 Aktivní';
            } else {
                statusBadge.style.background = '#ef4444';
                statusBadge.innerHTML = '🔴 Neaktivní';
            }
        }

        if (isActive) {
            // Modul je připojen - povolit RFID funkce
            if (addChickenBtn) {
                addChickenBtn.disabled = false;
                addChickenBtn.style.opacity = '1';
                addChickenBtn.style.cursor = 'pointer';
                addChickenBtn.title = '';
            }

            // Synchronizace je vždy dostupná (nezávislá na RFID modulu)
            if (syncChickensBtn) {
                syncChickensBtn.disabled = false;
                syncChickensBtn.style.opacity = '1';
            }

            // Povolit RFID simulaci
            if (rfidSimulationSection) {
                rfidSimulationSection.style.opacity = '1';
                rfidSimulationSection.style.pointerEvents = 'auto';
                const buttons = rfidSimulationSection.querySelectorAll('button');
                buttons.forEach(btn => {
                    btn.disabled = false;
                    btn.title = '';
                });
                const checkbox = rfidSimulationSection.querySelector('input[type="checkbox"]');
                if (checkbox) checkbox.disabled = false;
            }
        } else {
            // Modul není připojen - zablokovat RFID funkce, ale seznam slepic zůstane přístupný
            if (addChickenBtn) {
                addChickenBtn.disabled = true;
                addChickenBtn.style.opacity = '0.5';
                addChickenBtn.style.cursor = 'not-allowed';
                addChickenBtn.title = 'Pro přidání slepice je potřeba RFID modul (rfid-gate)';
            }

            // Synchronizace zůstává aktivní i bez RFID modulu
            if (syncChickensBtn) {
                syncChickensBtn.disabled = false;
                syncChickensBtn.style.opacity = '1';
                syncChickensBtn.title = 'Synchronizace funguje i bez RFID modulu';
            }

            // Zablokovat RFID simulaci
            if (rfidSimulationSection) {
                rfidSimulationSection.style.opacity = '0.5';
                rfidSimulationSection.style.pointerEvents = 'none';
                const buttons = rfidSimulationSection.querySelectorAll('button');
                buttons.forEach(btn => {
                    btn.disabled = true;
                    btn.title = 'Pro RFID simulaci je potřeba RFID modul';
                });
                const checkbox = rfidSimulationSection.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.disabled = true;
                    checkbox.checked = false;
                }
            }
        }
    },

    /**
     * Přepne Smart Counter sekci podle dostupnosti modulu
     */
    toggleSmartCounterSection(isActive) {
        const smartCounterCard = document.getElementById('smartCounterCard');
        const chickensGrid = document.getElementById('smartCounterChickensGrid');

        if (!smartCounterCard) return;

        if (isActive) {
            // Modul je připojen - zobrazit normálně
            smartCounterCard.style.opacity = '1';
            if (chickensGrid) {
                chickensGrid.style.pointerEvents = 'auto';
            }
        } else {
            // Modul není připojen - zašednout a zablokovat
            smartCounterCard.style.opacity = '0.5';
            smartCounterCard.style.pointerEvents = 'none';

            // Přidat varování, pokud tam ještě není
            let warning = smartCounterCard.querySelector('.module-warning');
            if (!warning) {
                warning = document.createElement('div');
                warning.className = 'module-warning';
                warning.style.cssText = 'padding: 12px; background: #fef3c7; border-left: 4px solid #fbbf24; border-radius: 6px; margin-bottom: 15px;';
                warning.innerHTML = `
                    <div style="font-size: 13px; color: #92400e; font-weight: 600;">
                        ⚠️ RFID modul není připojen
                    </div>
                    <div style="font-size: 12px; color: #78350f; margin-top: 4px;">
                        Pro počítání vajec je potřeba mít připojený RFID reader nebo RFID gate modul.
                    </div>
                `;
                smartCounterCard.insertBefore(warning, smartCounterCard.children[1]);
            }
        }
    },

    /**
     * Přepne sekci mezi aktivním a neaktivním stavem
     */
    toggleSection(cardId, statusId, contentId, isActive, buttonsId = null) {
        const status = document.getElementById(statusId);
        const content = document.getElementById(contentId);
        const buttonContainers = [];

        if (Array.isArray(buttonsId)) {
            buttonsId.forEach(id => {
                const el = document.getElementById(id);
                if (el) buttonContainers.push(el);
            });
        } else if (typeof buttonsId === 'string' && buttonsId) {
            const el = document.getElementById(buttonsId);
            if (el) buttonContainers.push(el);
        }

        if (status && content) {
            if (isActive) {
                // Modul je připojen - zobrazit obsah, skrýt varování
                status.style.display = 'none';
                content.style.opacity = '1';
                content.style.pointerEvents = 'auto';

                // Povolit tlačítka pokud jsou specifikována
                buttonContainers.forEach(container => {
                    const allButtons = container.querySelectorAll('button');
                    allButtons.forEach(btn => btn.disabled = false);
                });
            } else {
                // Modul není připojen - zobrazit varování, zašednout obsah
                status.style.display = 'block';
                content.style.opacity = '0.3';
                content.style.pointerEvents = 'none';

                // Zablokovat tlačítka pokud jsou specifikována
                buttonContainers.forEach(container => {
                    const allButtons = container.querySelectorAll('button');
                    allButtons.forEach(btn => btn.disabled = true);
                });
            }
        }
    }
};
