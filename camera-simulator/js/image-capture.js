/**
 * Image Capture Module
 * Handles photo/video capture simulation using Canvas API
 */

const imageCapture = {
    canvas: null,
    ctx: null,
    animationFrame: null,
    isSimulating: false,

    init() {
        this.canvas = document.getElementById('cameraCanvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }
        this.ctx = this.canvas.getContext('2d');
    },

    startSimulation() {
        if (this.isSimulating) return;
        this.isSimulating = true;
        this.animate();

        // Hide overlay
        const overlay = document.getElementById('cameraOverlay');
        if (overlay) overlay.style.display = 'none';
    },

    stopSimulation() {
        this.isSimulating = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        // Show overlay
        const overlay = document.getElementById('cameraOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.querySelector('.camera-overlay-text').textContent = 'Kamera offline';
        }

        // Clear canvas
        this.ctx.fillStyle = '#1f2937';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    },

    animate() {
        if (!this.isSimulating) return;

        // Simulate camera feed with animated gradient
        const time = Date.now() / 1000;
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);

        // Create dynamic gradient colors
        const hue1 = (time * 20) % 360;
        const hue2 = (time * 20 + 120) % 360;

        gradient.addColorStop(0, `hsl(${hue1}, 70%, 50%)`);
        gradient.addColorStop(0.5, `hsl(${hue2}, 70%, 40%)`);
        gradient.addColorStop(1, `hsl(${hue1}, 70%, 30%)`);

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Add some noise for realism
        this.addNoise();

        // Add timestamp overlay
        this.addTimestamp();

        // Add camera info overlay
        this.addCameraInfo();

        this.animationFrame = requestAnimationFrame(() => this.animate());
    },

    addNoise() {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            if (Math.random() > 0.98) {
                const noise = Math.random() * 50;
                data[i] += noise;
                data[i + 1] += noise;
                data[i + 2] += noise;
            }
        }

        this.ctx.putImageData(imageData, 0, 0);
    },

    addTimestamp() {
        const now = new Date();
        const timestamp = now.toLocaleString('cs-CZ');

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(10, 10, 200, 30);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '14px monospace';
        this.ctx.fillText(timestamp, 15, 30);
    },

    addCameraInfo() {
        const info = `${camera.settings.resolution} | Q:${camera.settings.quality}`;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(10, this.canvas.height - 40, 180, 30);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '12px monospace';
        this.ctx.fillText(info, 15, this.canvas.height - 20);

        // Add recording indicator if recording
        if (camera.isRecording) {
            this.ctx.fillStyle = '#ef4444';
            this.ctx.beginPath();
            this.ctx.arc(this.canvas.width - 30, 30, 10, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 12px sans-serif';
            this.ctx.fillText('REC', this.canvas.width - 60, 35);
        }
    },

    captureSnapshot() {
        if (!this.isSimulating) {
            logger.log('⚠️ Kamera není aktivní', 'warning');
            return null;
        }

        // Capture current canvas state
        const dataUrl = this.canvas.toDataURL('image/jpeg', camera.settings.quality / 100);

        // Create thumbnail
        const thumbnailCanvas = document.createElement('canvas');
        thumbnailCanvas.width = 160;
        thumbnailCanvas.height = 120;
        const thumbnailCtx = thumbnailCanvas.getContext('2d');
        thumbnailCtx.drawImage(this.canvas, 0, 0, 160, 120);
        const thumbnail = thumbnailCanvas.toDataURL('image/jpeg', 0.7);

        return {
            dataUrl,
            thumbnail,
            size: this.estimateSize(dataUrl),
            timestamp: new Date().toISOString()
        };
    },

    estimateSize(dataUrl) {
        // Estimate size in bytes from base64 string
        const base64Length = dataUrl.split(',')[1].length;
        return Math.floor((base64Length * 3) / 4);
    },

    async loadExternalImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
                resolve();
            };
            img.onerror = reject;
            img.src = url;
        });
    }
};
