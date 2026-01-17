/**
 * Smart Counter
 * Umožňuje zaznamenávat vajíčka pro konkrétní slepice
 * Každá slepice má vlastní počítadlo vajec
 */

const smartCounter = {
    init() {
        this.refresh();
    },

    /**
     * Obnoví zobrazení slepic v kartách
     */
    refresh() {
        const container = document.getElementById('smartCounterChickensGrid');
        const noChickensDiv = document.getElementById('smartCounterNoChickens');

        if (!container || !noChickensDiv) {
            console.error('[SmartCounter] UI elements not found');
            return;
        }

        // Získat slepice z lokálního úložiště
        const localChickens = chickens.localChickens || [];

        console.log('[SmartCounter] Refreshing chickens:', localChickens.length);

        if (localChickens.length === 0) {
            // Žádné slepice
            noChickensDiv.style.display = 'block';
            container.style.display = 'none';
            return;
        }

        // Zobrazit karty slepic
        noChickensDiv.style.display = 'none';
        container.style.display = 'grid';

        // Vygenerovat karty slepic
        container.innerHTML = localChickens.map(chicken => {
            const eggsToday = chicken.eggsToday || 0;
            const sanitizedId = String(chicken.id).replace(/'/g, "\\'");

            return `
                <div class="chicken-card" onclick="smartCounter.addEggForChicken('${sanitizedId}')"
                     style="cursor: pointer; padding: 16px; background: white; border: 2px solid #e5e7eb; border-radius: 12px;
                            transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
                     onmouseover="this.style.borderColor='#10b981'; this.style.boxShadow='0 4px 12px rgba(16,185,129,0.2)';"
                     onmouseout="this.style.borderColor='#e5e7eb'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.1)';">

                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: #1f2937; font-size: 15px; margin-bottom: 4px;">
                                ${chicken.name}
                            </div>
                            <div style="font-size: 11px; color: #6b7280;">
                                RFID: <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 10px;">${chicken.tagId}</code>
                            </div>
                        </div>
                        <div style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">
                            🐔
                        </div>
                    </div>

                    <div style="text-align: center; padding: 16px 0; border-top: 1px solid #f3f4f6; border-bottom: 1px solid #f3f4f6;">
                        <div style="font-size: 42px; font-weight: bold; color: #ef4444; line-height: 1;">
                            ${eggsToday}
                        </div>
                        <div style="font-size: 11px; color: #6b7280; margin-top: 4px; font-weight: 500;">
                            ${eggsToday === 1 ? 'vejce dnes' : 'vajec dnes'}
                        </div>
                    </div>

                    <div style="text-align: center; margin-top: 12px; font-size: 12px; color: #10b981; font-weight: 600;">
                        🥚 Klikněte pro přidání vejce
                    </div>
                </div>
            `;
        }).join('');

        console.log('[SmartCounter] Chickens displayed:', localChickens.length);
    },

    /**
     * Přidá vejce pro konkrétní slepici
     */
    addEggForChicken(chickenId) {
        const chicken = chickens.getChickenById(chickenId);

        if (!chicken) {
            logger.log('⚠️ Slepice nebyla nalezena', 'warning');
            return;
        }

        if (!simulator.isConnected()) {
            logger.log('❌ Nelze odeslat data - zařízení není připojeno k MQTT', 'error');
            return;
        }

        // Přidat vejce slepici
        const success = chickens.incrementEggs(chickenId);

        if (!success) {
            return;
        }

        // Obnovit zobrazení
        this.refresh();

        // Publikovat RFID událost (simulace skenu před snáškou)
        // Použít správný hierarchický topic pro RFID modul
        const rfidModuleId = 'rfid-sn-001'; // TODO: Získat dynamicky z modules
        const rfidTopic = `smartcoop/${simulator.deviceId}/modules/${rfidModuleId}/rfid_scan`;
        const chickenServerId = chicken.serverId || (typeof chicken.id === 'string' ? (parseInt(chicken.id, 10) || null) : chicken.id);
        const rfidMessage = {
            type: 'rfid_scan',
            moduleId: rfidModuleId,
            deviceId: simulator.deviceId,
            tagId: chicken.tagId,
            timestamp: new Date().toISOString(),
            chickenName: chicken.name,
            chickenId: chickenServerId,
            context: 'egg_laying'
        };
        simulator.publish(rfidTopic, rfidMessage);

        // Odeslat zprávu o detekci vejce na MQTT přes egg-counter modul
        const eggModuleId = 'egg-sn-001'; // TODO: Získat dynamicky z modules
        const eggTopic = `smartcoop/${simulator.deviceId}/modules/${eggModuleId}/egg_detected`;
        const eggMessage = {
            type: 'egg_detected',
            moduleId: eggModuleId,
            deviceId: simulator.deviceId,
            timestamp: new Date().toISOString(),
            chickenId: chickenServerId,
            chickenName: chicken.name,
            tagId: chicken.tagId,
            eggsToday: chicken.eggsToday
        };
        simulator.publish(eggTopic, eggMessage);

        // Animace karty
        const cards = document.querySelectorAll('.chicken-card');
        cards.forEach(card => {
            if (card.onclick && card.onclick.toString().includes(chickenId)) {
                card.style.transform = 'scale(1.05)';
                card.style.borderColor = '#10b981';
                setTimeout(() => {
                    card.style.transform = 'scale(1)';
                    card.style.borderColor = '#e5e7eb';
                }, 300);
            }
        });

        logger.log(`🥚 Vejce zaznamenáno pro ${chicken.name} (celkem dnes: ${chicken.eggsToday})`, 'success');
    }
};
