/**
 * Camera Device Main Logic
 * Manages camera state, settings, and operations
 */

const camera = {
    settings: {
        resolution: '640x480',
        quality: 90,
        autoCapture: false,
        motionDetection: false
    },

    status: {
        battery: 85,
        signal: -45,
        storageUsed: 1200,
        storageTotal: 4096,
        temperature: 42,
        memory: 45
    },

    gallery: [],
    currentFilter: 'all',
    isRecording: false,
    recordingStartTime: null,
    autoCaptureInterval: null,
    selectedImage: null,

    connect() {
        const cameraId = document.getElementById('cameraId').value.trim();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const mode = document.getElementById('communicationMode')?.value || 'direct';
        const gatewayId = document.getElementById('gatewayId')?.value.trim();

        if (!cameraId) {
            alert('⚠️ Zadejte Camera ID');
            return;
        }

        if (!username || !password) {
            alert('⚠️ Zadejte MQTT credentials');
            return;
        }

        if (mode === 'gateway' && !gatewayId) {
            alert('⚠️ Zadejte Gateway ID pro režim přes gateway');
            return;
        }

        // Connect to MQTT
        mqttClient.connect(cameraId, username, password, mode, gatewayId);

        // Start camera simulation
        imageCapture.startSimulation();

        // Enable buttons
        this.enableControls(true);

        // Update UI
        document.getElementById('connectBtn').style.display = 'none';
        document.getElementById('disconnectBtn').style.display = 'inline-flex';

        // Start status updates
        this.startStatusUpdates();
    },

    disconnect() {
        // Stop recording if active
        if (this.isRecording) {
            this.stopRecording();
        }

        // Stop auto-capture
        if (this.autoCaptureInterval) {
            clearInterval(this.autoCaptureInterval);
            this.autoCaptureInterval = null;
        }

        // Disconnect MQTT
        mqttClient.disconnect();
        mqttClient.resetGatewayStatus();

        // Stop camera simulation
        imageCapture.stopSimulation();

        // Disable buttons
        this.enableControls(false);

        // Update UI
        document.getElementById('connectBtn').style.display = 'inline-flex';
        document.getElementById('disconnectBtn').style.display = 'none';

        // Stop status updates
        this.stopStatusUpdates();
    },

    startPairing() {
        const selectedMode = document.getElementById('communicationMode')?.value || 'direct';
        const gatewayId = document.getElementById('gatewayId')?.value.trim();
        // Přepíšeme klienta aktuálním výběrem
        mqttClient.connectionMode = selectedMode;
        mqttClient.gatewayId = gatewayId || mqttClient.gatewayId;

        if (selectedMode !== 'gateway') {
            logger.log('⚠️ Pairing je dostupný jen v režimu přes gateway.', 'warning');
            const select = document.getElementById('communicationMode');
            if (select) select.focus();
            return;
        }

        if (!gatewayId) {
            logger.log('⚠️ Zadejte Gateway ID pro párování.', 'warning');
            const input = document.getElementById('gatewayId');
            if (input) input.focus();
            return;
        }

        mqttClient.sendPairRequest();
    },

    enableControls(enabled) {
        document.getElementById('captureBtn').disabled = !enabled;
        document.getElementById('recordBtn').disabled = !enabled;
    },

    capturePhoto() {
        if (!mqttClient.isConnected()) {
            logger.log('⚠️ Kamera není připojena', 'warning');
            return;
        }

        const snapshot = imageCapture.captureSnapshot();
        if (!snapshot) return;

        const photo = {
            id: `photo_${Date.now()}`,
            type: 'photo',
            timestamp: snapshot.timestamp,
            dataUrl: snapshot.dataUrl,
            thumbnail: snapshot.thumbnail,
            size: snapshot.size,
            resolution: this.settings.resolution
        };

        this.gallery.unshift(photo);
        this.updateGallery();
        this.updateStorageUsage(snapshot.size);

        // Publish to MQTT
        mqttClient.publishSnapshot(photo);

        logger.log(`📸 Fotka pořízena: ${photo.id}`, 'success');

        // Visual feedback
        this.flashEffect();
    },

    startRecording() {
        if (this.isRecording) return;

        this.isRecording = true;
        this.recordingStartTime = Date.now();

        document.getElementById('recordBtn').style.display = 'none';
        document.getElementById('stopRecordBtn').style.display = 'inline-flex';
        document.getElementById('recordingIndicator').style.display = 'flex';

        logger.log('🎥 Nahrávání spuštěno', 'info');
    },

    stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;
        const duration = Math.floor((Date.now() - this.recordingStartTime) / 1000);

        // Capture final frame as video thumbnail
        const snapshot = imageCapture.captureSnapshot();
        if (snapshot) {
            const video = {
                id: `video_${Date.now()}`,
                type: 'video',
                timestamp: snapshot.timestamp,
                dataUrl: snapshot.dataUrl,
                thumbnail: snapshot.thumbnail,
                size: snapshot.size * 30, // Simulate video size
                duration: duration,
                resolution: this.settings.resolution
            };

            this.gallery.unshift(video);
            this.updateGallery();
            this.updateStorageUsage(video.size);

            // Publish to MQTT
            mqttClient.publishSnapshot(video);
        }

        document.getElementById('recordBtn').style.display = 'inline-flex';
        document.getElementById('stopRecordBtn').style.display = 'none';
        document.getElementById('recordingIndicator').style.display = 'none';

        logger.log(`⏹️ Nahrávání zastaveno (${duration}s)`, 'success');
    },

    setResolution(resolution) {
        this.settings.resolution = resolution;
        document.getElementById('resolutionValue').textContent = resolution;
        logger.log(`📐 Rozlišení změněno: ${resolution}`, 'info');

        // Update canvas size
        const [width, height] = resolution.split('x').map(Number);
        const canvas = document.getElementById('cameraCanvas');
        canvas.width = Math.min(width, 640);
        canvas.height = Math.min(height, 480);
    },

    setQuality(quality) {
        this.settings.quality = parseInt(quality);
        document.getElementById('qualityDisplay').textContent = quality;
        document.getElementById('qualityValue').textContent = `${quality}%`;
        logger.log(`🎨 Kvalita změněna: ${quality}%`, 'info');
    },

    toggleAutoCapture(enabled) {
        this.settings.autoCapture = enabled;

        if (enabled) {
            this.autoCaptureInterval = setInterval(() => {
                this.capturePhoto();
            }, 5 * 60 * 1000); // 5 minutes
            logger.log('⏰ Auto-capture zapnuto (každých 5 min)', 'info');
        } else {
            if (this.autoCaptureInterval) {
                clearInterval(this.autoCaptureInterval);
                this.autoCaptureInterval = null;
            }
            logger.log('⏰ Auto-capture vypnuto', 'info');
        }
    },

    toggleMotionDetection(enabled) {
        this.settings.motionDetection = enabled;
        logger.log(`🎬 Detekce pohybu ${enabled ? 'zapnuta' : 'vypnuta'}`, 'info');

        if (enabled) {
            // Simulate motion detection
            setTimeout(() => {
                if (this.settings.motionDetection) {
                    logger.log('🚨 Pohyb detekován! Pořizuji fotku...', 'warning');
                    this.capturePhoto();
                }
            }, 10000);
        }
    },

    updateGallery() {
        const gallery = document.getElementById('gallery');
        const filtered = this.getFilteredGallery();

        if (filtered.length === 0) {
            gallery.innerHTML = `
                <div class="gallery-empty">
                    <div>📷</div>
                    <p>Žádné snímky</p>
                    <small>Změňte filtr nebo pořiďte nový snímek</small>
                </div>
            `;
        } else {
            gallery.innerHTML = filtered.map(item => `
                <div class="gallery-item" onclick="camera.openImage('${item.id}')">
                    <div class="gallery-item-type">${item.type === 'video' ? '🎥' : '📸'}</div>
                    <img src="${item.thumbnail}" alt="${item.type}">
                    <div class="gallery-item-info">
                        <div class="gallery-item-time">${new Date(item.timestamp).toLocaleTimeString('cs-CZ')}</div>
                        ${item.duration ? `<div class="gallery-item-duration">${item.duration}s</div>` : ''}
                    </div>
                </div>
            `).join('');
        }

        document.getElementById('galleryCount').textContent = `${this.gallery.length} snímků`;
    },

    filterGallery(filter) {
        this.currentFilter = filter;

        // Update filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        this.updateGallery();
    },

    getFilteredGallery() {
        if (this.currentFilter === 'all') {
            return this.gallery;
        }
        return this.gallery.filter(item => item.type === this.currentFilter);
    },

    openImage(id) {
        const item = this.gallery.find(i => i.id === id);
        if (!item) return;

        this.selectedImage = item;

        const modal = document.getElementById('imageModal');
        const modalImage = document.getElementById('modalImage');
        const modalTitle = document.getElementById('modalTitle');
        const modalSubtitle = document.getElementById('modalSubtitle');

        modalImage.src = item.dataUrl;
        modalTitle.textContent = item.type === 'video' ? '🎥 Video' : '📸 Fotografie';
        modalSubtitle.textContent = new Date(item.timestamp).toLocaleString('cs-CZ');

        modal.classList.add('active');
    },

    closeModal() {
        const modal = document.getElementById('imageModal');
        modal.classList.remove('active');
        this.selectedImage = null;
    },

    downloadImage() {
        if (!this.selectedImage) return;

        const link = document.createElement('a');
        link.download = `${this.selectedImage.id}.jpg`;
        link.href = this.selectedImage.dataUrl;
        link.click();

        logger.log(`⬇️ Snímek stažen: ${this.selectedImage.id}`, 'success');
    },

    async uploadToServer() {
        if (!this.selectedImage) return;

        logger.log(`☁️ Nahrávám na server: ${this.selectedImage.id}`, 'info');

        // Simulate upload
        setTimeout(() => {
            logger.log(`✅ Snímek nahrán na server`, 'success');
            this.closeModal();
        }, 1500);
    },

    deleteImage() {
        if (!this.selectedImage) return;

        const index = this.gallery.findIndex(i => i.id === this.selectedImage.id);
        if (index !== -1) {
            this.gallery.splice(index, 1);
            this.updateGallery();
            this.updateStorageUsage(-this.selectedImage.size);
            logger.log(`🗑️ Snímek smazán: ${this.selectedImage.id}`, 'warning');
        }

        this.closeModal();
    },

    flashEffect() {
        const canvas = document.getElementById('cameraCanvas');
        canvas.style.filter = 'brightness(2)';
        setTimeout(() => {
            canvas.style.filter = 'brightness(1)';
        }, 100);
    },

    updateStorageUsage(delta) {
        this.status.storageUsed += delta / (1024 * 1024); // Convert to MB
        this.status.storageUsed = Math.max(0, this.status.storageUsed);

        const used = this.status.storageUsed.toFixed(1);
        const total = this.status.storageTotal;
        document.getElementById('storageValue').textContent = `${used} / ${total} MB`;
    },

    startStatusUpdates() {
        this.statusInterval = setInterval(() => {
            // Simulate battery drain
            this.status.battery = Math.max(0, this.status.battery - 0.1);
            document.getElementById('batteryValue').textContent = `${Math.floor(this.status.battery)}%`;

            // Simulate temperature fluctuation
            this.status.temperature = 40 + Math.random() * 5;
            document.getElementById('tempValue').textContent = `${Math.floor(this.status.temperature)}°C`;

            // Update FPS
            document.getElementById('fpsValue').textContent = imageCapture.isSimulating ? '30' : '0';

            // Publish status every 30 seconds
            if (Date.now() % 30000 < 1000) {
                mqttClient.publishStatus();
            }
        }, 1000);
    },

    stopStatusUpdates() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
    }
};
