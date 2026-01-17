/**
 * Server Configuration Manager
 * Handles switching between Local and VPS environments
 */

window.ServerConfig = {
    // Available profiles
    profiles: {
        local: {
            name: 'Lokální (Docker)',
            mqtt: {
                url: 'ws://localhost:9001/mqtt', // EMQX WebSocket listener uses /mqtt mountpoint
                host: 'localhost',
                port: 9001
            },
            api: {
                url: 'http://localhost:5555' // Consistent with docker-compose mapping
            },
            credentials: {
                mqtt: {
                    user: 'sf_mqtt_user',
                    password: '' // Set via localStorage
                }
            }
        },
        vps: {
            name: 'VPS (Produkce)',
            mqtt: {
                // Configure VPS_HOST via custom profile or localStorage
                url: '', // Set via custom profile
                host: '',
                port: 9001
            },
            api: {
                url: '' // Set via custom profile
            },
            credentials: {
                mqtt: {
                    user: '',
                    password: '' // Set via localStorage
                }
            }
        },
        custom: {
            name: 'Vlastní',
            mqtt: {
                url: 'ws://localhost:9001/mqtt'
            },
            api: {
                url: 'http://localhost:5555'
            },
            credentials: {
                mqtt: {
                    user: '',
                    password: ''
                }
            }
        }
    },

    // Current active profile
    activeProfile: 'local',

    /**
     * Initialize configuration
     */
    init() {
        // Load saved profile from localStorage
        const savedProfile = localStorage.getItem('server_profile');
        if (savedProfile && this.profiles[savedProfile]) {
            this.activeProfile = savedProfile;
        }
        console.log(`[ServerConfig] Initialized with profile: ${this.activeProfile}`);
    },

    /**
     * Set active profile
     * @param {string} profileKey - 'local', 'vps', or 'custom'
     */
    setProfile(profileKey) {
        if (this.profiles[profileKey]) {
            this.activeProfile = profileKey;
            localStorage.setItem('server_profile', profileKey);
            console.log(`[ServerConfig] Switched to profile: ${profileKey}`);
            return true;
        }
        return false;
    },

    /**
     * Get current configuration
     */
    getConfig() {
        return this.profiles[this.activeProfile];
    },

    /**
     * Get active profile key
     */
    getActiveProfile() {
        return this.activeProfile;
    }
};

// Initialize immediately
ServerConfig.init();
