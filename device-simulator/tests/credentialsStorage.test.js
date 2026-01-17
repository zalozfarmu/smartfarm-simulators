const sampleCredentials = {
  broker: 'mqtt://localhost:1883',
  brokerWs: 'ws://localhost:9001/mqtt',
  username: 'device_coop-sn-001',
  password: 'secret',
  topics: ['device/coop-sn-001']
};

describe('CredentialsStorage', () => {
  let CredentialsStorage;

  const loadModule = () => {
    jest.resetModules();
    global.logger = { log: jest.fn() };
    CredentialsStorage = require('../js/credentials.js');
  };

  beforeEach(() => {
    localStorage.clear();
    loadModule();
  });

  it('saves credentials per device and keeps last used entry', () => {
    CredentialsStorage.save('coop-sn-001', sampleCredentials);

    const multiRaw = localStorage.getItem(CredentialsStorage.STORAGE_KEY_MULTI);
    const multi = JSON.parse(multiRaw);
    expect(Object.keys(multi)).toContain('coop-sn-001');
    expect(multi['coop-sn-001'].mqtt.username).toBe('device_coop-sn-001');

    const singleRaw = localStorage.getItem(CredentialsStorage.STORAGE_KEY);
    expect(JSON.parse(singleRaw).deviceId).toBe('coop-sn-001');
  });

  it('loads all credentials and migrates legacy single-device format', () => {
    const legacyEntry = { deviceId: 'coop-sn-legacy', mqtt: sampleCredentials };
    localStorage.setItem(CredentialsStorage.STORAGE_KEY, JSON.stringify(legacyEntry));
    const all = CredentialsStorage.loadAll();
    expect(all['coop-sn-legacy']).toBeDefined();
    expect(CredentialsStorage.hasCredentials('coop-sn-legacy')).toBe(true);
  });

  it('clears credentials for specific device and keeps others intact', () => {
    CredentialsStorage.save('coop-sn-001', sampleCredentials);
    CredentialsStorage.save('coop-sn-002', { ...sampleCredentials, username: 'device_coop-sn-002' });

    CredentialsStorage.clear('coop-sn-001');
    const ids = CredentialsStorage.getAllDeviceIds();
    expect(ids).toEqual(['coop-sn-002']);
    expect(CredentialsStorage.load('coop-sn-001')).toBeNull();
    expect(CredentialsStorage.load('coop-sn-002')).not.toBeNull();
  });
});
