/**
 * Camera Module Simulation
 * Inspired by CameraScreen in the Expo app
 */

const cameraModule = {
    state: {
        status: 'offline',
        isRecording: false,
        streamUrl: '',
        filter: 'all',
        snapshots: [],
        moduleInfo: null,
        selectedSnapshotId: null,
        lastUpdate: null,
        gatewayPair: null
    },
    elements: {},

    init() {
        this.cacheDom();
        if (!this.elements.card) {
            console.warn('[Camera] Card not found, skipping init');
            return;
        }
        this.seedSnapshots();
        this.bindEvents();
        this.render();
        this.simulateInitialStatus();
    },

    cacheDom() {
        this.elements = {
            card: document.getElementById('cameraCard'),
            statusBadge: document.getElementById('cameraStatusBadge'),
            statusDot: document.getElementById('cameraStatusDot'),
            statusText: document.getElementById('cameraStatusText'),
            statusSubtext: document.getElementById('cameraStatusSubtext'),
            streamPlaceholder: document.getElementById('cameraStreamPlaceholder'),
            streamText: document.getElementById('cameraStreamText'),
            streamSubtext: document.getElementById('cameraStreamSubtext'),
            takePhotoBtn: document.getElementById('cameraTakePhotoBtn'),
            fetchLatestBtn: document.getElementById('cameraFetchLatestBtn'),
            recordBtn: document.getElementById('cameraRecordBtn'),
            stopBtn: document.getElementById('cameraStopBtn'),
            recordingIndicator: document.getElementById('cameraRecordingIndicator'),
            filterButtons: document.getElementById('cameraFilterButtons'),
            snapshotsContainer: document.getElementById('cameraSnapshotsContainer'),
            snapshotsEmpty: document.getElementById('cameraSnapshotsEmpty'),
            snapshotCount: document.getElementById('cameraSnapshotCount'),
            diagConnection: document.getElementById('cameraDiagConnection'),
            diagStream: document.getElementById('cameraDiagStream'),
            diagRecording: document.getElementById('cameraDiagRecording'),
            diagSnapshots: document.getElementById('cameraDiagSnapshots'),
            moduleName: document.getElementById('cameraModuleName'),
            moduleId: document.getElementById('cameraModuleId'),
            moduleWarning: document.getElementById('cameraModuleStatus'),
            modal: document.getElementById('cameraSnapshotModal'),
            modalTitle: document.getElementById('cameraModalTitle'),
            modalSubtitle: document.getElementById('cameraModalSubtitle'),
            modalImage: document.getElementById('cameraModalImage'),
            modalOverlay: document.getElementById('cameraModalVideoOverlay'),
            modalClose: document.getElementById('cameraModalClose'),
            modalDelete: document.getElementById('cameraModalDeleteBtn'),
            modalDownload: document.getElementById('cameraModalDownloadBtn')
        };
    },

    seedSnapshots() {
        this.state.snapshots = [];
    },

    bindEvents() {
        this.elements.takePhotoBtn?.addEventListener('click', () => this.takePhoto('manual'));
        this.elements.fetchLatestBtn?.addEventListener('click', () => this.fetchLatestPhoto());
        this.elements.recordBtn?.addEventListener('click', () => this.startRecording());
        this.elements.stopBtn?.addEventListener('click', () => this.stopRecording());

        this.elements.filterButtons?.addEventListener('click', (event) => {
            const btn = event.target.closest('button[data-filter]');
            if (!btn) return;
            const filter = btn.getAttribute('data-filter');
            this.setFilter(filter);
        });

        this.elements.snapshotsContainer?.addEventListener('click', (event) => {
            const deleteBtn = event.target.closest('.camera-snapshot-delete');
            if (deleteBtn) {
                event.stopPropagation();
                const id = deleteBtn.getAttribute('data-id');
                this.deleteSnapshot(id);
                return;
            }
            const confirmBtn = event.target.closest('.camera-snapshot-confirm');
            if (confirmBtn) {
                event.stopPropagation();
                const id = confirmBtn.getAttribute('data-id');
                this.confirmSnapshot(id);
                return;
            }
            const card = event.target.closest('.camera-snapshot-card');
            if (card) {
                const id = card.getAttribute('data-id');
                this.openSnapshot(id);
            }
        });

        this.elements.modalClose?.addEventListener('click', () => this.closeModal());
        this.elements.modal?.addEventListener('click', (event) => {
            if (event.target === this.elements.modal) {
                this.closeModal();
            }
        });
        this.elements.modalDelete?.addEventListener('click', () => {
            if (this.state.selectedSnapshotId) {
                this.deleteSnapshot(this.state.selectedSnapshotId);
            }
        });
        this.elements.modalDownload?.addEventListener('click', () => {
            if (this.state.selectedSnapshotId) {
                const snapshot = this.getSnapshotById(this.state.selectedSnapshotId);
                if (snapshot) {
                    this.log(`⬇️ Snímek "${snapshot.time}" by byl stažen`, 'info');
                    alert('Snímek bude stažen (simulace).');
                }
            }
        });
    },

    simulateInitialStatus() {
        setTimeout(() => {
            this.setStatus('offline');
            this.setStreamUrl('');
        }, 1200);
    },

    getDateLabel(date) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diffDays = Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));
        if (diffDays === 0) return 'Dnes';
        if (diffDays === 1) return 'Včera';
        return target.toLocaleDateString('cs-CZ');
    },

    render() {
        this.updateStatusUI();
        this.renderSnapshots();
        this.updateDiagnostics();
    },

    updateStatusUI() {
        const isOnline = this.state.status === 'online';
        if (this.elements.statusBadge) {
            this.elements.statusBadge.classList.toggle('online', isOnline);
            this.elements.statusBadge.classList.toggle('offline', !isOnline);
            this.elements.statusBadge.textContent = isOnline ? '🟢 Online' : '🔴 Offline';
        }
        if (this.elements.statusDot) {
            this.elements.statusDot.style.background = isOnline ? '#16a34a' : '#991b1b';
            this.elements.statusDot.style.boxShadow = isOnline
                ? '0 0 0 4px rgba(134, 239, 172, 0.5)'
                : '0 0 0 4px rgba(248, 113, 113, 0.5)';
        }
        if (this.elements.statusText) {
            this.elements.statusText.textContent = isOnline ? 'Online' : 'Offline';
        }
        if (this.elements.statusSubtext) {
            this.elements.statusSubtext.textContent = isOnline
                ? 'Stream běží'
                : 'Čekám na připojení...';
        }
        if (this.elements.streamText) {
            this.elements.streamText.textContent = isOnline
                ? 'Stream běží'
                : 'Stream bude zobrazen zde';
        }
        if (this.elements.streamSubtext) {
            this.elements.streamSubtext.textContent = isOnline
                ? `Připojeno k ${this.state.streamUrl || 'neznámému zdroji'}`
                : 'Kamera není připojena';
        }
        // Gateway status text in diagnostics
        const gatewayStatusEl = document.getElementById('cameraDiagConnection');
        if (gatewayStatusEl) {
            if (this.state.gatewayPair) {
                gatewayStatusEl.textContent = `Gateway: ${this.state.gatewayPair.gatewayId || 'neznámo'} (spárováno)`;
            } else {
                gatewayStatusEl.textContent = 'Gateway: čekám na potvrzení...';
            }
        }

        if (!isOnline && this.state.isRecording) {
            this.stopRecording();
        }
    },

    setGatewayPairing(info) {
        this.state.gatewayPair = info;
        if (this.elements.moduleName) this.elements.moduleName.textContent = info?.name || 'Kamera (gateway)';
        if (this.elements.moduleId) this.elements.moduleId.textContent = `ID: ${info?.moduleId || '-'}`;
        this.setStatus('online');
        this.updateStatusUI();
    },

    updateStatusFromGateway(cameraId, payload) {
        if (!this.state.gatewayPair || this.state.gatewayPair.moduleId === cameraId) {
            this.state.gatewayPair = this.state.gatewayPair || { moduleId: cameraId, name: payload?.cameraName || `Camera ${cameraId}` };
            this.setStatus(payload?.status || 'online');
            if (payload?.streamUrl) this.setStreamUrl(payload.streamUrl);
        }
        this.updateStatusUI();
    },

    addSnapshotFromGateway(cameraId, payload, gatewayId) {
        const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
        const imageUrl = payload.thumbnail || payload.dataUrl;

        if (!imageUrl) {
            this.log('⚠️ Snímek neobsahuje thumbnail ani dataUrl', 'warning');
            return;
        }

        const snapshot = {
            id: payload.snapshotId || `snap_${Date.now()}`,
            type: payload.type || 'photo',
            timestamp,
            time: timestamp.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
            dateLabel: this.getDateLabel(timestamp),
            url: imageUrl,
            pending: true,
            cameraId,
            gatewayId
        };
        this.state.snapshots.unshift(snapshot);
        this.renderSnapshots();
        this.updateStatusUI();
        this.log(`📸 Nový snímek z kamery ${cameraId} (gateway ${gatewayId || '-'})`, 'success');
    },

    confirmSnapshot(id) {
        const snapshot = this.getSnapshotById(id);
        if (!snapshot) return;
        snapshot.pending = false;
        this.renderSnapshots();
        const cameraId = snapshot.cameraId || (this.state.gatewayPair && this.state.gatewayPair.moduleId) || 'camera-sim';
        const ackTopic = `smartcoop/${simulator.deviceId}/camera/${cameraId}/snapshot/ack`;
        const ackPayload = {
            snapshotId: snapshot.id,
            cameraId,
            gatewayId: simulator.deviceId,
            status: 'ok',
            timestamp: new Date().toISOString()
        };
        simulator.publish(ackTopic, ackPayload);
        this.log(`✅ Snímek ${snapshot.id} potvrzen a ACK odeslán`, 'success');
    },

    renderSnapshots() {
        if (!this.elements.snapshotsContainer) return;
        const snapshots = this.getFilteredSnapshots();
        if (snapshots.length === 0) {
            this.elements.snapshotsContainer.innerHTML = '';
            if (this.elements.snapshotsEmpty) this.elements.snapshotsEmpty.style.display = 'block';
        } else {
            if (this.elements.snapshotsEmpty) this.elements.snapshotsEmpty.style.display = 'none';
            this.elements.snapshotsContainer.innerHTML = snapshots.map(snapshot => `
                <div class="camera-snapshot-card" data-id="${snapshot.id}">
                    <div class="camera-snapshot-type">${snapshot.type === 'video' ? 'Video' : 'Foto'}</div>
                    <div class="camera-snapshot-thumb">
                        <img src="${snapshot.url}" alt="Snapshot ${snapshot.time}">
                    </div>
                    <div class="camera-snapshot-info">
                        <strong>${snapshot.time}</strong>
                        <span class="camera-snapshot-date">${snapshot.dateLabel}</span>
                    </div>
                    ${snapshot.pending ? `<button class="btn btn-primary camera-snapshot-confirm" data-id="${snapshot.id}">✅ Potvrdit</button>` : ''}
                    <button class="camera-snapshot-delete" data-id="${snapshot.id}" title="Smazat">✖</button>
                </div>
            `).join('');
        }
        if (this.elements.snapshotCount) {
            const label = snapshots.length === 1 ? 'snímek'
                : snapshots.length < 5 ? 'snímky' : 'snímků';
            this.elements.snapshotCount.textContent = `${snapshots.length} ${label}`;
        }
    },

    getFilteredSnapshots() {
        const { filter, snapshots } = this.state;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

        return snapshots.filter(snapshot => {
            const date = snapshot.timestamp;
            switch (filter) {
                case 'today':
                    return date >= today;
                case 'yesterday':
                    return date >= yesterday && date < today;
                case 'week':
                    return date >= weekAgo;
                default:
                    return true;
            }
        });
    },

    updateDiagnostics() {
        if (this.elements.diagConnection) {
            this.elements.diagConnection.textContent = this.state.status === 'online'
                ? 'Stream dostupný'
                : 'Stream nedostupný';
        }
        if (this.elements.diagStream) {
            this.elements.diagStream.textContent = this.state.streamUrl || 'Nezadáno';
        }
        if (this.elements.diagRecording) {
            this.elements.diagRecording.textContent = this.state.isRecording ? '🔴 Probíhá' : 'Neaktivní';
        }
        if (this.elements.diagSnapshots) {
            const count = this.state.snapshots.length;
            const label = count === 1 ? 'snímek' : count < 5 ? 'snímky' : 'snímků';
            this.elements.diagSnapshots.textContent = `${count} ${label}`;
        }
    },

    setStatus(status) {
        this.state.status = status;
        this.updateStatusUI();
        this.updateDiagnostics();
        this.publishStatus();
    },

    setStreamUrl(url) {
        this.state.streamUrl = url;
        this.updateStatusUI();
        this.updateDiagnostics();
        this.publishStatus();
    },

    takePhoto(source = 'manual') {
        this.log(`🔍 takePhoto() volána, source: ${source}`, 'info');
        this.log(`🔍 gatewayPair: ${JSON.stringify(this.state.gatewayPair)}`, 'info');

        // Pokud už máme pending snímek z gateway, jen ho potvrďte
        const pending = this.state.snapshots.find(s => s.pending);
        if (pending) {
            this.log('✅ Potvrzuji pending snímek', 'info');
            this.confirmSnapshot(pending.id);
            return;
        }

        // Pokud je napárována kamera přes gateway, pošleme jí příkaz k focení
        if (this.state.gatewayPair) {
            const cameraId = this.state.gatewayPair.moduleId;
            const topic = `smartcoop/${simulator.deviceId}/camera/${cameraId}/command`;
            const payload = { action: 'capture', timestamp: new Date().toISOString() };
            this.log(`📤 Posílám MQTT na topic: ${topic}`, 'info');
            this.log(`📤 Payload: ${JSON.stringify(payload)}`, 'info');
            simulator.publish(topic, payload);
            this.log(`📸 Požadavek na fotku odeslán kameře ${cameraId} přes gateway`, 'success');
            return;
        }

        // Pokud není spárována kamera, nelze pořizovat fotky
        this.log('❌ Kamera není spárována - nelze pořizovat fotky', 'error');
        alert('⚠️ Nejprve spárujte kameru přes gateway pro pořizování fotek');
    },

    fetchLatestPhoto() {
        // Pokud není spárována kamera, nelze stáhnout fotku
        if (!this.state.gatewayPair) {
            this.log('❌ Kamera není spárována - nelze stáhnout fotku', 'error');
            alert('⚠️ Nejprve spárujte kameru přes gateway');
            return;
        }

        const cameraId = this.state.gatewayPair.moduleId;
        const topic = `smartcoop/${simulator.deviceId}/camera/${cameraId}/command`;
        const payload = {
            action: 'capture',
            requestLatest: true,
            timestamp: new Date().toISOString()
        };

        simulator.publish(topic, payload);
        this.log(`⬇️ Požadavek na stažení poslední fotky odeslán kameře ${cameraId}`, 'info');
    },

    startRecording(remote = false) {
        if (this.state.isRecording) return;

        // Pokud je napárována kamera, pošleme jí příkaz k nahrávání
        if (this.state.gatewayPair) {
            const cameraId = this.state.gatewayPair.moduleId;
            const topic = `smartcoop/${simulator.deviceId}/camera/${cameraId}/command`;
            const payload = { action: 'start_recording', timestamp: new Date().toISOString() };
            simulator.publish(topic, payload);
            this.log(`🎥 Příkaz k zahájení nahrávání odeslán kameře ${cameraId}`, 'info');

            this.state.isRecording = true;
            this.updateRecordingUI();
            this.updateDiagnostics();
            this.publishStatus({ event: 'recording_started' });
            return;
        }

        // Pokud není spárována kamera, nelze nahrávat
        this.log('❌ Kamera není spárována - nelze nahrávat', 'error');
        alert('⚠️ Nejprve spárujte kameru přes gateway pro nahrávání videa');
    },

    stopRecording(remote = false) {
        if (!this.state.isRecording) return;
        this.state.isRecording = false;

        // Pokud je napárována kamera, pošleme jí příkaz k zastavení
        if (this.state.gatewayPair) {
            const cameraId = this.state.gatewayPair.moduleId;
            const topic = `smartcoop/${simulator.deviceId}/camera/${cameraId}/command`;
            const payload = { action: 'stop_recording', timestamp: new Date().toISOString() };
            simulator.publish(topic, payload);
            this.log(`⏹️ Příkaz k zastavení nahrávání odeslán kameře ${cameraId}`, 'info');
        }

        this.updateRecordingUI();
        this.updateDiagnostics();
        this.publishStatus({ event: 'recording_stopped' });
        this.log(remote ? '⏹️ Nahrávání zastaveno přes MQTT' : '⏹️ Nahrávání zastaveno', 'info');
    },

    updateRecordingUI() {
        if (this.elements.recordBtn) {
            this.elements.recordBtn.style.display = this.state.isRecording ? 'none' : 'inline-flex';
            this.elements.recordBtn.disabled = this.state.isRecording;
        }
        if (this.elements.stopBtn) {
            this.elements.stopBtn.style.display = this.state.isRecording ? 'inline-flex' : 'none';
        }
        if (this.elements.recordingIndicator) {
            this.elements.recordingIndicator.style.display = this.state.isRecording ? 'flex' : 'none';
        }
    },

    setFilter(filter) {
        this.state.filter = filter;
        if (this.elements.filterButtons) {
            Array.from(this.elements.filterButtons.querySelectorAll('button')).forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
            });
        }
        this.renderSnapshots();
    },

    deleteSnapshot(id) {
        const before = this.state.snapshots.length;
        this.state.snapshots = this.state.snapshots.filter(s => s.id !== id);
        if (this.state.selectedSnapshotId === id) {
            this.closeModal();
        }
        if (before !== this.state.snapshots.length) {
            this.renderSnapshots();
            this.updateDiagnostics();
            this.publishStatus({ event: 'snapshot_deleted' });
            this.log('🗑️ Snímek smazán', 'warning');
        }
    },

    openSnapshot(id) {
        const snapshot = this.getSnapshotById(id);
        if (!snapshot || !this.elements.modal) return;
        this.state.selectedSnapshotId = snapshot.id;
        this.elements.modal.classList.add('active');
        if (this.elements.modalTitle) {
            this.elements.modalTitle.textContent = snapshot.type === 'video' ? '🎥 Video' : '📸 Fotografie';
        }
        if (this.elements.modalSubtitle) {
            this.elements.modalSubtitle.textContent = `${snapshot.dateLabel} v ${snapshot.time}`;
        }
        if (this.elements.modalImage) {
            this.elements.modalImage.src = snapshot.url;
        }
        if (this.elements.modalOverlay) {
            this.elements.modalOverlay.style.display = snapshot.type === 'video' ? 'block' : 'none';
        }
    },

    closeModal() {
        if (this.elements.modal) {
            this.elements.modal.classList.remove('active');
        }
        this.state.selectedSnapshotId = null;
    },

    getSnapshotById(id) {
        return this.state.snapshots.find(s => s.id === id);
    },

    attachModule(module) {
        this.state.moduleInfo = module || null;
        if (this.elements.moduleName) {
            this.elements.moduleName.textContent = module?.name || 'Simulovaná kamera';
        }
        if (this.elements.moduleId) {
            const moduleId = module?.moduleId || '-';
            this.elements.moduleId.textContent = `ID: ${moduleId}`;
        }
        if (this.elements.moduleWarning) {
            this.elements.moduleWarning.style.display = module ? 'none' : 'block';
        }
    },

    handleCommand(action, payload = {}) {
        let success = true;

        switch (action) {
            case 'capture':
            case 'photo':
            case 'take_photo':
                this.takePhoto('remote');
                break;
            case 'start_recording':
            case 'record_start':
            case 'record':
                this.startRecording(true);
                break;
            case 'stop_recording':
            case 'record_stop':
                this.stopRecording(true);
                break;
            case 'stream_on':
                this.setStatus('online');
                if (payload.streamUrl) {
                    this.setStreamUrl(payload.streamUrl);
                }
                break;
            case 'stream_off':
                this.setStatus('offline');
                break;
            default:
                this.log(`ℹ️ Neznámý příkaz pro kameru: ${action}`, 'info');
                success = false;
        }

        // Send ACK - Device Shadow pattern
        if (typeof simulator !== 'undefined' && simulator.isConnected && simulator.isConnected()) {
            const moduleId = this.state.moduleInfo?.moduleId || 'camera-sim';
            const ackTopic = `smartcoop/${simulator.deviceId}/modules/${moduleId}/command_ack`;
            simulator.publish(ackTopic, {
                commandId: payload.requestId || payload.commandId,
                requestId: payload.requestId || payload.commandId,
                moduleId,
                action,
                success,
                status: success ? 'success' : 'unknown_command',
                timestamp: Date.now()
            });
            console.log(`[Camera] Command ACK sent to ${ackTopic}`);
        }
    },

    publishStatus(extra = {}) {
        if (typeof simulator === 'undefined' || !simulator.isConnected || !simulator.isConnected()) return;
        if (!this.state.moduleInfo) return;
        const moduleId = this.state.moduleInfo.moduleId || 'camera-sim';
        const topic = `smartcoop/${simulator.deviceId}/modules/${moduleId}/status`;
        const payload = {
            moduleId,
            type: 'camera',
            status: this.state.status,
            isRecording: this.state.isRecording,
            streamUrl: this.state.streamUrl,
            snapshots: this.state.snapshots.slice(0, 5).map(s => ({
                id: s.id,
                type: s.type,
                time: s.time,
                dateLabel: s.dateLabel
            })),
            snapshotsCount: this.state.snapshots.length,
            lastSnapshotAt: this.state.snapshots[0]?.timestamp?.toISOString() || null,
            timestamp: new Date().toISOString(),
            ...extra
        };
        simulator.publish(topic, payload);
    },

    log(message, level = 'info') {
        if (typeof logger !== 'undefined') {
            logger.log(message, level);
        } else {
            console.log('[Camera]', message);
        }
    }
};
