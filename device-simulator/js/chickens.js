/**
 * Chickens Simulation - Device-based storage
 * Zařízení je zdrojem pravdy pro data o slepicích
 */

const chickens = {
    // Lokální úložiště slepic (device je source of truth)
    localChickens: [],
    chickensInside: new Set(), // Set RFID tagů slepic, které jsou uvnitř

    // Auto mode pro simulaci
    autoMode: false,
    interval: null,

    // RFID scanning
    scanningMode: false,
    scanningTimeout: null,
    scanningModuleId: null,
    autoScanTimeout: null,
    cachedRfidModuleId: null,

    // Legacy compatibility (for API sync if needed)
    chickensFromApi: [],
    pollingInterval: null,
    lastChickenCount: 0,
    currentCoopId: null,
    ownerId: null,

    /**
     * Vrátí ownerId – pokud není k dispozici, zkusí jej vytáhnout z JWT tokenu v localStorage.
     */
    resolveOwnerId() {
        if (this.ownerId) return this.ownerId;

        try {
            const token = localStorage.getItem('jwt_token');
            if (!token) return null;

            const parts = token.split('.');
            if (parts.length < 2) return null;
            const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
            const payload = JSON.parse(payloadStr);
            const candidate = payload.userId || payload.id || payload.sub;

            if (candidate) {
                this.ownerId = candidate;
                console.log('[Chickens] Owner ID resolved from JWT:', this.ownerId);
                return this.ownerId;
            }
        } catch (err) {
            console.warn('[Chickens] Failed to resolve ownerId from token:', err);
        }

        return null;
    },

    init() {
        // Načíst slepice z localStorage
        this.loadFromLocalStorage();
        this.update();

        // Auto mode vypnut ve výchozím stavu
        this.autoMode = false;
        const autoCheckbox = document.getElementById('autoRfid');
        if (autoCheckbox) {
            autoCheckbox.checked = false;
        }

        // Reset denního počítadla vajec každý den o půlnoci
        this.scheduleDailyReset();

        // Update module ID display
        this.updateModuleIdDisplay();
    },

    /**
     * Načte slepice z localStorage (device storage)
     */
    loadFromLocalStorage() {
        const deviceId = simulator.deviceId || 'default';
        const storageKey = `device_${deviceId}_chickens`;

        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const loadedChickens = JSON.parse(stored);

                // Pokud slepice nemají coopId, jsou staré a měly by být vymazány
                const hasInvalidChickens = loadedChickens.some(c => !c.coopId);

                if (hasInvalidChickens) {
                    console.log(`[Chickens] Našel jsem ${loadedChickens.length} starých slepic bez coopId - mažu localStorage`);
                    localStorage.removeItem(storageKey);
                    this.localChickens = [];
                } else {
                    this.localChickens = loadedChickens;
                    console.log(`[Chickens] Načteno ${this.localChickens.length} slepic z localStorage`);
                }
            } else {
                this.localChickens = [];
                console.log('[Chickens] Žádné slepice v localStorage, začínám s prázdným seznamem');
            }
        } catch (error) {
            console.error('[Chickens] Chyba při načítání z localStorage:', error);
            this.localChickens = [];
        }

        // Synchronizovat chickensFromApi pro zpětnou kompatibilitu
        this.chickensFromApi = [...this.localChickens];
    },

    /**
     * Uloží slepice do localStorage
     */
    saveToLocalStorage() {
        const deviceId = simulator.deviceId || 'default';
        const storageKey = `device_${deviceId}_chickens`;

        try {
            localStorage.setItem(storageKey, JSON.stringify(this.localChickens));
            console.log(`[Chickens] Uloženo ${this.localChickens.length} slepic do localStorage`);

            // Synchronizovat chickensFromApi pro zpětnou kompatibilitu
            this.chickensFromApi = [...this.localChickens];
        } catch (error) {
            console.error('[Chickens] Chyba při ukládání do localStorage:', error);
        }
    },

    /**
     * Naplánuje denní reset počítadla vajec
     */
    scheduleDailyReset() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const msUntilMidnight = tomorrow.getTime() - now.getTime();

        setTimeout(() => {
            this.resetDailyEggs();
            // Opakovat každých 24 hodin
            setInterval(() => this.resetDailyEggs(), 24 * 60 * 60 * 1000);
        }, msUntilMidnight);

        console.log(`[Chickens] Denní reset naplánován za ${Math.round(msUntilMidnight / 1000 / 60)} minut`);
    },

    /**
     * Resetuje denní počítadlo vajec pro všechny slepice
     */
    resetDailyEggs() {
        this.localChickens.forEach(chicken => {
            chicken.eggsToday = 0;
        });
        this.saveToLocalStorage();
        this.update();
        logger.log('🌅 Denní počítadlo vajec resetováno', 'info');
    },

    update() {
        // Počet slepic z lokálního úložiště
        const total = this.localChickens.length;
        const inside = this.chickensInside.size;
        const outside = total - inside;

        const insideEl = document.getElementById('chickensInside');
        const outsideEl = document.getElementById('chickensOutside');
        const totalEl = document.getElementById('chickensTotal');

        if (insideEl) insideEl.textContent = inside;
        if (outsideEl) outsideEl.textContent = outside;
        if (totalEl) totalEl.textContent = total;

        // Aktualizovat statistiky v RFID modulech
        if (typeof modules !== 'undefined' && modules.updateChickenStats) {
            modules.updateChickenStats();
        }

        // Obnovit Smart Counter karty
        if (typeof smartCounter !== 'undefined' && smartCounter.refresh) {
            smartCounter.refresh();
        }

        this.updateModuleIdDisplay();
    },

    updateModuleIdDisplay() {
        const moduleIdEl = document.getElementById('chickensModuleId');
        if (moduleIdEl) {
            const moduleId = this.cachedRfidModuleId;
            if (moduleId) {
                moduleIdEl.textContent = moduleId;
                if (moduleId === 'rfid-sn-001') {
                    moduleIdEl.textContent += ' (Fallback)';
                    moduleIdEl.style.color = '#d97706'; // amber-600
                } else {
                    moduleIdEl.style.color = '#059669'; // emerald-600
                }
            } else {
                moduleIdEl.textContent = 'Auto-detecting...';
                moduleIdEl.style.color = '#6b7280'; // gray-500
            }
        }
    },

    /**
     * CRUD: Přidat novou slepici
     */
    addChicken(name, tagId) {
        if (!name || !tagId) {
            logger.log('⚠️ Zadejte jméno a RFID tag', 'warning');
            return null;
        }

        // Zkontrolovat duplicitu tagu
        const existingChicken = this.localChickens.find(c => c.tagId === tagId);
        if (existingChicken) {
            logger.log(`⚠️ RFID tag ${tagId} je již použit pro slepici ${existingChicken.name}`, 'warning');
            return null;
        }

        const newChicken = {
            id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            tagId: tagId,
            eggsToday: 0,
            lastEggTime: null,
            addedDate: new Date().toISOString(),
            location: 'outside'
        };

        this.localChickens.push(newChicken);
        this.saveToLocalStorage();
        this.update();
        this.displayChickensList();

        logger.log(`✅ Slepice ${name} přidána (RFID: ${tagId})`, 'success');
        return newChicken;
    },

    /**
     * CRUD: Odstranit slepici
     */
    removeChicken(id) {
        const chicken = this.localChickens.find(c => c.id === id);
        if (!chicken) {
            logger.log('⚠️ Slepice nebyla nalezena', 'warning');
            return false;
        }

        const confirmed = confirm(`Opravdu chcete odstranit slepici "${chicken.name}"?`);
        if (!confirmed) {
            return false;
        }

        this.localChickens = this.localChickens.filter(c => c.id !== id);
        this.chickensInside.delete(chicken.tagId);
        this.saveToLocalStorage();
        this.update();
        this.displayChickensList();

        logger.log(`🗑️ Slepice ${chicken.name} odstraněna`, 'success');
        return true;
    },

    /**
     * CRUD: Upravit slepici
     */
    updateChicken(id, updates) {
        const chicken = this.localChickens.find(c => c.id === id);
        if (!chicken) {
            logger.log('⚠️ Slepice nebyla nalezena', 'warning');
            return false;
        }

        Object.assign(chicken, updates);
        this.saveToLocalStorage();
        this.update();
        this.displayChickensList();

        logger.log(`✏️ Slepice ${chicken.name} aktualizována`, 'success');
        return true;
    },

    /**
     * Přičte vejce slepici
     */
    incrementEggs(id) {
        const chicken = this.localChickens.find(c => c.id === id);
        if (!chicken) {
            logger.log('⚠️ Slepice nebyla nalezena', 'warning');
            return false;
        }

        chicken.eggsToday = (chicken.eggsToday || 0) + 1;
        chicken.lastEggTime = new Date().toISOString();
        this.saveToLocalStorage();
        this.update();

        logger.log(`🥚 Vejce zaznamenáno pro ${chicken.name} (celkem dnes: ${chicken.eggsToday})`, 'success');
        return true;
    },

    /**
     * Synchronizuje slepice se serverem
     * Sloučí lokální slepice se slepicemi z API
     */
    async syncWithServer() {
        if (!this.currentCoopId) {
            logger.log('⚠️ Není nastaveno ID kurníku pro synchronizaci', 'warning');
            return;
        }

        try {
            logger.log('🔄 Synchronizuji se serverem...', 'info');

            const config = ServerConfig.getConfig();
            const apiUrl = config.api?.url || 'http://localhost:5555';
            const token = localStorage.getItem('jwt_token');

            if (!token) {
                logger.log('⚠️ Pro synchronizaci je potřeba být přihlášen', 'warning');
                return;
            }

            const response = await fetch(`${apiUrl}/api/chickens/coop/${this.currentCoopId}`, {
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
            const serverChickens = Array.isArray(data) ? data : (data.chickens || []);

            // Sloučit se serveru s lokálními slepicemi
            this.mergeChickensFromServer(serverChickens);

            logger.log(`✅ Synchronizace dokončena (${serverChickens.length} slepic ze serveru)`, 'success');

        } catch (error) {
            console.error('[Chickens] Chyba při synchronizaci:', error);
            logger.log(`❌ Chyba při synchronizaci: ${error.message}`, 'error');
        }
    },

    /**
     * Sloučí slepice ze serveru s lokálními
     * Server chickens mají přednost pokud mají novější timestamp
     */
    mergeChickensFromServer(serverChickens) {
        const serverMap = new Map();

        // Zpracovat slepice ze serveru
        serverChickens.forEach(chicken => {
            const tagId = chicken.assignedTagId || (chicken.tags && chicken.tags[0]?.tagId) || null;
            const coopId = chicken.coopId;

            if (!tagId) {
                console.log('[Chickens] Slepice ze serveru bez RFID tagu:', chicken.name);
                return;
            }

            serverMap.set(tagId, {
                id: `server_${chicken.id}`,
                serverId: chicken.id, // Uložit původní server ID
                name: chicken.name || `Slepice #${chicken.id}`,
                tagId: tagId,
                coopId: coopId, // Uložit coopId
                eggsToday: 0, // Reset počítadla vajec
                lastEggTime: null,
                addedDate: chicken.createdAt || new Date().toISOString(),
                location: chicken.location || 'outside',
                synced: true // Označit jako synchronizovanou
            });
        });

        // Sloučit s lokálními slepicemi
        const merged = [];
        const processedTags = new Set();

        // Přidat lokální slepice, které PATŘÍ K AKTUÁLNÍMU KURNÍKU
        this.localChickens.forEach(localChicken => {
            const serverChicken = serverMap.get(localChicken.tagId);

            if (serverChicken) {
                // Slepice existuje na serveru - použít server data, ale zachovat eggsToday
                merged.push({
                    ...serverChicken,
                    eggsToday: localChicken.eggsToday || 0,
                    lastEggTime: localChicken.lastEggTime
                });
                processedTags.add(localChicken.tagId);
                console.log(`[Chickens] Sloučena: ${localChicken.name} (RFID: ${localChicken.tagId})`);
            } else if (localChicken.coopId === this.currentCoopId || !localChicken.synced) {
                // Slepice existuje pouze lokálně A (patří k aktuálnímu kurníku NEBO není synchronizovaná) - ponechat ji
                merged.push({
                    ...localChicken,
                    synced: false // Označit jako nesynchronizovanou
                });
                processedTags.add(localChicken.tagId);
                console.log(`[Chickens] Lokální (nesynchronizovaná): ${localChicken.name}`);
            } else {
                // Slepice patří k jinému kurníku - NEVKLÁDAT
                console.log(`[Chickens] Vynecháno (jiný kurník): ${localChicken.name} (coopId: ${localChicken.coopId} vs ${this.currentCoopId})`);
            }
        });

        // Přidat nové slepice ze serveru, které nejsou lokálně
        serverMap.forEach((serverChicken, tagId) => {
            if (!processedTags.has(tagId)) {
                merged.push(serverChicken);
                console.log(`[Chickens] Nová ze serveru: ${serverChicken.name} (RFID: ${tagId})`);
            }
        });

        this.localChickens = merged;
        this.saveToLocalStorage();
        this.update();
        this.displayChickensList();

        logger.log(`📊 Sloučeno: ${merged.length} slepic celkem`, 'info');
    },

    /**
     * Odešle slepici na server
     */
    async pushChickenToServer(chicken) {
        if (!this.currentCoopId) {
            console.log('[Chickens] Nelze odeslat slepici - není nastaveno coopId');
            return false;
        }

        try {
            const config = ServerConfig.getConfig();
            const apiUrl = config.api?.url || 'http://localhost:5555';
            const token = localStorage.getItem('jwt_token');

            if (!token) {
                console.log('[Chickens] Nelze odeslat slepici - není přihlášen');
                return false;
            }

            // Vytvořit slepici na serveru
            const response = await fetch(`${apiUrl}/api/chickens`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: chicken.name,
                    coopId: this.currentCoopId,
                    assignedTagId: chicken.tagId,
                    location: chicken.location || 'outside'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const createdChicken = await response.json();

            // Aktualizovat lokální slepici s server ID
            chicken.serverId = createdChicken.id;
            chicken.id = `server_${createdChicken.id}`;
            chicken.synced = true;
            this.saveToLocalStorage();

            console.log(`[Chickens] Slepice ${chicken.name} odeslána na server (ID: ${createdChicken.id})`);
            return true;

        } catch (error) {
            console.error('[Chickens] Chyba při odesílání slepice na server:', error);
            return false;
        }
    },

    /**
     * Načte slepice z API (legacy metoda - nyní jen pro kompatibilitu)
     */
    async loadFromApi(coopId = null) {
        const coopIdInput = document.getElementById('coopIdForChickens');
        const coopIdToUse = coopId || coopIdInput?.value;
        const loadBtn = document.getElementById('loadChickensBtn');
        const statusText = document.getElementById('chickensLoadStatus');

        if (!coopIdToUse) {
            logger.log('⚠️ Zadejte ID kurníku', 'warning');
            if (statusText) {
                statusText.textContent = '⚠️ Zadejte ID kurníku';
                statusText.style.color = '#ef4444';
            }
            return;
        }

        // Pokud se mění kurník, vymazat lokální slepice
        if (this.currentCoopId && this.currentCoopId !== coopIdToUse) {
            console.log(`[Chickens] Změna kurníku z ${this.currentCoopId} na ${coopIdToUse} - mažu lokální data`);
            this.localChickens = [];
            this.chickensInside.clear();
            localStorage.removeItem('localChickens');
        }

        // Uložit aktuální coopId pro synchronizaci
        this.currentCoopId = coopIdToUse;

        // Pokud je zadáno v inputu, aktualizovat hodnotu
        if (coopIdInput) {
            if (coopId) {
                coopIdInput.value = coopId;
            }
            // Aktualizovat placeholder
            coopIdInput.placeholder = coopId ? `ID kurníku: ${coopId}` : 'ID kurníku (automaticky detekováno)';
        }

        try {
            if (loadBtn) loadBtn.disabled = true;
            if (statusText) {
                statusText.textContent = '⏳ Synchronizuji slepice...';
                statusText.style.color = '#6b7280';
            }

            // Použít syncWithServer pro synchronizaci
            await this.syncWithServer();

            // Aktualizovat status text
            if (statusText) {
                statusText.textContent = `✅ Synchronizováno: ${this.localChickens.length} slepic`;
                statusText.style.color = '#10b981';
                statusText.style.fontWeight = 'normal';
            }

            // Obnovit zobrazení RFID modulů, aby se aktualizovaly informace o slepicích
            if (typeof modules !== 'undefined' && modules.refresh) {
                modules.refresh();
            }

            // Obnovit Smart Counter dropdown
            if (typeof smartCounter !== 'undefined' && smartCounter.loadChickens) {
                smartCounter.loadChickens();
            }
        } catch (error) {
            console.error('Chyba při načítání slepic:', error);
            logger.log(`❌ Chyba při načítání slepic: ${error.message}`, 'error');
            if (statusText) {
                statusText.textContent = `❌ Chyba: ${error.message}`;
                statusText.style.color = '#ef4444';
            }
        } finally {
            if (loadBtn) loadBtn.disabled = false;
        }
    },

    /**
     * Zobrazí seznam slepic (karty)
     */
    displayChickensList() {
        const container = document.getElementById('chickensListContainer');
        const list = document.getElementById('chickensList');

        if (!container || !list) return;

        if (this.localChickens.length === 0) {
            container.style.display = 'block';
            list.innerHTML = `
                <div style="padding: 30px; text-align: center; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 10px; border: 2px dashed #fbbf24;">
                    <div style="font-size: 48px; margin-bottom: 10px; opacity: 0.5;">🐔</div>
                    <div style="font-size: 14px; color: #92400e; font-weight: 600; margin-bottom: 4px;">Žádné slepice v zařízení</div>
                    <div style="font-size: 12px; color: #78350f;">Přidejte slepici pomocí tlačítka "➕ Přidat slepici"</div>
                </div>
            `;
            return;
        }

        container.style.display = 'block';

        list.innerHTML = this.localChickens.map((chicken) => {
            const isInside = this.chickensInside.has(chicken.tagId);
            const sanitizedName = chicken.name ? chicken.name.replace(/'/g, "\\'") : '';
            const sanitizedTagId = chicken.tagId ? chicken.tagId.replace(/'/g, "\\'") : '';
            const sanitizedId = String(chicken.id).replace(/'/g, "\\'");
            const isSynced = chicken.synced !== false; // Default true pro zpětnou kompatibilitu

            // Barvy podle stavu
            const bgColor = isInside ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)';
            const borderColor = isInside ? '#10b981' : '#d1d5db';
            const statusIcon = isInside ? '🏠' : '🌳';
            const statusText = isInside ? 'Uvnitř kurníku' : 'Venku na výběhu';
            const statusColor = isInside ? '#065f46' : '#6b7280';

            return `
                <div class="chicken-item" style="
                    padding: 14px;
                    background: ${bgColor};
                    border-radius: 10px;
                    border: 2px solid ${borderColor};
                    position: relative;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    transition: all 0.2s;
                "
                onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; this.style.transform='translateY(-2px)';"
                onmouseout="this.style.boxShadow='0 2px 4px rgba(0,0,0,0.05)'; this.style.transform='translateY(0)';">
                    ${!isSynced ? `
                        <div style="position: absolute; top: 10px; right: 10px; background: #fbbf24; color: #78350f; padding: 4px 10px; border-radius: 12px; font-size: 10px; font-weight: 700; box-shadow: 0 2px 4px rgba(251, 191, 36, 0.3);">
                            ⚠️ Nesynchronizovaná
                        </div>
                    ` : ''}

                    <div style="display: flex; gap: 12px; margin-bottom: 12px;">
                        <!-- Ikona slepice -->
                        <div style="flex-shrink: 0; width: 48px; height: 48px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                            🐔
                        </div>

                        <!-- Info o slepici -->
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 700; color: #1f2937; font-size: 15px; margin-bottom: 6px;">
                                ${chicken.name}
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                <span style="font-size: 10px; color: #6b7280; font-weight: 600; text-transform: uppercase;">RFID:</span>
                                <code style="background: rgba(255,255,255,0.8); padding: 3px 8px; border-radius: 4px; font-family: monospace; font-size: 11px; color: #374151; font-weight: 600; border: 1px solid rgba(0,0,0,0.1);">${chicken.tagId}</code>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <span style="font-size: 11px; color: ${statusColor}; font-weight: 600; display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.6); padding: 3px 8px; border-radius: 12px;">
                                    ${statusIcon} ${statusText}
                                </span>
                                ${isSynced ? '<span style="font-size: 11px; color: #059669; font-weight: 600; display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.6); padding: 3px 8px; border-radius: 12px;">✅ Synced</span>' : ''}
                                ${chicken.eggsToday > 0 ? `<span style="font-size: 11px; color: #dc2626; font-weight: 600; display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.6); padding: 3px 8px; border-radius: 12px;">🥚 ${chicken.eggsToday} dnes</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Tlačítka akce -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
                        <button class="btn btn-success btn-small"
                                onclick="chickens.simulateEnter('${sanitizedTagId}', '${sanitizedName}', '${sanitizedId}')"
                                ${isInside ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}
                                title="Simulovat vstup dovnitř"
                                style="padding: 8px 4px; font-size: 11px; font-weight: 600;">
                            🏠 Vstup
                        </button>
                        <button class="btn btn-secondary btn-small"
                                onclick="chickens.simulateExit('${sanitizedTagId}', '${sanitizedName}', '${sanitizedId}')"
                                ${!isInside ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}
                                title="Simulovat výstup ven"
                                style="padding: 8px 4px; font-size: 11px; font-weight: 600;">
                            🌳 Výstup
                        </button>
                        <button class="btn btn-danger btn-small"
                                onclick="chickens.removeChicken('${sanitizedId}')"
                                title="Odstranit slepici"
                                style="padding: 8px 4px; font-size: 11px; font-weight: 600;">
                            🗑️ Smazat
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Vymaže seznam slepic z API
     */
    clearList() {
        this.chickensFromApi = [];
        this.chickensInside.clear();
        this.currentCoopId = null;
        this.stopPolling();
        this.cachedRfidModuleId = null;
        const container = document.getElementById('chickensListContainer');
        if (container) container.style.display = 'none';
        logger.log('🗑️ Seznam slepic vymazán', 'info');
    },

    /**
     * Spustí polling pro kontrolu nových slepic
     */
    startPolling() {
        this.stopPolling();

        if (!this.currentCoopId) return;

        // Kontrolovat každých 10 sekund
        this.pollingInterval = setInterval(() => {
            if (this.currentCoopId) {
                console.log('[Chickens] Polling: Kontroluji nové slepice...');
                this.loadFromApi(this.currentCoopId);
            }
        }, 10000); // Každých 10 sekund
    },

    /**
     * Zastaví polling
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    },

    /**
     * Zobrazí notifikaci o nových slepicích
     */
    showNewChickensNotification(newChickens) {
        const statusText = document.getElementById('chickensLoadStatus');
        if (!statusText) return;

        // Zobrazit notifikaci s animací
        statusText.innerHTML = `🆕 <strong>${newChickens.length} nových slepic!</strong> ${newChickens.map(c => c.name).join(', ')}`;
        statusText.style.color = '#10b981';
        statusText.style.fontWeight = '600';
        statusText.style.animation = 'pulse 2s ease-in-out';

        // Přidat CSS animaci, pokud ještě není
        if (!document.getElementById('pulseAnimationStyle')) {
            const style = document.createElement('style');
            style.id = 'pulseAnimationStyle';
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            `;
            document.head.appendChild(style);
        }

        // Po 5 sekundách vrátit normální text
        setTimeout(() => {
            if (statusText) {
                statusText.textContent = `✅ Načteno ${this.chickensFromApi.length} slepic (aktualizováno z backendu)`;
                statusText.style.fontWeight = 'normal';
                statusText.style.animation = 'none';
            }
        }, 5000);
    },

    /**
     * Obnoví seznam slepic z API (bez změny coopId)
     */
    async refreshFromApi() {
        if (this.currentCoopId) {
            logger.log('🔄 Obnovuji seznam slepic...', 'info');
            await this.loadFromApi(this.currentCoopId);
        } else {
            logger.log('⚠️ Není nastaveno ID kurníku. Použijte tlačítko "Načíst"', 'warning');
        }
    },

    /**
     * Simuluje vstup konkrétní slepice
     */
    simulateEnter(tagId, chickenName, chickenId = null) {
        if (!tagId) {
            logger.log('⚠️ Slepice nemá RFID tag', 'warning');
            return;
        }

        if (this.chickensInside.has(tagId)) {
            logger.log(`🐔 ${chickenName} je už uvnitř`, 'warning');
            return;
        }

        // Najít slepici podle tagId nebo ID
        let chicken = this.localChickens.find(c => c.tagId === tagId);
        if (!chicken && chickenId) {
            chicken = this.localChickens.find(c => c.id === chickenId);
        }

        this.chickensInside.add(tagId);
        this.update();
        logger.log(`🐔 ${chickenName} vchází (RFID: ${tagId})`, 'success');
        this.publishRfidEvent('enter', tagId, chickenName, chicken?.id);
        this.publishStatus();
        this.displayChickensList();
    },

    /**
     * Simuluje výstup konkrétní slepice
     */
    simulateExit(tagId, chickenName, chickenId = null) {
        if (!tagId) {
            logger.log('⚠️ Slepice nemá RFID tag', 'warning');
            return;
        }

        if (!this.chickensInside.has(tagId)) {
            logger.log(`🐔 ${chickenName} není uvnitř`, 'warning');
            return;
        }

        // Najít slepici podle tagId nebo ID
        let chicken = this.localChickens.find(c => c.tagId === tagId);
        if (!chicken && chickenId) {
            chicken = this.localChickens.find(c => c.id === chickenId);
        }

        this.chickensInside.delete(tagId);
        this.update();
        logger.log(`🐔 ${chickenName} vychází (RFID: ${tagId})`, 'success');
        this.publishRfidEvent('exit', tagId, chickenName, chicken?.id);
        this.publishStatus();
        this.displayChickensList();
    },

    enter() {
        // Použít náhodnou slepici z lokálního úložiště
        const availableChickens = this.localChickens.filter(c => !this.chickensInside.has(c.tagId));
        if (availableChickens.length === 0) {
            logger.log('🐔 Všechny slepice jsou uvnitř', 'warning');
            return;
        }
        const randomChicken = availableChickens[Math.floor(Math.random() * availableChickens.length)];
        this.simulateEnter(randomChicken.tagId, randomChicken.name, randomChicken.id);
    },

    exit() {
        // Použít náhodnou slepici z lokálního úložiště
        const insideChickens = this.localChickens.filter(c => this.chickensInside.has(c.tagId));
        if (insideChickens.length === 0) {
            logger.log('🐔 Žádné slepice uvnitř', 'warning');
            return;
        }
        const randomChicken = insideChickens[Math.floor(Math.random() * insideChickens.length)];
        this.simulateExit(randomChicken.tagId, randomChicken.name, randomChicken.id);
    },

    toggleAuto(enabled) {
        this.autoMode = enabled;
        if (enabled) {
            this.startAuto();
        } else {
            this.stopAuto();
        }
    },

    startAuto() {
        this.stopAuto();
        this.interval = setInterval(() => {
            // Random RFID events
            if (this.localChickens.length === 0) return;

            if (Math.random() > 0.5) {
                const availableChickens = this.localChickens.filter(c => !this.chickensInside.has(c.tagId));
                const insideChickens = this.localChickens.filter(c => this.chickensInside.has(c.tagId));

                if (availableChickens.length > 0 && Math.random() > 0.3) {
                    const randomChicken = availableChickens[Math.floor(Math.random() * availableChickens.length)];
                    this.simulateEnter(randomChicken.tagId, randomChicken.name, randomChicken.id);
                } else if (insideChickens.length > 0 && Math.random() > 0.3) {
                    const randomChicken = insideChickens[Math.floor(Math.random() * insideChickens.length)];
                    this.simulateExit(randomChicken.tagId, randomChicken.name, randomChicken.id);
                }
            }
        }, 15000); // Every 15 seconds
    },

    stopAuto() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    },

    async publishRfidEvent(direction, tagId = null, chickenName = null, chickenId = null) {
        if (!simulator.isConnected()) {
            return;
        }

        // Zkusit získat modul z cache/API, jinak použít lokálně známý, jinak fallback
        let resolvedModuleId = this.cachedRfidModuleId || await this.getRfidModuleId();
        if (!resolvedModuleId && typeof modules !== 'undefined') {
            const connectedRfid = (modules.connectedModules || []).find(m =>
                m.type === 'rfid' || m.type === 'rfid-gate' || m.type === 'rfid-reader'
            );
            resolvedModuleId = connectedRfid?.moduleId;
        }
        if (!resolvedModuleId) {
            // Poslední záchrana pro simulátor, aby se událost vůbec odeslala
            resolvedModuleId = 'rfid-sn-001';
            logger.log(`⚠️ Používám fallback RFID moduleId ${resolvedModuleId} (nenašel jsem skutečný modul)`, 'warning');
        }
        this.cachedRfidModuleId = resolvedModuleId;

        // Pokud nejsou poskytnuty, použít náhodné hodnoty (fallback)
        const rfidTag = tagId || ('RFID_' + Math.random().toString(16).substr(2, 8).toUpperCase());
        const name = chickenName || `Slepička ${Math.floor(Math.random() * 10) + 1}`;

        // Normalizovat chickenId (serverId > numeric part > fallback string)
        let normalizedChickenId = null;
        if (chickenId) {
            const numeric = parseInt(String(chickenId).replace(/[^0-9]/g, ''), 10);
            normalizedChickenId = Number.isNaN(numeric) ? chickenId : numeric;
        }

        // Nová struktura: smartcoop/{deviceId}/modules/{moduleId}/rfid_scan
        const deviceId = simulator.deviceId || document.getElementById('deviceId')?.value || 'unknown';
        const topic = `smartcoop/${deviceId}/modules/${resolvedModuleId}/rfid_scan`;
        const payload = {
            type: 'rfid_scan',
            moduleId: resolvedModuleId,
            deviceId: deviceId,
            tagId: rfidTag,
            direction: direction === 'enter' ? 'in' : 'out',
            timestamp: new Date().toISOString(),
            chickenName: name,
            ...(normalizedChickenId ? { chickenId: normalizedChickenId } : {})
        };

        console.log(`[Chickens][MQTT] → ${topic} | deviceId=${deviceId} moduleId=${resolvedModuleId} dir=${payload.direction} tag=${rfidTag}`);
        simulator.publish(topic, payload);
    },

    publishStatus() {
        if (simulator.isConnected()) {
            const total = this.localChickens.length;
            const inside = this.chickensInside.size;

            // Status pro slepice: smartcoop/{deviceId}/status
            const topic = `smartcoop/${simulator.deviceId}/status`;
            const payload = {
                chickensInCoop: inside,
                chickensOutside: total - inside,
                totalChickens: total,
                timestamp: Date.now()
            };
            simulator.publish(topic, payload);
        }
    },

    /**
     * Získá slepici podle RFID tagu
     */
    getChickenByTag(tagId) {
        return this.localChickens.find(c => c.tagId === tagId);
    },

    /**
     * Získá slepici podle ID
     */
    getChickenById(id) {
        return this.localChickens.find(c => c.id === id);
    },

    /**
     * Zobrazí formulář pro přidání slepice
     */
    showAddChickenForm() {
        const container = document.getElementById('addChickenContainer');
        const btn = document.getElementById('addChickenBtn');

        if (container && btn) {
            container.style.display = 'block';
            btn.style.display = 'none';

            // Vyčistit formulář
            const nameInput = document.getElementById('newChickenName');
            const tagInput = document.getElementById('newChickenTag');
            if (nameInput) nameInput.value = '';
            if (tagInput) tagInput.value = '';

            logger.log('📝 Formulář pro přidání slepice otevřen', 'info');
        }
    },

    /**
     * Zruší přidání slepice
     */
    cancelAddChicken() {
        const container = document.getElementById('addChickenContainer');
        const btn = document.getElementById('addChickenBtn');

        if (container && btn) {
            container.style.display = 'none';
            btn.style.display = 'block';
        }

        this.stopScanning();
        logger.log('❌ Přidání slepice zrušeno', 'info');
    },

    /**
     * Vygeneruje náhodný RFID tag pro novou slepici
     */
    generateRandomTagForNewChicken() {
        const tagInput = document.getElementById('newChickenTag');
        if (tagInput) {
            tagInput.value = 'RFID_' + Math.random().toString(16).substr(2, 8).toUpperCase();
            logger.log('🎲 Vygenerován RFID tag: ' + tagInput.value, 'info');
        }
    },

    /**
     * Spustí skenování RFID pro novou slepici
     */
    scanRfidForNewChicken() {
        // Simulace skenování - automaticky vygeneruje tag
        this.generateRandomTagForNewChicken();
        logger.log('📡 Simulováno skenování RFID tagu', 'info');
    },

    /**
     * Potvrdí přidání nové slepice
     */
    async confirmAddChicken() {
        const nameInput = document.getElementById('newChickenName');
        const tagInput = document.getElementById('newChickenTag');

        if (!nameInput || !tagInput) {
            logger.log('❌ Chyba: Formulář nebyl nalezen', 'error');
            return;
        }

        const name = nameInput.value.trim();
        const tagId = tagInput.value.trim();

        if (!name) {
            logger.log('⚠️ Zadejte jméno slepice', 'warning');
            nameInput.focus();
            return;
        }

        if (!tagId) {
            logger.log('⚠️ Zadejte nebo vygenerujte RFID tag', 'warning');
            tagInput.focus();
            return;
        }

        // Přidat slepici lokálně
        const newChicken = this.addChicken(name, tagId);

        if (newChicken) {
            // Zavřít formulář
            this.cancelAddChicken();

            // Publikovat událost o nové slepici přes MQTT
            if (simulator.isConnected()) {
                const topic = `smartcoop/${simulator.deviceId}/chicken_added`;
                const payload = {
                    chicken: newChicken,
                    timestamp: new Date().toISOString()
                };
                simulator.publish(topic, payload);
            }

            // Automaticky odeslat na server (pokud je připojeno)
            if (this.currentCoopId) {
                const pushed = await this.pushChickenToServer(newChicken);
                if (pushed) {
                    logger.log(`📤 Slepice ${name} automaticky odeslána na server`, 'success');
                    this.displayChickensList(); // Obnovit zobrazení se sync statusem
                } else {
                    logger.log(`ℹ️ Slepice ${name} přidána lokálně (nesynchronizovaná)`, 'info');
                }
            }
        }
    },

    /**
     * Spustí režim skenování RFID tagů (pro registraci slepic - legacy)
     */
    startScanning(moduleId = null, options = {}) {
        this.scanningMode = true;
        this.scanningModuleId = moduleId;

        logger.log('📡 Režim RFID skenování aktivován - připraveno k registraci slepic', options.silent ? 'debug' : 'info');
    },

    /**
     * Smaže slepici přes API a aktualizuje seznam
     */
    async deleteChicken(chickenId, chickenName, tagId = null) {
        if (!chickenId) {
            logger.log('⚠️ Nelze smazat neznámou slepici.', 'warning');
            return;
        }

        const confirmed = confirm(`Opravdu chcete smazat slepici "${chickenName}"?`);
        if (!confirmed) {
            return;
        }

        const config = ServerConfig.getConfig();
        const apiUrl = config.api?.url || 'http://localhost:5555';
        const token = localStorage.getItem('jwt_token');

        if (!token) {
            logger.log('⚠️ Pro mazání slepic je nutné být přihlášen v Management Console.', 'warning');
            return;
        }

        try {
            const response = await fetch(`${apiUrl}/api/chickens/${chickenId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                const message = errorBody?.message || `HTTP ${response.status}`;
                throw new Error(message);
            }

            // Aktualizovat lokální stav
            this.chickensFromApi = this.chickensFromApi.filter(c => c.id !== chickenId);
            if (tagId) {
                this.chickensInside.delete(tagId);
            }
            this.total = this.chickensFromApi.length;
            this.inside = this.chickensInside.size;
            this.update();
            this.displayChickensList();

            logger.log(`🗑️ Slepice "${chickenName}" byla smazána.`, 'success');
        } catch (error) {
            console.error('Chyba při mazání slepice:', error);
            logger.log(`❌ Chyba při mazání slepice: ${error.message}`, 'error');
        }
    },

    /**
     * Zastaví režim skenování
     */
    stopScanning() {
        this.scanningMode = false;
        this.scanningModuleId = null;
        const container = document.getElementById('rfidScanningContainer');
        const statusText = document.getElementById('rfidScanningStatus');

        if (this.scanningTimeout) {
            clearTimeout(this.scanningTimeout);
            this.scanningTimeout = null;
        }
        if (this.autoScanTimeout) {
            clearTimeout(this.autoScanTimeout);
            this.autoScanTimeout = null;
        }

        if (container) {
            container.style.display = 'none';
        }

        logger.log('⏹️ Režim RFID skenování zastaven', 'info');
    },

    /**
     * Vygeneruje náhodný RFID tag
     */
    generateRandomTag(updateInput = true) {
        const tagInput = document.getElementById('rfidTagInput');
        const randomTag = 'RFID_' + Math.random().toString(16).substr(2, 8).toUpperCase();
        if (updateInput && tagInput) {
            tagInput.value = randomTag;
        }
        return randomTag;
    },

    /**
     * Simuluje skenování RFID tagu
     */
    async simulateTagScan() {
        if (!this.scanningMode) {
            logger.log('⚠️ Režim skenování není aktivní', 'warning');
            return;
        }

        const tagInput = document.getElementById('rfidTagInput');
        const tagId = tagInput?.value?.trim();
        const statusText = document.getElementById('rfidScanningStatus');

        if (!tagId) {
            logger.log('⚠️ Zadejte RFID tag', 'warning');
            if (statusText) {
                statusText.textContent = '⚠️ Zadejte RFID tag';
                statusText.style.color = '#dc2626';
            }
            return;
        }

        // Zkontrolovat, zda tag už není přiřazen slepici
        const existingChicken = this.getChickenByTag(tagId);
        if (existingChicken) {
            logger.log(`⚠️ RFID tag ${tagId} je už přiřazen slepici: ${existingChicken.name}`, 'warning');
            if (statusText) {
                statusText.textContent = `⚠️ Tag ${tagId} je už přiřazen slepici: ${existingChicken.name}`;
                statusText.style.color = '#dc2626';
            }
            return;
        }

        if (statusText) {
            statusText.textContent = '⏳ Publikuji RFID tag...';
            statusText.style.color = '#78350f';
        }

        // Publikovat UNKNOWN RFID scan na primární topic:
        // smartcoop/{deviceId}/modules/{moduleId}/rfid_scan
        // Backend ho zpracuje a odešle echo na user/{userId}/devices/{deviceId}/modules/{moduleId}/rfid_scan

        const moduleId = await this.getRfidModuleId(this.scanningModuleId);
        if (!moduleId) {
            logger.log('❌ Nepodařilo se zjistit RFID modul pro registraci', 'error');
            if (statusText) {
                statusText.textContent = '❌ Nepodařilo se zjistit RFID modul';
                statusText.style.color = '#dc2626';
            }
            return;
        }

        const success = await this.publishRegistrationTag(tagId, moduleId, { updateStatus: true });
        if (!success) {
            if (statusText) {
                statusText.textContent = '❌ Nepodařilo se publikovat RFID tag';
                statusText.style.color = '#dc2626';
            }
            return;
        }

        logger.log(`✅ RFID tag ${tagId} publikován, připraven k registraci`, 'success');
        if (statusText) {
            statusText.textContent = `✅ Tag ${tagId} připraven k registraci`;
            statusText.style.color = '#059669';
        }

        // Po 2 sekundách obnovit seznam slepic (aby se zobrazila nová slepice)
        setTimeout(() => {
            if (this.currentCoopId) {
                this.loadFromApi(this.currentCoopId);
            }
        }, 2000);
    },

    updateModuleIdDisplay() {
        const moduleIdEl = document.getElementById('chickensModuleId');
        if (moduleIdEl) {
            const moduleId = this.cachedRfidModuleId;
            if (moduleId) {
                moduleIdEl.textContent = moduleId;
                if (moduleId === 'rfid-sn-001') {
                    moduleIdEl.textContent += ' (Fallback)';
                    moduleIdEl.style.color = '#d97706'; // amber-600
                } else {
                    moduleIdEl.style.color = '#059669'; // emerald-600
                }
            } else {
                moduleIdEl.textContent = 'Auto-detecting...';
                moduleIdEl.style.color = '#6b7280'; // gray-500
            }
        }
    },

    async getRfidModuleId(preferredModuleId = null) {
        // Pro jistotu zkusit zjistit ownerId dřív, než budeme publikovat user topic
        this.resolveOwnerId();

        if (preferredModuleId) {
            this.cachedRfidModuleId = preferredModuleId;
            return preferredModuleId;
        }
        if (this.cachedRfidModuleId) {
            return this.cachedRfidModuleId;
        }
        try {
            const config = ServerConfig.getConfig();
            const apiUrl = config.api?.url || 'http://localhost:5555';
            const token = localStorage.getItem('jwt_token');
            const response = await fetch(`${apiUrl}/api/mqtt/devices/${simulator.deviceId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                const deviceData = await response.json();

                // Extract owner ID if available
                if (deviceData.device && deviceData.device.ownerInfo && deviceData.device.ownerInfo.id) {
                    this.ownerId = deviceData.device.ownerInfo.id;
                    console.log('[Chickens] Detected owner ID:', this.ownerId);
                }

                const rfidModule = deviceData.device?.mqttModules?.find(m =>
                    m.type === 'rfid-gate' || m.type === 'rfid' || m.type === 'rfid-reader'
                );
                if (rfidModule) {
                    const resolvedId = rfidModule.moduleId || rfidModule.moduleId;
                    if (resolvedId) {
                        this.cachedRfidModuleId = resolvedId;
                        this.updateModuleIdDisplay();
                        return resolvedId;
                    }
                }
            }
        } catch (error) {
            console.error('Chyba při získávání RFID modulů:', error);
        }
        this.updateModuleIdDisplay();
        return null;
    },

    async publishRegistrationTag(tagId, moduleId, options = {}) {
        if (!simulator.isConnected()) {
            logger.log('❌ Nelze publikovat RFID tag - MQTT není připojené', 'error');
            return false;
        }
        const resolvedModuleId = moduleId || await this.getRfidModuleId();
        if (!resolvedModuleId) {
            logger.log('❌ Nebyl nalezen žádný RFID modul pro registraci', 'error');
            return false;
        }
        this.cachedRfidModuleId = resolvedModuleId;

        const deviceId = simulator.deviceId || document.getElementById('deviceId')?.value || 'unknown';
        const topic = `smartcoop/${deviceId}/modules/${resolvedModuleId}/rfid_scan`;
        const payload = {
            type: 'rfid_scan',
            moduleId: resolvedModuleId,
            deviceId: deviceId,
            tagId: tagId,
            direction: 'in',
            context: 'pairing',
            timestamp: new Date().toISOString()
        };

        simulator.publish(topic, payload);
        logger.log(`📡 RFID scan (pairing) publikován na: ${topic}`, options.auto ? 'debug' : 'info');
        console.log('[Chickens] Published pairing scan to:', topic, payload);
        return true;
    },

    handleRemotePairingRequest(moduleId) {
        this.startScanning(moduleId, { silent: true });
        const tagId = this.generateRandomTag(false);
        logger.log(`📡 Přijata žádost o párování z frontendu pro modul ${moduleId}. Připravím tag ${tagId}`, 'info');

        if (this.autoScanTimeout) {
            clearTimeout(this.autoScanTimeout);
        }
        this.autoScanTimeout = setTimeout(async () => {
            await this.publishRegistrationTag(tagId, moduleId, { auto: true });
            this.stopScanning();
        }, 2000);
    },

    cancelRemotePairing() {
        logger.log('⏹️ Žádost o párování byla zrušena z frontendu', 'info');
        if (this.autoScanTimeout) {
            clearTimeout(this.autoScanTimeout);
            this.autoScanTimeout = null;
        }
        this.stopScanning();
    }
};
