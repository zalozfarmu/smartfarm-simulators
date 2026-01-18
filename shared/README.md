# 🌐 Shared Components

Sdílené komponenty a konfigurace pro všechny MQTT aplikace.

## 📁 Obsah

### `config.js`
Centrální konfigurace server profilů pro všechny MQTT aplikace.

#### Dostupné profily:

1. **`local`** - Lokální Docker (development)
   - MQTT: `ws://localhost:9001/mqtt`
   - API: `http://localhost:5555`
   - RabbitMQ Management: `http://localhost:15672`

2. **`production`** - Produkční server
   - MQTT: `ws://<vps-host>:9001/mqtt`
   - API: `http://<vps-host>:5555`

3. **`custom`** - Vlastní nastavení
   - Uživatel může zadat vlastní MQTT broker, API a credentials

#### API:

```javascript
// Získat aktivní profil
const profileName = ServerConfig.getActiveProfile(); // 'local' | 'production' | 'custom'

// Nastavit aktivní profil
ServerConfig.setActiveProfile('production');

// Získat konfiguraci aktivního profilu
const config = ServerConfig.getConfig();
// {
//   name: '🐋 Lokální Docker',
//   mqtt: { host: 'localhost', port: 9001, url: 'ws://localhost:9001/mqtt', ... },
//   api: { url: 'http://localhost:5555' },
//   credentials: { mqtt: { user: '...', password: '...' }, ... }
// }

// Získat všechny profily
const profiles = ServerConfig.getAllProfiles();
// [{ key: 'local', name: '🐋 Lokální Docker' }, ...]

// Uložit custom konfiguraci
ServerConfig.saveCustomConfig({
  mqtt: { url: 'ws://my-server:9001/mqtt', ... },
  credentials: { mqtt: { user: 'myuser', password: 'mypass' } }
});
```

### `server-selector.js`
Reusable UI komponenta pro výběr serveru.

#### Použití:

```javascript
// Inicializace
const serverSelector = new ServerSelector({
  containerId: 'serverSelector',  // ID elementu kam se vykreslí
  showCredentials: true,           // Zobrazit credentials? (default: true)
  onChange: (config) => {          // Callback při změně profilu
    console.log('Profile changed:', config);
  }
});

// Získat aktuální konfiguraci
const config = serverSelector.getConfig();
```

#### HTML:

```html
<div id="serverSelector"></div>
<script src="../shared/config.js"></script>
<script src="../shared/server-selector.js"></script>
```

### `server-selector.css`
Styly pro server selector komponentu.

```html
<link rel="stylesheet" href="../shared/server-selector.css">
```

## 🎯 Použití v aplikacích

### Device Simulator (port 8003)

```javascript
// js/app.js
let serverSelector = new ServerSelector({
  containerId: 'serverSelector',
  onChange: (config) => {
    updateConnectionFields(config);
  }
});

// js/simulator.js - connect()
const config = ServerConfig.getConfig();
const brokerUrl = config.mqtt.url;
```

### User Dashboard (port 8002)

```javascript
// js/app.js
let serverSelector = new ServerSelector({
  containerId: 'serverSelector',
  showCredentials: false, // Neukázat credentials běžným uživatelům
  onChange: (config) => {
    // Odpojit při změně profilu
    if (mqttClient.isConnected()) {
      mqttClient.disconnect();
    }
  }
});

// js/mqttClient.js - connect()
const config = ServerConfig.getConfig();
const brokerUrl = config.mqtt.url;
const username = config.credentials.mqtt.user;
const password = config.credentials.mqtt.password;
```

### Management Console (port 8001)

```javascript
// js/app.js
let serverSelector = new ServerSelector({
  containerId: 'serverSelector',
  showCredentials: true, // Admins vidí credentials
  onChange: (config) => {
    displayServerInfo(config);
  }
});
```

## 💾 Persistence

- **Aktivní profil**: Uložen v `localStorage` jako `mqtt_server_profile`
- **Custom config**: Uložena v `localStorage` jako `mqtt_custom_config`

Při změně profilu nebo custom config se automaticky aktualizuje v `localStorage`.

## 🔒 Credentials

### Lokální Docker (default):

```
MQTT:
  User: sf_mqtt_user
  Pass: your_strong_mqtt_password

Demo Device:
  User: device_123
  Pass: dev_abc123
  Coop ID: 123

RabbitMQ:
  User: sf_rabbitmq_user
  Pass: your_strong_rabbitmq_password
  Management: http://localhost:15672
```

### Produkční Server:

Používá stejné credentials jako lokální Docker (změňte v `config.js` pro produkci).

## 🚀 Quick Start

1. **Vyberte profil** v Server Selector UI
2. **Připojte se** k MQTT brokeru
3. **Přepněte profil** kdykoliv (automaticky se odpojí a vyžádá nové připojení)

## 🧪 Testing

```javascript
// V browser console:
console.log('Active profile:', ServerConfig.getActiveProfile());
console.log('Config:', ServerConfig.getConfig());

// Změnit profil programmatically
ServerConfig.setActiveProfile('production');

// Získat profil objekt
console.log('Local profile:', ServerProfiles.local);
```

## 📝 Poznámky

- **Web aplikace**: Všechny 3 MQTT aplikace (Management Console, User Dashboard, Device Simulator) používají WebSocket port **9001**
- **Backend/ESP32**: Používají nativní MQTT port **1883**
- **Bezpečnost**: V produkci použijte `wss://` (WebSocket Secure) místo `ws://`
- **Custom profil**: Uživatel si může vytvořit vlastní profil s vlastním brokerem a credentials

## 🔄 Workflow

1. **Development**: Použijte `local` profil → připojení k Docker kontejneru
2. **Testing**: Použijte `production` profil → připojení k produkčnímu serveru
3. **Custom**: Vlastní broker pro speciální případy

## 📚 Related Files

- `C:\zalozFarmu\smartfarm\mqtt-management/` - Management Console
- `C:\zalozFarmu\smartfarm\mqtt-dashboard/` - User Dashboard
- `C:\zalozFarmu\smartfarm\device-simulator/` - Device Simulator
- `C:\zalozFarmu\smartfarm\README_MQTT_APPS.md` - Přehled všech aplikací

