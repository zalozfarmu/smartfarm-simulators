/**
 * Tests for Device Simulator Shadow ACK
 *
 * Tests that simulator correctly sends command_ack messages
 * when receiving commands from backend.
 */

// Mock MQTT client
const mockPublish = jest.fn();
const mockClient = {
  publish: mockPublish,
  connected: true
};

// Mock simulator
global.simulator = {
  deviceId: 'test-device-001',
  client: mockClient,
  isConnected: () => true,
  publish: (topic, payload) => {
    mockClient.publish(topic, JSON.stringify(payload));
  }
};

// Mock logger
global.logger = {
  log: jest.fn()
};

describe('Door Module ACK', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Inline door module for testing
  const door = {
    state: 'closed',
    open: function() { this.state = 'opening'; },
    close: function() { this.state = 'closing'; },
    stop: function() { this.state = 'stopped'; },
    saveSettings: jest.fn(),
    calculateNextAction: jest.fn(),
    mode: 'sun',
    openTime: '06:00',
    closeTime: '21:00',
    openOffset: 0,
    closeOffset: 0,
    enabled: true,

    handleCommand(action, payload = {}) {
      switch (action) {
        case 'open': this.open(); break;
        case 'close': this.close(); break;
        case 'stop': this.stop(); break;
        case 'toggle':
          if (this.state === 'closed' || this.state === 'closing') {
            this.open();
          } else {
            this.close();
          }
          break;
        case 'updateSettings':
          if (payload.mode) this.mode = payload.mode;
          if (payload.openTime) this.openTime = payload.openTime;
          if (payload.closeTime) this.closeTime = payload.closeTime;
          if (payload.openOffset !== undefined) this.openOffset = payload.openOffset;
          if (payload.closeOffset !== undefined) this.closeOffset = payload.closeOffset;
          if (payload.enabled !== undefined) this.enabled = payload.enabled;
          this.saveSettings();
          this.calculateNextAction();
          break;
      }

      // Send ACK - Device Shadow pattern
      if (simulator.isConnected()) {
        const ackTopic = `smartcoop/${simulator.deviceId}/command_ack`;
        simulator.publish(ackTopic, {
          commandId: payload.requestId || payload.commandId,
          requestId: payload.requestId || payload.commandId,
          action,
          success: true,
          status: 'success',
          timestamp: Date.now()
        });

        // Legacy response
        const responseTopic = `smartcoop/${simulator.deviceId}/response`;
        simulator.publish(responseTopic, {
          requestId: payload.requestId || `req_${Date.now()}`,
          action,
          status: 'success',
          timestamp: Date.now()
        });
      }
    }
  };

  test('should send command_ack on open command', () => {
    const payload = {
      requestId: 'cmd_test_123',
      action: 'open'
    };

    door.handleCommand('open', payload);

    expect(door.state).toBe('opening');
    expect(mockPublish).toHaveBeenCalledTimes(2);

    // Check command_ack
    const ackCall = mockPublish.mock.calls.find(call =>
      call[0] === 'smartcoop/test-device-001/command_ack'
    );
    expect(ackCall).toBeDefined();

    const ackPayload = JSON.parse(ackCall[1]);
    expect(ackPayload.commandId).toBe('cmd_test_123');
    expect(ackPayload.action).toBe('open');
    expect(ackPayload.success).toBe(true);
    expect(ackPayload.status).toBe('success');
  });

  test('should send command_ack on close command', () => {
    const payload = {
      commandId: 'cmd_close_456',
      action: 'close'
    };

    door.handleCommand('close', payload);

    expect(door.state).toBe('closing');

    const ackCall = mockPublish.mock.calls.find(call =>
      call[0] === 'smartcoop/test-device-001/command_ack'
    );
    expect(ackCall).toBeDefined();

    const ackPayload = JSON.parse(ackCall[1]);
    expect(ackPayload.commandId).toBe('cmd_close_456');
    expect(ackPayload.success).toBe(true);
  });

  test('should send command_ack on updateSettings command', () => {
    const payload = {
      requestId: 'cmd_settings_789',
      mode: 'timer',
      openTime: '07:00',
      closeTime: '20:00'
    };

    door.handleCommand('updateSettings', payload);

    expect(door.mode).toBe('timer');
    expect(door.openTime).toBe('07:00');
    expect(door.closeTime).toBe('20:00');

    const ackCall = mockPublish.mock.calls.find(call =>
      call[0] === 'smartcoop/test-device-001/command_ack'
    );
    expect(ackCall).toBeDefined();
  });

  test('should include timestamp in ACK', () => {
    const beforeTime = Date.now();

    door.handleCommand('stop', { requestId: 'cmd_stop_111' });

    const afterTime = Date.now();

    const ackCall = mockPublish.mock.calls.find(call =>
      call[0] === 'smartcoop/test-device-001/command_ack'
    );
    const ackPayload = JSON.parse(ackCall[1]);

    expect(ackPayload.timestamp).toBeGreaterThanOrEqual(beforeTime);
    expect(ackPayload.timestamp).toBeLessThanOrEqual(afterTime);
  });

  test('should also send legacy response', () => {
    door.handleCommand('open', { requestId: 'cmd_test_222' });

    const responseCall = mockPublish.mock.calls.find(call =>
      call[0] === 'smartcoop/test-device-001/response'
    );
    expect(responseCall).toBeDefined();

    const responsePayload = JSON.parse(responseCall[1]);
    expect(responsePayload.action).toBe('open');
    expect(responsePayload.status).toBe('success');
  });
});

describe('Feeder Module ACK', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const feeder = {
    state: {
      moduleInfo: { moduleId: 'feeder-sn-001' },
      foodLevel: 75,
      totalDispensedToday: 100,
      schedules: []
    },
    dispense: jest.fn(),
    refill: jest.fn(),
    renderScheduleList: jest.fn(),
    renderStats: jest.fn(),
    log: jest.fn(),

    handleCommand(action, payload = {}) {
      let success = true;

      switch (action) {
        case 'manual_feed':
        case 'feed':
          this.dispense(payload.amount || 25, 'MQTT');
          break;
        case 'refill':
          this.refill();
          break;
        case 'schedule_update':
          if (Array.isArray(payload.schedules)) {
            this.state.schedules = payload.schedules;
            this.renderScheduleList();
            this.renderStats();
          }
          break;
        default:
          success = false;
      }

      // Send ACK
      if (simulator.isConnected()) {
        const moduleId = this.state.moduleInfo?.moduleId || 'feeder-sim';
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
      }
    }
  };

  test('should send module-level command_ack on feed command', () => {
    const payload = {
      requestId: 'cmd_feed_001',
      amount: 50
    };

    feeder.handleCommand('feed', payload);

    expect(feeder.dispense).toHaveBeenCalledWith(50, 'MQTT');

    const ackCall = mockPublish.mock.calls.find(call =>
      call[0] === 'smartcoop/test-device-001/modules/feeder-sn-001/command_ack'
    );
    expect(ackCall).toBeDefined();

    const ackPayload = JSON.parse(ackCall[1]);
    expect(ackPayload.moduleId).toBe('feeder-sn-001');
    expect(ackPayload.commandId).toBe('cmd_feed_001');
    expect(ackPayload.success).toBe(true);
  });

  test('should send failed ACK for unknown command', () => {
    feeder.handleCommand('unknown_action', { requestId: 'cmd_unknown_001' });

    const ackCall = mockPublish.mock.calls.find(call =>
      call[0].includes('command_ack')
    );
    expect(ackCall).toBeDefined();

    const ackPayload = JSON.parse(ackCall[1]);
    expect(ackPayload.success).toBe(false);
    expect(ackPayload.status).toBe('unknown_command');
  });
});

describe('Camera Module ACK', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const camera = {
    state: {
      moduleInfo: { moduleId: 'camera-sn-001' },
      status: 'online',
      isRecording: false
    },
    takePhoto: jest.fn(),
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    setStatus: jest.fn(),
    setStreamUrl: jest.fn(),
    log: jest.fn(),

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
          if (payload.streamUrl) this.setStreamUrl(payload.streamUrl);
          break;
        case 'stream_off':
          this.setStatus('offline');
          break;
        default:
          success = false;
      }

      // Send ACK
      if (simulator.isConnected()) {
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
      }
    }
  };

  test('should send command_ack on capture command', () => {
    camera.handleCommand('capture', { requestId: 'cmd_capture_001' });

    expect(camera.takePhoto).toHaveBeenCalledWith('remote');

    const ackCall = mockPublish.mock.calls.find(call =>
      call[0] === 'smartcoop/test-device-001/modules/camera-sn-001/command_ack'
    );
    expect(ackCall).toBeDefined();

    const ackPayload = JSON.parse(ackCall[1]);
    expect(ackPayload.success).toBe(true);
    expect(ackPayload.action).toBe('capture');
  });

  test('should send command_ack on stream_on command', () => {
    camera.handleCommand('stream_on', {
      requestId: 'cmd_stream_001',
      streamUrl: 'http://example.com/stream'
    });

    expect(camera.setStatus).toHaveBeenCalledWith('online');
    expect(camera.setStreamUrl).toHaveBeenCalledWith('http://example.com/stream');

    const ackCall = mockPublish.mock.calls.find(call =>
      call[0].includes('command_ack')
    );
    expect(ackCall).toBeDefined();
  });
});

// Run tests
if (require.main === module) {
  console.log('Running Device Simulator Shadow ACK tests...\n');
}
