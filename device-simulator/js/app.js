/**
 * Main Application
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🤖 ESP32 Device Simulator initialized');

    // Load initial config
    const initialConfig = ServerConfig.getConfig();
    updateConnectionFields(initialConfig);

    // Initialize all modules
    sensors.init();
    door.init();
    chickens.init();
    smartCounter.init();
    if (typeof feeder !== 'undefined') {
        feeder.init();
    }
    if (typeof cameraModule !== 'undefined') {
        cameraModule.init();
    }
    network.init();
    system.init();

    // Setup modal click handlers (login modal se nesmí zavřít kliknutím na pozadí)
    document.querySelectorAll('.modal').forEach(modal => {
        const modalContent = modal.querySelector('.modal-content');
        const isLoginRequired = modal.hasAttribute('data-login-required');

        if (modalContent) {
            // Zastav propagaci pouze na modal-content (ne na jednotlivé prvky)
            modalContent.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A' && !e.target.closest('button') && !e.target.closest('a')) {
                    e.stopPropagation();
                }
            }, true);
        }

        // Zavři modal pouze při kliknutí přímo na modal (pozadí)
        // ALE: Login modal se NESMÍ zavřít kliknutím na pozadí!
        modal.addEventListener('click', (e) => {
            if (isLoginRequired) {
                return; // Login modal se nedá zavřít kliknutím na pozadí
            }

            // Zkontroluj, zda kliknutí bylo přímo na modal (ne na jeho děti)
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });

    // Setup device select change handler (programově pro spolehlivost)
    const deviceSelect = document.getElementById('deviceSelect');
    if (deviceSelect) {
        deviceSelect.addEventListener('change', (e) => {
            console.log('[DeviceSimulator] Device select changed via event listener:', e.target.value);
            switchDevice();
        });
        console.log('[DeviceSimulator] Device select event listener attached');
    } else {
        console.warn('[DeviceSimulator] deviceSelect element not found during initialization');
    }

    // Setup password input listener to hide warning when user zadává heslo
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            const statusDiv = document.getElementById('credentialsStatus');
            if (statusDiv) {
                statusDiv.style.display = 'none';
            }
        });
    }

    // Load devices from Management Console (načte seznam a případně obnoví výběr)
    console.log('[DeviceSimulator] Initializing - loading devices from Management Console');

    // Zkontrolovat token status
    updateTokenStatus();

    // Zkontroluj, zda je uživatel přihlášený
    const token = localStorage.getItem('jwt_token');
    if (!token) {
        await attemptAutoLoginOrPrompt();
    } else {
        // Načíst zařízení
        loadDevicesFromManagement();
    }

    // ESP32 Workflow: Po načtení zařízení z Management Console zkontrolovat credentials
    // (Credentials se načtou v loadDeviceFromManagement, pokud je zařízení vybrané)

    logger.log('🚀 Simulátor připraven', 'success');

    // Update system info every second
    setInterval(() => {
        system.update();
    }, 1000);
});

/**
 * Aktualizuje connection fields podle vybraného profilu
 * (Pouze při změně profilu - ne přepisuje ručně zadané hodnoty)
 */
function updateConnectionFields(config) {
    const deviceIdInput = document.getElementById('deviceId');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    console.log('[App] Updating connection fields for profile:', config.name);

    // 1. Nastavit MQTT credentials z profilu (pokud existují)
    if (config.credentials?.mqtt?.user && usernameInput) {
        usernameInput.value = config.credentials.mqtt.user;
    }

    if (config.credentials?.mqtt?.password && passwordInput) {
        passwordInput.value = config.credentials.mqtt.password;
    }

    // 2. Demo credentials mají přednost (pokud existují)
    if (config.credentials?.demo?.device && usernameInput) {
        usernameInput.value = config.credentials.demo.device;
    }
    if (config.credentials?.demo?.devicePassword && passwordInput) {
        passwordInput.value = config.credentials.demo.devicePassword;
        updateCredentialsStatus('<span>ℹ️</span> <span>Používá se tovární heslo z profilu.</span>', 'info');
    }

    // 3. Coop ID (pokud není vyplněno)
    if (config.credentials?.demo?.coopId && deviceIdInput && !deviceIdInput.value) {
        deviceIdInput.value = config.credentials.demo.coopId;
    }

    console.log('✅ Profile changed:', ServerConfig.getActiveProfile());

    // Update Server Info UI
    const mqttUrlDisplay = document.getElementById('mqttUrlDisplay');
    const apiUrlDisplay = document.getElementById('apiUrlDisplay');
    const serverProfileSelect = document.getElementById('serverProfile');

    if (mqttUrlDisplay) mqttUrlDisplay.textContent = config.mqtt.url;
    if (apiUrlDisplay) apiUrlDisplay.textContent = config.api.url;

    // Sync dropdown if needed (e.g. on init)
    if (serverProfileSelect && serverProfileSelect.value !== ServerConfig.getActiveProfile()) {
        serverProfileSelect.value = ServerConfig.getActiveProfile();
    }
}

/**
 * Change server profile from UI
 */
function changeServerProfile(profileKey) {
    if (ServerConfig.setActiveProfile(profileKey)) {
        const config = ServerConfig.getConfig();
        updateConnectionFields(config);

        // If connected, disconnect to force reconnection with new settings
        if (simulator.isConnected()) {
            simulator.disconnect();
            logger.log(`🔄 Server změněn na ${config.name}. Prosím připojte se znovu.`, 'info');
        } else {
            logger.log(`✅ Server profil nastaven: ${config.name}`, 'success');
        }
    }
}

function toggleCredentialsEdit() {
    const deviceIdInput = document.getElementById('deviceId');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    const isReadonly = deviceIdInput.hasAttribute('readonly');

    if (isReadonly) {
        // Odemknout pro úpravy
        deviceIdInput.removeAttribute('readonly');
        usernameInput.removeAttribute('readonly');
        passwordInput.removeAttribute('readonly');

        deviceIdInput.style.backgroundColor = '#ffffff';
        usernameInput.style.backgroundColor = '#ffffff';
        passwordInput.style.backgroundColor = '#ffffff';

        deviceIdInput.style.cursor = 'text';
        usernameInput.style.cursor = 'text';
        passwordInput.style.cursor = 'text';

        logger.log('🔓 Credentials odemčeny pro manuální úpravu', 'info');

        // Změnit text tlačítka
        event.target.innerHTML = '🔒 Zamknout';
        event.target.title = 'Zamknout pole (návrat k auto-režimu)';
    } else {
        // Zamknout zpět
        deviceIdInput.setAttribute('readonly', 'readonly');
        usernameInput.setAttribute('readonly', 'readonly');
        passwordInput.setAttribute('readonly', 'readonly');

        deviceIdInput.style.backgroundColor = '#f9fafb';
        usernameInput.style.backgroundColor = '#f9fafb';
        passwordInput.style.backgroundColor = '#f9fafb';

        deviceIdInput.style.cursor = 'not-allowed';
        usernameInput.style.cursor = 'not-allowed';
        passwordInput.style.cursor = 'not-allowed';

        logger.log('🔒 Credentials zamčeny', 'info');

        // Změnit text tlačítka
        event.target.innerHTML = '🔓 Upravit';
        event.target.title = 'Odemknout pro manuální úpravu (testování)';
    }
}

/**
 * Auto-generuje username a password z Device ID
 */
function updateCredentialsFromDeviceId() {
    const deviceId = document.getElementById('deviceId').value;
    if (!deviceId) {
        alert('⚠️ Zadejte nejprve Device ID');
        return;
    }

    // Generuj username: device_{id}
    document.getElementById('username').value = `device_${deviceId}`;

    // Generuj password: dev_{random}
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    document.getElementById('password').value = `dev_${randomSuffix}`;

    logger.log(`🔄 Credentials auto-generovány pro Device ID: ${deviceId}`, 'info');
}

/**
 * Zobrazí modal pro autorizaci zařízení s předvyplněným Device ID
 * @param {string} deviceId - Device ID (volitelné)
 */
function showDeviceAuthModal(deviceId = null) {
    const modal = document.getElementById('authModal');
    const deviceIdInput = document.getElementById('authDeviceId');
    const passwordInput = document.getElementById('authPassword');
    const errorDiv = document.getElementById('authError');

    if (deviceId) {
        deviceIdInput.value = deviceId;
    }

    // Vymazat password a error
    passwordInput.value = '';
    errorDiv.style.display = 'none';

    if (modal) {
        modal.classList.add('active');
        // Focus na password input
        setTimeout(() => {
            passwordInput.focus();
        }, 100);
    }
}

/**
 * Zobrazí dialog a vyzve k nové autorizaci při neplatných credentials
 */
function promptDeviceReauth(deviceId, errorMessage = '') {
    // Ulož Device ID do modal formuláře a zobraz informaci
    showDeviceAuthModal(deviceId);

    const authError = document.getElementById('authError');
    if (authError) {
        authError.textContent = `MQTT přihlášení selhalo (${errorMessage || 'neznámá chyba'}). Prosím zadejte tovární heslo zařízení a obnovte credentials.`;
        authError.style.display = 'block';
    }

    // Zviditelni tlačítko pro manuální otevření modalu
    const authBtn = document.getElementById('authBtn');
    if (authBtn) {
        authBtn.style.display = 'inline-flex';
    }

    // Vyčisti neplatné credentials, aby se zbytečně nepoužívaly
    if (deviceId) {
        CredentialsStorage.clear(deviceId);
    }

    alert('Credentials nejsou platné. Ověřte zařízení pomocí továrního hesla, aby bylo možné získat nové MQTT přihlašovací údaje.');
}

/**
 * Autentizuje zařízení a uloží credentials
 */
async function performDeviceAuth() {
    const deviceId = document.getElementById('authDeviceId').value.trim();
    const password = document.getElementById('authPassword').value;
    const errorDiv = document.getElementById('authError');

    if (!deviceId || !password) {
        errorDiv.textContent = 'Vyplňte Device ID a Factory Password';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        errorDiv.style.display = 'none';
        logger.log(`🔐 Autentizuji zařízení ${deviceId}...`, 'info');

        const response = await DeviceAuth.authenticate(deviceId, password);

        // Normalizovat broker URL - nahradit Docker hostname "mosquitto" za "localhost"
        // (backend může vracet Docker hostname, který nefunguje v prohlížeči)
        const config = ServerConfig.getConfig();
        const normalizedMqtt = {
            ...response.mqtt,
            brokerWs: config?.mqtt?.url || (response.mqtt.brokerWs ? response.mqtt.brokerWs.replace(/mosquitto/g, 'localhost') : null),
            broker: response.mqtt.broker ? response.mqtt.broker.replace(/mosquitto/g, 'localhost') : null
        };

        // Uložit credentials do localStorage (simulace EEPROM/Flash)
        CredentialsStorage.save(deviceId, normalizedMqtt);

        // Naplnit formulář
        document.getElementById('deviceId').value = deviceId;
        document.getElementById('username').value = response.mqtt.username;
        document.getElementById('password').value = response.mqtt.password;

        // Zobrazit info
        document.getElementById('credentialsInfo').style.display = 'block';

        const maskedPassword = response.mqtt.password
            ? `${response.mqtt.password.substring(0, 3)}*** (len:${response.mqtt.password.length})`
            : 'N/A';
        console.log(`[DeviceSimulator] Device auth SUCCESS for ${deviceId} | username=${response.mqtt.username} | password=${maskedPassword}`);

        // Skrýt modal
        DeviceAuth.hideAuthModal();

        // Pokud je zařízení vybrané v selectu, aktualizovat jeho credentials
        const select = document.getElementById('deviceSelect');
        if (select.value === deviceId) {
            // Znovu načíst zařízení, aby se použily nové credentials
            loadDeviceFromManagement(deviceId);
        }

        // Automaticky se připojit (čerstvé credentials, přeskočit verifikaci)
        logger.log('🔄 Automatické připojení k MQTT brokeru...', 'info');

        // Nastavit skipVerification flag pro čerstvé credentials
        setTimeout(() => {
            simulator.connectWithCredentials(response.mqtt, deviceId);
        }, 500);

    } catch (error) {
        errorDiv.textContent = error.message || 'Chyba při autentizaci';
        errorDiv.style.display = 'block';
        logger.log(`❌ Autentizace selhala: ${error.message}`, 'error');
    }
}

/**
 * Zobrazí modal pro autentizaci
 */
function handleDeviceAuth() {
    DeviceAuth.showAuthModal();
}

/**
 * Zobrazí login modal
 */
function showLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.add('active');
    }
}

/**
 * Skryje login modal
 */
function hideLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * Vyplní testovací přihlašovací údaje (legacy)
 */
function fillTestCredentials() {
    fillTestUser('admin@admin.cz', 'admin');
}

/**
 * Vyplní přihlašovací údaje pro testovacího uživatele
 */
function fillTestUser(email, password) {
    document.getElementById('loginEmail').value = email;
    document.getElementById('loginPassword').value = password;
    // Focus na tlačítko přihlásit
    setTimeout(() => {
        document.querySelector('#loginModal .btn-primary').focus();
    }, 100);
}

/**
 * Vyplní defaultní factory password pro testování
 */
function fillDefaultFactoryPassword() {
    document.getElementById('authPassword').value = '123';
    // Focus na tlačítko autentizovat
    setTimeout(() => {
        document.getElementById('authPassword').focus();
    }, 100);
}

/**
 * Zpracuje přihlášení
 */
async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    if (!email || !password) {
        errorDiv.textContent = 'Vyplňte email a heslo';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        errorDiv.style.display = 'none';
        await loginWithCredentials(email, password, { showModal: true });
    } catch (error) {
        console.error('Chyba při přihlašování:', error);
        logger.log(`❌ Chyba při přihlašování: ${error.message}`, 'error');
        errorDiv.textContent = error.message || 'Chyba při přihlašování';
        errorDiv.style.display = 'block';
    }
}

/**
 * Odhlásí uživatele
 */
function handleLogout() {
    if (!confirm('Opravdu se chcete odhlásit?')) {
        return;
    }

    localStorage.removeItem('jwt_token');
    updateTokenStatus();
    showLoginModal();

    // Vymazat výběr zařízení
    document.getElementById('deviceSelect').value = '';
    document.getElementById('currentDeviceInfo').style.display = 'none';
    document.getElementById('credentialsStatus').style.display = 'none';

    logger.log('👋 Odhlášení úspěšné', 'info');
}

/**
 * Synchronizuje ACL - přidá všechny existující zařízení a moduly do ACL souboru
 */
async function syncAcl() {
    const token = localStorage.getItem('jwt_token');
    if (!token) {
        alert('⚠️ Pro synchronizaci ACL musíte být přihlášeni.\n\nKlikněte na tlačítko "Přihlášení" nebo použijte tlačítko "⚡ Admin" pro rychlé vyplnění.');
        showLoginModal();
        return;
    }

    const config = ServerConfig.getConfig();
    const apiUrl = config.api?.url || 'http://localhost:3000';

    const syncBtn = document.getElementById('syncAclBtn');
    const originalText = syncBtn.textContent;

    try {
        syncBtn.disabled = true;
        syncBtn.textContent = '⏳ Synchronizuji...';
        logger.log('🔄 Spouštím synchronizaci ACL...', 'info');

        const response = await fetch(`${apiUrl}/api/mqtt/devices/sync-acl`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            const results = data.results;
            const message = `✅ ACL synchronizován!\n\n` +
                `Zařízení: ${results.devices.added} přidáno, ${results.devices.skipped} přeskočeno, ${results.devices.errors} chyb\n` +
                `Moduly: ${results.modules.added} přidáno, ${results.modules.skipped} přeskočeno, ${results.modules.errors} chyb`;

            logger.log('✅ ACL synchronizován úspěšně', 'success');
            alert(message);

            // Pokud je zařízení vybrané, zkusíme znovu ověřit credentials
            const deviceId = document.getElementById('deviceId').value;
            if (deviceId) {
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                if (username && password) {
                    logger.log('🔄 Ověřuji credentials po synchronizaci ACL...', 'info');
                    verifyMqttCredentials(deviceId, username, password);
                }
            }
        } else {
            throw new Error(data.error || 'Synchronizace selhala');
        }
    } catch (error) {
        console.error('Chyba při synchronizaci ACL:', error);
        logger.log(`❌ Chyba při synchronizaci ACL: ${error.message}`, 'error');
        alert(`❌ Chyba při synchronizaci ACL:\n${error.message}`);
    } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = originalText;
    }
}

/**
 * Vymaže uložené credentials (pro testování)
 */
function clearSavedCredentials() {
    if (!confirm('Opravdu chcete vymazat uložené MQTT credentials?\n\nZařízení se nebude automaticky připojovat při dalším spuštění.')) {
        return;
    }

    CredentialsStorage.clear();
    DeviceSelectionStorage.clear();
    document.getElementById('credentialsInfo').style.display = 'none';
    document.getElementById('authBtn').style.display = 'inline-flex';
    document.getElementById('currentDeviceInfo').style.display = 'none';

    // Vymaž formulář
    document.getElementById('deviceId').value = '';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';

    // Resetovat výběr zařízení
    document.getElementById('deviceSelect').value = '';

    logger.log('🗑️ Uložené credentials vymazány', 'info');
}

/**
 * Načte credentials z aktuálního profilu
 */
function loadFromProfile() {
    const config = ServerConfig.getConfig();

    // Použij demo credentials pokud existují, jinak MQTT credentials
    const username = config.credentials.demo?.device || config.credentials.mqtt.user;
    const password = config.credentials.demo?.devicePassword || config.credentials.mqtt.password;

    document.getElementById('username').value = username;
    document.getElementById('password').value = password;

    // Pokud je v profilu coopId, použij ho
    if (config.credentials.demo?.coopId) {
        document.getElementById('deviceId').value = config.credentials.demo.coopId;
        // Auto-generuj credentials z tohoto ID
        updateCredentialsFromDeviceId();
    } else {
        logger.log('📥 Credentials načteny z profilu', 'info');
    }
}

/**
 * Aktualizuje status tokenu v UI
 */
function updateTokenStatus() {
    const token = localStorage.getItem('jwt_token');
    const tokenStatusText = document.getElementById('tokenStatusText');
    const dataSourceInfo = document.getElementById('dataSourceInfo');
    const logoutBtn = document.getElementById('logoutBtn');
    const currentUserBadge = document.getElementById('currentUserBadge');
    const currentUserEmail = document.getElementById('currentUserEmail');

    if (tokenStatusText) {
        if (token) {
            let email = 'Přihlášen';
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                email = payload.email || 'Přihlášen';
            } catch (e) {
                // ignore decode error, use fallback email text
            }

            tokenStatusText.textContent = `✅ ${email}`;
            tokenStatusText.style.color = '#10b981';

            if (currentUserBadge && currentUserEmail) {
                currentUserEmail.textContent = email;
                currentUserBadge.style.display = 'inline-flex';
            }
        } else {
            tokenStatusText.textContent = '❌ Nepřihlášen';
            tokenStatusText.style.color = '#ef4444';
            if (currentUserBadge) {
                currentUserBadge.style.display = 'none';
            }
        }
    }

    if (dataSourceInfo) {
        dataSourceInfo.textContent = token ? 'Načítáno z API' : 'Načítáno z cache (localStorage)';
    }

    // Zobraz/skryj tlačítko pro odhlášení
    if (logoutBtn) {
        logoutBtn.style.display = token ? 'inline-flex' : 'none';
    }
}

/**
 * Ověří MQTT credentials s MQTT brokerem
 * @param {boolean} skipVerification - Přeskočit ověření (pro čerstvé credentials z autentizace)
 */
async function verifyMqttCredentials(deviceId, username, password, skipVerification = false) {
    const statusDiv = document.getElementById('credentialsStatus');
    const statusText = document.getElementById('credentialsStatusText');

    if (!statusDiv || !statusText) return;

    try {
        statusDiv.style.display = 'block';

        // Pokud přeskakujeme verifikaci (čerstvé credentials z autentizace), jen zobrazit info
        if (skipVerification) {
            statusDiv.style.background = '#d1fae5';
            statusText.innerHTML = '<span>✅</span> <span>Používají se čerstvé credentials z autentizace</span>';
            statusText.style.color = '#065f46';
            logger.log('✅ Používám čerstvé MQTT credentials (bez testovacího připojení)', 'success');
            return;
        }

        statusDiv.style.background = '#fef3c7';
        statusText.innerHTML = '<span>⏳</span> <span>Ověřuji credentials s MQTT brokerem...</span>';
        statusText.style.color = '#92400e';

        const config = ServerConfig.getConfig();
        const brokerUrl = config.mqtt?.url || 'ws://localhost:9001/mqtt';

        console.log('[DeviceSimulator] Verifying credentials with broker:', brokerUrl);
        console.log('[DeviceSimulator] Username:', username);
        console.log('[DeviceSimulator] Password:', password ? '***' : 'PRÁZDNÉ');
        console.log('[DeviceSimulator] Device ID:', deviceId);

        // Validace credentials
        if (!username || !password) {
            statusDiv.style.background = '#fee2e2';
            statusText.innerHTML = '<span>❌</span> <span>Username nebo password chybí</span>';
            statusText.style.color = '#991b1b';
            logger.log('⚠️ Nelze ověřit credentials - chybí username nebo password', 'warning');
            return;
        }

        // Vytvořit testovací MQTT klient pro ověření
        const testClient = mqtt.connect(brokerUrl, {
            clientId: `test_${deviceId}_${Date.now()}`,
            username: username.trim(), // Oříznout mezery
            password: password.trim(), // Oříznout mezery
            clean: true,
            connectTimeout: 15000 // 15 sekund timeout
        });

        const verificationPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                testClient.end();
                reject(new Error('Timeout při ověřování (15s) - broker může být nedostupný'));
            }, 15000);

            testClient.on('connect', () => {
                clearTimeout(timeout);
                testClient.end();
                resolve(true);
            });

            testClient.on('error', (err) => {
                clearTimeout(timeout);
                testClient.end();
                reject(err);
            });
        });

        const isValid = await verificationPromise;

        if (isValid) {
            statusDiv.style.background = '#d1fae5';
            statusText.innerHTML = '<span>✅</span> <span>Credentials jsou platné - připojení k MQTT brokeru úspěšné</span>';
            statusText.style.color = '#065f46';
            logger.log('✅ MQTT credentials ověřeny - připojení úspěšné', 'success');
        }
    } catch (error) {
        console.error('[DeviceSimulator] Credentials verification failed:', error);
        statusDiv.style.background = '#fee2e2';
        statusText.innerHTML = `<span>❌</span> <span>Credentials nejsou platné: ${error.message || 'Chyba připojení'}</span>`;
        statusText.style.color = '#991b1b';
        logger.log(`⚠️ MQTT credentials nejsou platné: ${error.message}`, 'warning');

        const errorMessage = (error && error.message ? error.message : '').toLowerCase();
        if (errorMessage.includes('not authorized') || errorMessage.includes('connection refused')) {
            setTimeout(() => promptDeviceReauth(deviceId, error.message), 100);
        }
    }
}

/**
 * Načte seznam zařízení z API (s fallback na localStorage)
 */
async function loadDevicesFromManagement() {
    const select = document.getElementById('deviceSelect');
    const currentValue = select.value; // Zachovat aktuální výběr

    // Zobrazit loading stav
    select.innerHTML = '<option value="">⏳ Načítám zařízení...</option>';
    select.disabled = true;

    try {
        const config = ServerConfig.getConfig();
        const apiUrl = config.api?.url || 'http://localhost:5555';
        const token = localStorage.getItem('jwt_token');

        let devices = [];
        let loadedFromApi = false;

        // Zkusit načíst z API (pokud je token)
        if (token) {
            try {
                console.log('[DeviceSimulator] Loading devices from API:', `${apiUrl}/api/mqtt/devices`);
                const response = await fetch(`${apiUrl}/api/mqtt/devices`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    devices = data.devices || [];
                    loadedFromApi = true;
                    console.log('[DeviceSimulator] Loaded', devices.length, 'devices from API');

                    // Uložit do localStorage jako cache
                    try {
                        localStorage.setItem('mqtt_devices', JSON.stringify(devices));
                    } catch (e) {
                        console.warn('[DeviceSimulator] Failed to cache devices to localStorage:', e);
                    }
                } else {
                    console.warn('[DeviceSimulator] API request failed:', response.status);
                    if (response.status === 401) {
                        logger.log('⚠️ Pro načtení zařízení z API je potřeba být přihlášen v Management Console', 'warning');
                    }
                }
            } catch (apiError) {
                console.error('[DeviceSimulator] Error loading from API:', apiError);
            }
        }

        // Fallback na localStorage pokud API selhalo nebo není token
        if (!loadedFromApi) {
            console.log('[DeviceSimulator] Loading devices from localStorage (fallback)');
            const devicesKey = 'mqtt_devices';
            const devicesData = localStorage.getItem(devicesKey);
            devices = devicesData ? JSON.parse(devicesData) : [];
            logger.log(`📋 Načteno ${devices.length} zařízení z localStorage (cache)`, 'info');
        } else {
            logger.log(`📋 Načteno ${devices.length} zařízení z API`, 'success');
        }

        // Aktualizovat status tokenu (může se změnit během načítání)
        updateTokenStatus();

        // Přidáme prázdnou možnost
        select.innerHTML = '<option value="">-- Vyberte zařízení --</option>';
        select.disabled = false;

        if (devices.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Žádná zařízení';
            option.disabled = true;
            select.appendChild(option);
            logger.log('ℹ️ Žádná zařízení. Vytvořte zařízení v Management Console.', 'info');
            return;
        }

        window.deviceSimulatorDevicesMap = {};
        // Přidáme všechna zařízení
        devices.forEach(device => {
            const option = document.createElement('option');
            // DŮLEŽITÉ: deviceId může být v device.id nebo device.deviceId
            const deviceId = String(device.id || device.deviceId || '');
            if (!deviceId) {
                console.warn('[DeviceSimulator] Device without ID, skipping:', device);
                return; // Přeskočit zařízení bez ID
            }
            option.value = deviceId;
            window.deviceSimulatorDevicesMap[deviceId] = device;

            // Lepší formátování názvu
            const deviceName = device.name || 'Zařízení';
            const username = device.mqttUsername || device.username || 'N/A';
            const status = device.status === 'online' ? '🟢' : '⚫';
            const modulesCount = device._count?.modules || device._count?.mqttModules || 0;
            const modulesInfo = modulesCount > 0 ? ` (${modulesCount} modulů)` : '';
            const ownerInfo = device.ownerInfo?.email || device.owner || '❓';
            const ownerBadge = ownerInfo !== '❓' ? ` | 👤 ${ownerInfo}` : '';
            option.textContent = `${status} ${deviceName} (#${deviceId}) - ${username}${modulesInfo}${ownerBadge}`;
            option.dataset.device = JSON.stringify(device);
            select.appendChild(option);
        });

        // Obnovit výběr (priorita: aktuální > uložené > první dostupné)
        let restoredDeviceId = currentValue || DeviceSelectionStorage.load();

        if (restoredDeviceId) {
            const deviceExists = Array.from(select.options).some(opt => opt.value === restoredDeviceId);
            if (deviceExists) {
                select.value = restoredDeviceId;
            } else {
                // Zařízení už neexistuje, vymazat uložené
                DeviceSelectionStorage.clear();
                restoredDeviceId = null;
            }
        }

        // Pokud stále nic, vyber první reálné zařízení (mimo placeholder)
        if (!restoredDeviceId) {
            const firstDeviceOption = Array.from(select.options).find(opt => opt.value && opt.value !== '');
            if (firstDeviceOption) {
                select.value = firstDeviceOption.value;
                restoredDeviceId = firstDeviceOption.value;
                // Uložit automatický výběr pro další refresh
                DeviceSelectionStorage.save(restoredDeviceId);
                console.log('[DeviceSimulator] Auto-selected first device:', restoredDeviceId);
            }
        }

        // Pokud je něco vybrané, načíst credentials
        if (select.value) {
            console.log('[DeviceSimulator] Device selected on load:', select.value);
            loadDeviceFromManagement(select.value);
        } else {
            console.log('[DeviceSimulator] No device selected on load');
        }
    } catch (error) {
        console.error('Chyba při načítání zařízení:', error);
        logger.log(`⚠️ Chyba při načítání zařízení: ${error.message}`, 'warning');
        select.innerHTML = '<option value="">❌ Chyba při načítání</option>';
        select.disabled = false;
    }
}

/**
 * Obnoví seznam zařízení a aktualizuje token status
 */
async function refreshDevices() {
    updateTokenStatus();
    await loadDevicesFromManagement();
}

/**
 * Storage pro aktuálně vybrané zařízení
 */
const DeviceSelectionStorage = {
    KEY: 'device_simulator_selected_device',

    save(deviceId) {
        localStorage.setItem(this.KEY, deviceId);
    },

    load() {
        return localStorage.getItem(this.KEY);
    },

    clear() {
        localStorage.removeItem(this.KEY);
    }
};

function updateCredentialsStatus(message, variant = 'info') {
    const statusDiv = document.getElementById('credentialsStatus');
    const statusText = document.getElementById('credentialsStatusText');
    if (!statusDiv || !statusText) return;

    const background = {
        info: '#f0f9ff',
        warning: '#fef3c7',
        success: '#d1fae5',
        error: '#fee2e2'
    }[variant] || '#f0f9ff';

    statusDiv.style.display = 'block';
    statusDiv.style.background = background;
    statusText.innerHTML = message;
    statusText.style.color = variant === 'warning' ? '#92400e'
        : variant === 'success' ? '#065f46'
            : variant === 'error' ? '#991b1b'
                : '#0369a1';
}

/**
 * Načte credentials pro vybrané zařízení z Management Console
 */
function loadDeviceFromManagement(deviceId = null) {
    const select = document.getElementById('deviceSelect');
    const selectedValue = deviceId || select.value;

    if (!selectedValue) {
        // Skrýt info o aktuálním zařízení
        document.getElementById('currentDeviceInfo').style.display = 'none';
        return;
    }

    try {
        // Najít zařízení v selectu
        let deviceData = null;
        if (deviceId) {
            // Pokud je předáno deviceId, najít ho v selectu
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === deviceId && select.options[i].dataset.device) {
                    deviceData = JSON.parse(select.options[i].dataset.device);
                    select.value = deviceId;
                    break;
                }
            }
        } else {
            const option = select.options[select.selectedIndex];
            if (option && option.dataset.device) {
                deviceData = JSON.parse(option.dataset.device);
            }
        }

        if (!deviceData && window.deviceSimulatorDevicesMap) {
            deviceData = window.deviceSimulatorDevicesMap[selectedValue] || null;
        }

        if (!deviceData) {
            logger.log('⚠️ Zařízení nenalezeno v seznamu', 'warning');
            return;
        }

        // Vyplníme formulář
        // DŮLEŽITÉ: deviceId může být v deviceData.deviceId nebo deviceData.id
        const actualDeviceId = deviceData.deviceId || deviceData.id || '';
        console.log('[DeviceSimulator] Setting deviceId in form:', actualDeviceId, 'from deviceData:', deviceData);
        document.getElementById('deviceId').value = actualDeviceId;

        // Aktualizovat deviceData.deviceId pro další použití
        if (!deviceData.deviceId && actualDeviceId) {
            deviceData.deviceId = actualDeviceId;
        }

        // Username - musí být MQTT username, ne Device ID
        // Pokud není mqttUsername, zkusit vytvořit z deviceId (konvence: device_{deviceId})
        let mqttUsername = deviceData.mqttUsername || deviceData.username || '';
        if (!mqttUsername && actualDeviceId) {
            // Fallback: vytvořit MQTT username z deviceId (konvence)
            mqttUsername = `device_${actualDeviceId}`;
            logger.log(`⚠️ MQTT username není k dispozici, používám konvenci: ${mqttUsername}`, 'warning');
        }
        document.getElementById('username').value = mqttUsername;

        // Password - POUZE z CredentialsStorage. Žádné hádání.
        let password = '';
        const savedCredentials = CredentialsStorage.load(actualDeviceId);
        const factoryPassword = deviceData.factoryPassword || deviceData.devicePassword || null;

        if (savedCredentials && savedCredentials.mqtt) {
            // Zařízení má uložené credentials z autorizace - použít je
            // DŮLEŽITÉ: Ověřit, že credentials patří k tomuto zařízení
            const savedDeviceId = savedCredentials.deviceId || savedCredentials.mqtt.deviceId;
            if (savedDeviceId && String(savedDeviceId) !== String(actualDeviceId)) {
                logger.log(`⚠️ Uložené credentials patří k jinému zařízení (${savedDeviceId} vs ${actualDeviceId}), ignoruji je a vyžaduji novou autorizaci.`, 'warning');
                CredentialsStorage.clear(actualDeviceId); // Vyčistit neplatné
                showDeviceAuthModal(actualDeviceId);
                document.getElementById('password').value = ''; // Vymazat pole s heslem
            } else {
                password = savedCredentials.mqtt.password || '';
                const savedUsername = savedCredentials.mqtt.username || deviceData.mqttUsername || mqttUsername;
                document.getElementById('username').value = savedUsername;
                mqttUsername = savedUsername; // Aktualizovat pro další použití
                logger.log('💾 Použit password z uložených credentials (z autorizace)', 'info');
                updateCredentialsStatus('<span>✅</span> <span>Použity uložené credentials zařízení.</span>', 'success');
                const infoBox = document.getElementById('credentialsInfo');
                if (infoBox) {
                    infoBox.style.display = 'block';
                }
            }
        } else if (factoryPassword) {
            password = factoryPassword;

            // Varování pro defaultní nebo chybějící tovární heslo
            if (factoryPassword === '123') {
                updateCredentialsStatus('<span>⚠️</span> <span>Používá se výchozí tovární heslo (123). Pro produkční použití jej změňte v Management Console.</span>', 'warning');
                logger.log('⚠️ Zařízení používá defaultní tovární heslo (123)', 'warning');
            } else {
                updateCredentialsStatus('<span>ℹ️</span> <span>Používá se tovární heslo zařízení z managementu.</span>', 'info');
            }
        } else {
            // Zařízení nemá uložené credentials ANI tovární heslo - vyžaduje autorizaci
            logger.log('⚠️ Zařízení nemá uložené credentials ani tovární heslo - vyžaduje autorizaci', 'warning');
            updateCredentialsStatus('<span>⚠️</span> <span>Tovární heslo není nastaveno. Zařízení se nemůže autorizovat při prvním spuštění.</span>', 'warning');
            showDeviceAuthModal(actualDeviceId);
            document.getElementById('password').value = ''; // Vymazat pole s heslem
        }

        document.getElementById('password').value = password;

        // Zobrazit info o aktuálním zařízení
        document.getElementById('currentDeviceName').textContent = deviceData.name || 'Zařízení';
        document.getElementById('currentDeviceId').textContent = `#${actualDeviceId}`;
        document.getElementById('currentDeviceInfo').style.display = 'block';

        // Uložit vybrané zařízení
        DeviceSelectionStorage.save(actualDeviceId);

        logger.log(`✅ Načteno zařízení: ${deviceData.name} (#${actualDeviceId})`, 'success');
        logger.log(`👤 Username: ${mqttUsername}`, 'info');
        logger.log(`🔑 Password: ${password ? '***' : 'NENÍ K DISPOZICI'}`, password ? 'info' : 'warning');

        // Připojit nebo ověřit POUZE pokud máme heslo
        if (password) {
            // Máme heslo, zkusíme se připojit/ověřit
            if (savedCredentials && savedCredentials.mqtt) {
                // Automaticky se připojit s uloženými credentials
                logger.log('🔄 Automatické připojení s uloženými credentials...', 'info');
                setTimeout(() => {
                    // DŮLEŽITÉ: Předat actualDeviceId, aby se použilo správné Device ID
                    simulator.connectWithCredentials(savedCredentials.mqtt, actualDeviceId);
                }, 500);
            } else {
                // Pokud máme factory password (není z uložených credentials), přeskočit verifikaci
                // Broker může být nedostupný a způsobovat timeout
                if (actualDeviceId && mqttUsername) {
                    // Zobrazit info, že credentials jsou připravené, ale přeskočit verifikaci
                    const statusDiv = document.getElementById('credentialsStatus');
                    const statusText = document.getElementById('credentialsStatusText');
                    if (statusDiv && statusText) {
                        statusDiv.style.display = 'block';
                        statusDiv.style.background = '#e0f2fe';
                        statusText.innerHTML = '<span>ℹ️</span> <span>Credentials připraveny. Klikněte na Připojit pro připojení k brokeru.</span>';
                        statusText.style.color = '#075985';
                    }
                    logger.log('ℹ️ Credentials připraveny (factory password)', 'info');
                }
            }
        } else {
            logger.log('⚠️ Password není k dispozici. Použijte autentizaci zařízení.', 'warning');
            updateCredentialsStatus('<span>⚠️</span> <span>Password není k dispozici. Pro připojení k MQTT je nutná autorizace zařízení.</span>', 'warning');
        }

        // Načíst detail zařízení z API (vlastník, moduly)
        // displayDeviceModules() už nastaví modules.connectedModules a modules.deviceId
        console.log('[DeviceSimulator] Loading device details for:', actualDeviceId);
        loadDeviceDetails(actualDeviceId);

        // Automaticky načíst slepice, pokud máme coopId z detailu zařízení
        // (coopId se načte v loadDeviceDetails)
    } catch (error) {
        console.error('Chyba při načítání zařízení:', error);
        logger.log('❌ Chyba při načítání credentials zařízení', 'error');
    }
}

/**
 * Načte detail zařízení z API (vlastník, moduly)
 */
async function loadDeviceDetails(deviceId) {
    console.log('[DeviceSimulator] loadDeviceDetails called for deviceId:', deviceId);

    if (!deviceId) {
        console.log('[DeviceSimulator] No deviceId provided, hiding deviceInfoCard');
        document.getElementById('deviceInfoCard').style.display = 'none';
        return;
    }

    try {
        const config = ServerConfig.getConfig();
        const apiUrl = config.api?.url || 'http://localhost:5555';
        const token = localStorage.getItem('jwt_token'); // Token z mqtt-management

        console.log('[DeviceSimulator] API URL:', apiUrl);
        console.log('[DeviceSimulator] Token available:', !!token);

        const headers = {
            'Content-Type': 'application/json'
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const url = `${apiUrl}/api/mqtt/devices/${deviceId}`;
        console.log('[DeviceSimulator] Fetching device details from:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers
        });

        console.log('[DeviceSimulator] Response status:', response.status);

        if (!response.ok) {
            if (response.status === 401) {
                logger.log('⚠️ Pro načtení detailů zařízení je potřeba být přihlášen v Management Console', 'warning');
                console.log('[DeviceSimulator] 401 Unauthorized - trying to load from localStorage');

                // Zkusit načíst základní informace z localStorage (z mqtt-management)
                try {
                    const devicesKey = 'mqtt_devices';
                    const devicesData = localStorage.getItem(devicesKey);
                    const devices = devicesData ? JSON.parse(devicesData) : [];
                    const deviceFromStorage = devices.find(d => (d.id || d.deviceId) === deviceId);

                    if (deviceFromStorage) {
                        console.log('[DeviceSimulator] Found device in localStorage, showing basic info');
                        const deviceInfoCard = document.getElementById('deviceInfoCard');
                        if (deviceInfoCard) {
                            deviceInfoCard.style.display = 'block';

                            // Zobrazit základní informace z localStorage
                            const deviceInfoName = document.getElementById('deviceInfoName');
                            const deviceInfoId = document.getElementById('deviceInfoId');
                            const deviceInfoOwner = document.getElementById('deviceInfoOwner');
                            const deviceInfoStatus = document.getElementById('deviceInfoStatus');
                            const deviceModulesCount = document.getElementById('deviceModulesCount');

                            if (deviceInfoName) deviceInfoName.textContent = deviceFromStorage.name || 'Zařízení';
                            if (deviceInfoId) deviceInfoId.textContent = deviceFromStorage.id || deviceFromStorage.deviceId || '-';
                            if (deviceInfoOwner) deviceInfoOwner.textContent = deviceFromStorage.owner || 'Nepropojeno';

                            if (deviceInfoStatus) {
                                const isOnline = deviceFromStorage.status === 'online';
                                const statusIcon = isOnline ? '🟢' : '⚫';
                                const statusText = isOnline ? 'Online' : 'Offline';
                                const statusColor = isOnline ? '#10b981' : '#6b7280';
                                deviceInfoStatus.innerHTML = `<span style="color: ${statusColor};">${statusIcon} ${statusText}</span>`;
                            }

                            if (deviceModulesCount) deviceModulesCount.textContent = '0';

                            // Zobrazit zařízení a prázdný seznam modulů
                            const deviceInfo = {
                                deviceId: deviceFromStorage.id || deviceFromStorage.deviceId,
                                name: deviceFromStorage.name || 'Zařízení',
                                mqttUsername: deviceFromStorage.mqttUsername || '',
                                type: deviceFromStorage.type || 'smartcoop',
                                status: deviceFromStorage.status || 'offline',
                                lastSeen: deviceFromStorage.lastSeen || null
                            };
                            displayDeviceModules([], deviceInfo);
                            logger.log('ℹ️ Zobrazeny základní informace z localStorage. Pro plné informace se přihlaste v Management Console.', 'info');
                        }
                    } else {
                        document.getElementById('deviceInfoCard').style.display = 'none';
                    }
                } catch (storageError) {
                    console.error('[DeviceSimulator] Error loading from localStorage:', storageError);
                    document.getElementById('deviceInfoCard').style.display = 'none';
                }
                return;
            }
            const errorText = await response.text();
            console.error('[DeviceSimulator] Error response:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log('[DeviceSimulator] Device data received:', data);
        const device = data.device;

        if (!device) {
            console.error('[DeviceSimulator] No device in response');
            document.getElementById('deviceInfoCard').style.display = 'none';
            return;
        }

        // Zobrazit kartu s informacemi
        const deviceInfoCard = document.getElementById('deviceInfoCard');
        if (!deviceInfoCard) {
            console.error('[DeviceSimulator] deviceInfoCard element not found!');
            return;
        }

        console.log('[DeviceSimulator] Showing deviceInfoCard');
        deviceInfoCard.style.display = 'block';

        // Zobrazit informace o zařízení
        console.log('[DeviceSimulator] Device ownerInfo:', device.ownerInfo);
        console.log('[DeviceSimulator] Device owner:', device.owner);
        console.log('[DeviceSimulator] Device modules:', device.modules?.length || 0);

        // Naplnit základní informace
        const deviceInfoName = document.getElementById('deviceInfoName');
        const deviceInfoId = document.getElementById('deviceInfoId');
        const deviceInfoOwner = document.getElementById('deviceInfoOwner');
        const deviceInfoStatus = document.getElementById('deviceInfoStatus');
        const deviceModulesCount = document.getElementById('deviceModulesCount');

        if (deviceInfoName) deviceInfoName.textContent = device.name || 'Zařízení';
        if (deviceInfoId) deviceInfoId.textContent = device.deviceId || '-';

        if (deviceInfoOwner) {
            if (device.ownerInfo) {
                deviceInfoOwner.textContent = device.ownerInfo.username || device.ownerInfo.email || device.owner || 'Nepropojeno';
            } else if (device.owner) {
                deviceInfoOwner.textContent = device.owner;
            } else {
                deviceInfoOwner.textContent = 'Nepropojeno';
            }
        }

        if (deviceInfoStatus) {
            const isOnline = device.status === 'online';
            const statusIcon = isOnline ? '🟢' : '⚫';
            const statusText = isOnline ? 'Online' : 'Offline';
            const statusColor = isOnline ? '#10b981' : '#6b7280';
            deviceInfoStatus.innerHTML = `<span style="color: ${statusColor};">${statusIcon} ${statusText}</span>`;
        }

        if (deviceModulesCount) {
            deviceModulesCount.textContent = device.modules?.length || 0;
        }

        // Zobrazit moduly (včetně samotného zařízení)
        console.log('[DeviceSimulator] Calling displayDeviceModules with', device.modules?.length || 0, 'modules');
        displayDeviceModules(device.modules || [], device);

        logger.log(`📦 Načteno ${device.modules?.length || 0} modulů pro zařízení`, 'success');

        // Automaticky načíst slepice, pokud najdeme coopId
        // Zkusit najít coop podle deviceId = deviceId
        try {
            // Zkusit najít coop přes /api/coops (vrátí všechny coopy uživatele)
            const coopResponse = await fetch(`${apiUrl}/api/coops`, {
                method: 'GET',
                headers
            });

            if (coopResponse.ok) {
                const coopData = await coopResponse.json();
                const coops = Array.isArray(coopData) ? coopData : (coopData.coops || []);

                // Najít coop, kde deviceId = deviceId
                const coop = coops.find(c => c.deviceId === deviceId);

                if (coop) {
                    const coopId = coop.id;
                    console.log('[DeviceSimulator] Found coop for device:', coopId, coop.name);
                    logger.log(`🏠 Nalezen kurník: ${coop.name} (ID: ${coopId})`, 'info');

                    // Aktualizovat informace o API v sekci slepic
                    updateChickensApiInfo(apiUrl, coopId, coop.name);

                    // Automaticky načíst slepice pro tento kurník
                    logger.log('🐔 Automaticky načítám slepice z kurníku...', 'info');
                    console.log('[DeviceSimulator] Auto-loading chickens for coopId:', coopId);
                    await chickens.loadFromApi(coopId);

                    // Pokud je simulátor připojen, přihlásit se k RFID modulům
                    if (simulator.isConnected()) {
                        console.log('[DeviceSimulator] Simulator is connected, subscribing to RFID modules...');
                        await simulator.subscribeToRfidModules();
                    }
                } else {
                    console.log('[DeviceSimulator] No coop found for deviceId:', deviceId);
                    logger.log('ℹ️ Kurník pro toto zařízení nebyl nalezen. Můžete zadat ID kurníku ručně.', 'info');
                    updateChickensApiInfo(apiUrl, null, null);
                }
            }
        } catch (coopError) {
            console.warn('[DeviceSimulator] Could not find coop for device:', coopError);
            logger.log('ℹ️ Nepodařilo se automaticky najít kurník. Můžete zadat ID kurníku ručně.', 'info');
            // Není kritické, pokračujeme
        }
    } catch (error) {
        console.error('Chyba při načítání detailů zařízení:', error);
        logger.log(`⚠️ Chyba při načítání detailů zařízení: ${error.message}`, 'warning');
        document.getElementById('deviceInfoCard').style.display = 'none';
    }
}

/**
 * Zobrazí seznam modulů připojených k zařízení s detailními ovládacími kartami
 */
function displayDeviceModules(deviceModules, device = null) {
    console.log('[DeviceSimulator] displayDeviceModules called with', deviceModules.length, 'modules', device ? 'and device info' : '');
    const container = document.getElementById('deviceModulesList');

    if (!container) {
        console.error('[DeviceSimulator] deviceModulesList element not found!');
        return;
    }

    // Pokud nejsou žádné moduly, zobrazit prázdný stav
    if (deviceModules.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #9ca3af; grid-column: 1 / -1;">
                <div>📦 K tomuto zařízení nejsou připojeny žádné moduly</div>
                <small style="font-size: 12px; margin-top: 8px; display: block;">Moduly se přidávají automaticky při připojení</small>
            </div>
        `;
        return;
    }

    // Filtrovat moduly připojené přes zařízení (via_device)
    const viaDeviceModules = deviceModules.filter(m =>
        m.connectionType === 'via_device' && !m.hasWifi
    );

    console.log(`[DeviceSimulator] Displaying ${viaDeviceModules.length} via_device modules`);

    // Použít createModuleCard z modules.js pro vytvoření detailních ovládacích karet
    let html = '';
    if (viaDeviceModules.length === 0) {
        html = `
            <div style="text-align: center; padding: 20px; color: #9ca3af; grid-column: 1 / -1;">
                <div>📦 Žádné moduly připojené přes toto zařízení</div>
                <small style="font-size: 12px; margin-top: 8px; display: block;">Všechny moduly mají vlastní WiFi připojení</small>
            </div>
        `;
    } else {
        // Nastavit moduly do modules objektu aby byly dostupné pro ovládání
        if (typeof modules !== 'undefined') {
            modules.connectedModules = viaDeviceModules;
            modules.deviceId = device?.deviceId;

            // Vytvořit detailní karty pro každý modul
            html = viaDeviceModules.map(module => {
                return modules.createModuleCard(module);
            }).join('');

            // Aktualizovat stav sekcí podle připojených modulů
            modules.updateSectionStates();
        } else {
            console.error('[DeviceSimulator] modules object not available!');
            // Fallback: jednoduchý seznam
            html = viaDeviceModules.map(module => {
                const statusBadge = module.status === 'online' ? '🟢' : '⚫';
                const statusText = module.status === 'online' ? 'Online' : 'Offline';

                return `
                    <div style="padding: 12px; background: #f9fafb; border-radius: 8px; border-left: 3px solid ${module.status === 'online' ? '#10b981' : '#6b7280'};">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="font-weight: 600; color: #1f2937;">${module.name || 'Modul'}</span>
                            <span style="font-size: 12px; color: #6b7280;">(${module.type})</span>
                            <span style="font-size: 12px;">${statusBadge} ${statusText}</span>
                        </div>
                        <div style="font-size: 11px; color: #6b7280;">
                            <div>ID: <code>${module.moduleId}</code></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    container.innerHTML = html;
}

/**
 * Zobrazí modal pro připojení modulu
 */
async function showLinkModuleModal() {
    try {
        const config = ServerConfig.getConfig();
        const apiUrl = config.api?.url || 'http://localhost:5555';
        const token = localStorage.getItem('jwt_token');

        if (!token) {
            alert('⚠️ Pro připojení modulu musíte být přihlášen v Management Console');
            return;
        }

        // Načíst všechny moduly (filtrování proběhne na frontendu)
        const response = await fetch(`${apiUrl}/api/mqtt/modules`, {
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
        const allModules = data.modules || [];

        // Filtrovat moduly, které nejsou připojené k žádnému zařízení nebo jsou připojené k jinému zařízení
        const currentDeviceId = document.getElementById('deviceId').value;
        const availableModules = allModules.filter(module => {
            // Modul není připojený k žádnému zařízení
            if (!module.deviceId) return true;
            // Modul je připojený k jinému zařízení (můžeme ho přesunout)
            if (module.deviceId !== currentDeviceId) return true;
            // Modul je už připojený k tomuto zařízení - nezobrazit
            return false;
        });

        const select = document.getElementById('moduleSelect');
        select.innerHTML = '<option value="">-- Vyberte modul --</option>';

        if (availableModules.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Žádné dostupné moduly';
            option.disabled = true;
            select.appendChild(option);
        } else {
            availableModules.forEach(module => {
                const option = document.createElement('option');
                const deviceInfo = module.deviceId ? ` (připojeno k #${module.deviceId})` : ' (volný)';
                option.value = module.moduleId;
                option.textContent = `${module.name} (${module.type}) - ${module.moduleId}${deviceInfo}`;
                option.dataset.module = JSON.stringify(module);
                select.appendChild(option);
            });
        }

        document.getElementById('linkModuleModal').classList.add('active');
        document.getElementById('linkModuleError').style.display = 'none';
    } catch (error) {
        console.error('Chyba při načítání modulů:', error);
        alert(`Chyba při načítání modulů: ${error.message}`);
    }
}

/**
 * Skryje modal pro připojení modulu
 */
function hideLinkModuleModal() {
    document.getElementById('linkModuleModal').classList.remove('active');
}

/**
 * Připojí modul k zařízení
 */
async function linkModuleToDevice() {
    const select = document.getElementById('moduleSelect');
    const moduleId = select.value;
    const errorDiv = document.getElementById('linkModuleError');

    if (!moduleId) {
        errorDiv.textContent = 'Vyberte modul';
        errorDiv.style.display = 'block';
        return;
    }

    const deviceId = document.getElementById('deviceId').value;
    if (!deviceId) {
        errorDiv.textContent = 'Nejprve vyberte zařízení';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        errorDiv.style.display = 'none';
        const config = ServerConfig.getConfig();
        const apiUrl = config.api?.url || 'http://localhost:5555';
        const token = localStorage.getItem('jwt_token');

        const response = await fetch(`${apiUrl}/api/mqtt/modules/${moduleId}/link`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                deviceId: deviceId
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        logger.log(`✅ Modul připojen k zařízení: ${data.module?.name}`, 'success');

        hideLinkModuleModal();

        // Obnovit seznam modulů
        loadDeviceDetails(deviceId);

        // Obnovit seznam zařízení v Management Console (pro případ, že se změnilo)
        loadDevicesFromManagement();
    } catch (error) {
        errorDiv.textContent = error.message || 'Chyba při připojování modulu';
        errorDiv.style.display = 'block';
        logger.log(`❌ Chyba při připojování modulu: ${error.message}`, 'error');
    }
}

/**
 * Odpojí modul od zařízení
 */
async function unlinkModule(moduleId, moduleName) {
    if (!confirm(`Opravdu chcete odpojit modul "${moduleName}" od zařízení?`)) {
        return;
    }

    try {
        const config = ServerConfig.getConfig();
        const apiUrl = config.api?.url || 'http://localhost:5555';
        const token = localStorage.getItem('jwt_token');

        const response = await fetch(`${apiUrl}/api/mqtt/modules/${moduleId}/unlink`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        logger.log(`✅ Modul odpojen od zařízení: ${moduleName}`, 'success');

        // Obnovit seznam modulů
        const deviceId = document.getElementById('deviceId').value;
        if (deviceId) {
            loadDeviceDetails(deviceId);
        }
    } catch (error) {
        logger.log(`❌ Chyba při odpojování modulu: ${error.message}`, 'error');
        alert(`Chyba při odpojování modulu: ${error.message}`);
    }
}

/**
 * Přepne na jiné zařízení (s odpojením/připojením pokud je simulátor připojený)
 */
async function switchDevice() {
    console.log('[DeviceSimulator] switchDevice called');
    const select = document.getElementById('deviceSelect');
    const selectedValue = select.value;
    console.log('[DeviceSimulator] Selected device:', selectedValue);
    if (selectedValue) {
        DeviceSelectionStorage.save(selectedValue);
    }

    // Pokud není nic vybrané, jen vymaž formulář
    if (!selectedValue) {
        console.log('[DeviceSimulator] No device selected - clearing form');
        document.getElementById('deviceId').value = '';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('currentDeviceInfo').style.display = 'none';
        DeviceSelectionStorage.clear();

        // Pokud je připojený, odpojit
        if (simulator.isConnected()) {
            logger.log('🔄 Odpojuji kvůli změně zařízení...', 'info');
            simulator.disconnect();
        }
        return;
    }

    // Zkontrolovat, zda je simulátor připojený
    const wasConnected = simulator.isConnected();

    if (wasConnected) {
        logger.log('🔄 Přepínám zařízení - odpojuji aktuální připojení...', 'info');
        simulator.disconnect();

        // Počkat chvíli, než se odpojí
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Načíst nové zařízení
    loadDeviceFromManagement(selectedValue);

    // Zkontrolovat, zda má nové zařízení uložené credentials z autorizace
    const savedCredentials = CredentialsStorage.load(selectedValue);

    if (savedCredentials && savedCredentials.mqtt) {
        // Zařízení má uložené credentials - automaticky se připojit
        logger.log('🔄 Připojuji se s uloženými credentials pro nové zařízení...', 'info');
        setTimeout(() => {
            simulator.connectWithCredentials(savedCredentials.mqtt);
        }, 1000);
    } else if (wasConnected) {
        // Zařízení nemá uložené credentials, ale byl připojený - zkusit připojit s načtenými credentials
        logger.log('🔄 Připojuji se s načtenými credentials...', 'info');
        setTimeout(() => {
            simulator.connect();
        }, 1000);
    } else {
        // I když nebyl připojený, načíst detaily zařízení
        const deviceId = document.getElementById('deviceId').value;
        if (deviceId) {
            console.log('[DeviceSimulator] Loading device details after switch (not connected)');
            loadDeviceDetails(deviceId);
        }
    }
}

// Global debug functions
window.deviceSim = {
    getStatus: () => {
        return {
            connected: simulator.isConnected(),
            deviceId: simulator.deviceId,
            sensors: {
                temperature: sensors.temperature,
                humidity: sensors.humidity,
                light: sensors.light
            },
            door: {
                state: door.state,
                position: door.position
            },
            chickens: {
                inside: chickens.inside,
                outside: chickens.total - chickens.inside,
                total: chickens.total
            },
            network: {
                wifi: network.wifi.connected,
                gsm: network.gsm.connected
            }
        };
    },

    simulateDay: () => {
        console.log('🌅 Simuluji den...');

        // Ráno - otevřít dveře
        setTimeout(() => {
            door.open();
            logger.log('🌅 Ráno - dveře se otvírají', 'info');
        }, 1000);

        // Slepice vycházejí
        setTimeout(() => {
            for (let i = 0; i < chickens.total; i++) {
                setTimeout(() => chickens.exit(), i * 500);
            }
        }, 3000);

        // Poledne - nějaké se vrací
        setTimeout(() => {
            for (let i = 0; i < Math.floor(chickens.total / 2); i++) {
                setTimeout(() => chickens.enter(), i * 500);
            }
        }, 10000);

        // Odpoledne - vycházejí zase
        setTimeout(() => {
            for (let i = 0; i < Math.floor(chickens.total / 3); i++) {
                setTimeout(() => chickens.exit(), i * 500);
            }
        }, 15000);

        // Večer - všechny se vrací
        setTimeout(() => {
            const outside = chickens.total - chickens.inside;
            for (let i = 0; i < outside; i++) {
                setTimeout(() => chickens.enter(), i * 500);
            }
        }, 20000);

        // Večer - zavřít dveře
        setTimeout(() => {
            door.close();
            logger.log('🌙 Večer - dveře se zavírají', 'info');
        }, 25000);

        console.log('✅ Simulace dne dokončena za 25s');
    }
};

console.log('ℹ️ Debug funkce dostupné přes window.deviceSim');
console.log('   - deviceSim.getStatus()');
console.log('   - deviceSim.simulateDay()');

/**
 * Aktualizuje informace o API připojení v sekci slepic
 */
function updateChickensApiInfo(apiUrl, coopId, coopName) {
    const chickensApiUrlEl = document.getElementById('chickensApiUrl');
    const chickensCoopIdEl = document.getElementById('chickensCoopId');

    if (chickensApiUrlEl) {
        chickensApiUrlEl.textContent = apiUrl || '-';
    }

    if (chickensCoopIdEl) {
        if (coopId && coopName) {
            chickensCoopIdEl.textContent = `${coopName} (#${coopId})`;
        } else {
            chickensCoopIdEl.textContent = '-';
        }
    }
}

async function loginWithCredentials(email, password, options = {}) {
    const { showModal = false, silent = false } = options;
    if (!silent) {
        logger.log(`🔐 Přihlašuji se jako ${email}...`, 'info');
    }

    const config = ServerConfig.getConfig();
    const apiUrl = config.api?.url || 'http://localhost:5555';

    const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
            const errorBody = await response.json();
            errorMsg = errorBody.error || errorBody.message || errorMsg;
        } catch (_) { }
        throw new Error(errorMsg);
    }

    const data = await response.json();
    if (!data.token) {
        throw new Error('Token nebyl vrácen ze serveru');
    }

    localStorage.setItem('jwt_token', data.token);
    if (!silent) {
        logger.log('✅ Přihlášení úspěšné!', 'success');
    }

    hideLoginModal();
    updateTokenStatus();
    await loadDevicesFromManagement();
}

async function attemptAutoLoginOrPrompt() {
    const config = ServerConfig.getConfig();
    const autoAuth = config.credentials?.auth;

    if (autoAuth?.email && autoAuth?.password) {
        try {
            // loginWithCredentials už volá loadDevicesFromManagement() po úspěšném přihlášení
            await loginWithCredentials(autoAuth.email, autoAuth.password, { silent: true });
            logger.log(`✅ Automatické přihlášení jako ${autoAuth.email}`, 'success');
            return;
        } catch (error) {
            console.warn('[DeviceSimulator] Auto-login failed:', error);
            logger.log(`⚠️ Automatické přihlášení selhalo: ${error.message}`, 'warning');
        }
    }

    showLoginModal();
}

/**
 * Toggle WiFi configuration section
 */
function toggleWifiConfig() {
    const configSection = document.getElementById('wifiConfigSection');
    const btn = document.getElementById('wifiConfigBtn');

    if (configSection.style.display === 'none' || !configSection.style.display) {
        configSection.style.display = 'block';
        btn.textContent = '❌ Zrušit';

        // Pre-fill with current values if configured
        if (network.wifiClient.configured) {
            document.getElementById('wifiConfigSsid').value = network.wifiClient.ssid;
            document.getElementById('wifiConfigPassword').value = network.wifiClient.password;
        }
    } else {
        configSection.style.display = 'none';
        btn.textContent = '⚙️ Konfigurovat WiFi';
    }
}

/**
 * Configure WiFi from UI
 */
function configureWifiFromUI() {
    const ssid = document.getElementById('wifiConfigSsid').value.trim();
    const password = document.getElementById('wifiConfigPassword').value;

    if (!ssid) {
        alert('⚠️ SSID je povinné!');
        document.getElementById('wifiConfigSsid').focus();
        return;
    }

    // Configure WiFi
    const success = network.configureWifi(ssid, password);

    if (success) {
        // Hide config section
        document.getElementById('wifiConfigSection').style.display = 'none';
        document.getElementById('wifiConfigBtn').textContent = '⚙️ Konfigurovat WiFi';

        // Clear inputs
        document.getElementById('wifiConfigSsid').value = '';
        document.getElementById('wifiConfigPassword').value = '';
    }
}

// Update config hash display periodically
setInterval(() => {
    const hashDisplay = document.getElementById('networkConfigHash');
    if (hashDisplay && typeof network !== 'undefined' && network.configHash) {
        hashDisplay.textContent = network.configHash;
    }
}, 1000);

/**
 * Configure GSM from UI
 */
function configureGsmFromUI() {
    const apn = document.getElementById('gsmConfigApn').value.trim();
    const phone = document.getElementById('gsmConfigPhone').value.trim();

    if (!apn) {
        alert('⚠️ APN je povinné!');
        document.getElementById('gsmConfigApn').focus();
        return;
    }

    // Configure GSM
    const success = network.configureGsm(apn, phone);

    if (success) {
        logger.log('✅ GSM konfigurace uložena', 'success');
    }
}

/**
 * Send SMS from UI
 */
async function sendSmsFromUI() {
    const recipient = document.getElementById('gsmSmsRecipient').value.trim();
    const message = document.getElementById('gsmSmsMessage').value.trim();

    if (!recipient) {
        alert('⚠️ Zadejte příjemce SMS!');
        document.getElementById('gsmSmsRecipient').focus();
        return;
    }

    if (!message) {
        alert('⚠️ Zadejte text SMS!');
        document.getElementById('gsmSmsMessage').focus();
        return;
    }

    // Send SMS
    const success = await network.sendTestSms(recipient, message);

    if (success) {
        // Clear form
        document.getElementById('gsmSmsRecipient').value = '';
        document.getElementById('gsmSmsMessage').value = '';
    }
}
