/**
 * Shared Configuration for MQTT Applications
 * Centrální konfigurace pro všechny MQTT aplikace
 */

const ServerProfiles = {
    // Lokální Docker (development)
    local: {
        name: '🐋 Lokální Docker',
        mqtt: {
            host: 'localhost',
            port: 9001,
            protocol: 'ws://',
            // EMQX WebSocket listener uses /mqtt mountpoint
            url: 'ws://localhost:9001/mqtt'
        },
        api: {
            url: 'http://localhost:5555'
        },
        rabbitmq: {
            management: 'http://localhost:15672',
            user: 'sf_rabbitmq_user',
            password: 'your_strong_rabbitmq_password'
        },
        credentials: {
            mqtt: {
                user: 'sf_mqtt_user',
                password: 'your_strong_mqtt_password'
            },
            auth: {
                email: '',
                password: ''
            },
            demo: {
                // Demo device
                device: 'device_123',
                devicePassword: 'dev_abc123',
                coopId: '123'
            }
        }
    },
    
    // Produkční server (VPS)
    production: {
        name: '🌐 VPS (Produkce)',
        mqtt: {
            host: typeof process !== 'undefined' && process.env?.VPS_HOST || '',
            port: 9001,
            protocol: 'ws://',
            get url() {
                // EMQX WebSocket listener uses /mqtt mountpoint
                return `${this.protocol}${this.host}:${this.port}/mqtt`;
            }
        },
        api: {
            get url() {
                const host = typeof process !== 'undefined' && process.env?.VPS_HOST || '';
                return `http://${host}:5555`;
            }
        },
        credentials: {
            mqtt: {
                user: '', // Set via localStorage
                password: '' // Set via localStorage
            },
            auth: {
                email: '',
                password: ''
            },
            demo: {
                device: 'device_123',
                devicePassword: '123',
                coopId: '123'
            }
        }
    },
    
    // Custom (pro vlastní nastavení)
    custom: {
        name: '⚙️ Vlastní nastavení',
        mqtt: {
            host: '',
            port: 9001,
            protocol: 'ws://',
            url: ''
        },
        api: {
            url: ''
        },
        credentials: {
            mqtt: {
                user: '',
                password: ''
            },
            auth: {
                email: '',
                password: ''
            },
            demo: {
                device: '',
                devicePassword: '',
                coopId: ''
            }
        }
    }
};

/**
 * Utility funkce pro práci s profily
 */
const ServerConfig = {
    /**
     * Získá aktivní profil (z localStorage nebo výchozí)
     */
    getActiveProfile() {
        // Prefer explicit user choice
        const saved = typeof localStorage !== 'undefined'
            ? localStorage.getItem('mqtt_server_profile')
            : null;
        if (saved) return saved;

        // Auto-select profile based on current host:
        // - Localhost/private networks -> local profile
        // - Anything else (public IP/domain) -> production profile
        if (typeof window !== 'undefined' && window.location?.hostname) {
            const host = window.location.hostname.toLowerCase();
            const isLocalHost =
                host === 'localhost' ||
                host === '127.0.0.1' ||
                host === '0.0.0.0' ||
                host.endsWith('.local') ||
                host.startsWith('192.168.') ||
                host.startsWith('10.') ||
                host.startsWith('172.16.') ||
                host.startsWith('172.17.') ||
                host.startsWith('172.18.') ||
                host.startsWith('172.19.') ||
                host.startsWith('172.20.') ||
                host.startsWith('172.21.') ||
                host.startsWith('172.22.') ||
                host.startsWith('172.23.') ||
                host.startsWith('172.24.') ||
                host.startsWith('172.25.') ||
                host.startsWith('172.26.') ||
                host.startsWith('172.27.') ||
                host.startsWith('172.28.') ||
                host.startsWith('172.29.') ||
                host.startsWith('172.30.') ||
                host.startsWith('172.31.');

            return isLocalHost ? 'local' : 'production';
        }

        return 'local';
    },
    
    /**
     * Nastaví aktivní profil
     */
    setActiveProfile(profileName) {
        if (!ServerProfiles[profileName]) {
            console.error(`Profile ${profileName} does not exist`);
            return false;
        }
        localStorage.setItem('mqtt_server_profile', profileName);
        return true;
    },
    
    /**
     * Získá konfiguraci aktivního profilu
     */
    getConfig() {
        const profileName = this.getActiveProfile();
        return ServerProfiles[profileName];
    },
    
    /**
     * Získá všechny dostupné profily
     */
    getAllProfiles() {
        return Object.keys(ServerProfiles).map(key => ({
            key,
            name: ServerProfiles[key].name
        }));
    },
    
    /**
     * Uloží custom konfiguraci
     */
    saveCustomConfig(config) {
        ServerProfiles.custom = {
            ...ServerProfiles.custom,
            ...config
        };
        localStorage.setItem('mqtt_custom_config', JSON.stringify(config));
    },
    
    /**
     * Načte custom konfiguraci
     */
    loadCustomConfig() {
        const saved = localStorage.getItem('mqtt_custom_config');
        if (saved) {
            try {
                const config = JSON.parse(saved);
                ServerProfiles.custom = {
                    ...ServerProfiles.custom,
                    ...config
                };
            } catch (e) {
                console.error('Failed to load custom config:', e);
            }
        }
    }
};

// Auto-load custom config on init
ServerConfig.loadCustomConfig();

// Export pro použití v aplikacích
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ServerProfiles, ServerConfig };
}

