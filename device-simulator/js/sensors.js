/**
 * Sensors Simulation
 */

const sensors = {
    temperature: 22,
    humidity: 65,
    light: 450,
    autoMode: true,
    interval: null,

    init() {
        this.update();
        if (this.autoMode) {
            this.startAuto();
        }
    },

    update() {
        document.getElementById('temperature').textContent = this.temperature.toFixed(1) + '°C';
        document.getElementById('humidity').textContent = this.humidity.toFixed(0) + '%';
        document.getElementById('light').textContent = this.light.toFixed(0);
        
        document.getElementById('tempRange').value = this.temperature;
        document.getElementById('humidityRange').value = this.humidity;
        document.getElementById('lightRange').value = this.light;
    },

    setTemperature(value) {
        this.temperature = parseFloat(value);
        this.update();
        if (simulator.isConnected()) {
            this.publish();
        }
    },

    setHumidity(value) {
        this.humidity = parseFloat(value);
        this.update();
        if (simulator.isConnected()) {
            this.publish();
        }
    },

    setLight(value) {
        this.light = parseFloat(value);
        this.update();
        if (simulator.isConnected()) {
            this.publish();
        }
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
            // Random small changes
            this.temperature += (Math.random() - 0.5) * 0.5;
            this.temperature = Math.max(15, Math.min(35, this.temperature));
            
            this.humidity += (Math.random() - 0.5) * 2;
            this.humidity = Math.max(30, Math.min(90, this.humidity));
            
            this.light += (Math.random() - 0.5) * 20;
            this.light = Math.max(0, Math.min(1000, this.light));
            
            this.update();
            if (simulator.isConnected()) {
                this.publish();
            }
        }, 5000); // Every 5 seconds
    },

    stopAuto() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    },

    publish() {
        // Status pro senzory: smartcoop/{deviceId}/status
        const topic = `smartcoop/${simulator.deviceId}/status`;
        const payload = {
            environment: {
                temperature: parseFloat(this.temperature.toFixed(1)),
                humidity: parseInt(this.humidity),
                light: parseInt(this.light)
            },
            timestamp: Date.now()
        };
        simulator.publish(topic, payload);
    }
};

