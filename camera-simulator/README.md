# 📹 ESP32-CAM Simulator

Samostatný simulátor kamery pro SmartFarm projekt. Simuluje ESP32-CAM modul s vlastním WiFi připojením a MQTT komunikací.

## 🎯 Účel

Tento simulátor reprezentuje **samostatný kamerový modul**, který:
- Má vlastní WiFi připojení
- Komunikuje přímo s MQTT brokerem
- Není závislý na hlavním ESP32 zařízení
- Může fungovat nezávisle nebo v kombinaci s device-simulator

## 🏗️ Architektura

```
Camera (ESP32-CAM)
    ↓ WiFi
    ↓ MQTT
MQTT Broker (Mosquitto)
    ↓
Backend Server
    ↓
Frontend App
```

### Topic struktura

**Publish (Kamera → Server):**
- `smartcoop/camera/{cameraId}/status` - Status kamery
- `smartcoop/camera/{cameraId}/snapshot` - Nový snímek
- `smartcoop/camera/{cameraId}/stream` - Stream status

**Subscribe (Server → Kamera):**
- `smartcoop/camera/{cameraId}/command` - Příkazy (capture, record, etc.)
- `smartcoop/camera/{cameraId}/config` - Konfigurace

## 🚀 Spuštění

### 1. Spustit MQTT broker
```bash
# V hlavní složce smartfarm
docker-compose up mosquitto
```

### 2. Spustit backend
```bash
cd backend
npm run dev
```

### 3. Otevřít camera-simulator
```
http://localhost:5500/camera-simulator/index.html
```

### 4. Připojit kameru
1. Vyplnit Camera ID (např. `cam_001`)
2. Vyplnit MQTT credentials
3. Kliknout na "Připojit"

## 📸 Funkce

### Základní ovládání
- **Vyfotit** - Pořízení fotografie
- **Nahrávat** - Spuštění nahrávání videa
- **Zastavit** - Ukončení nahrávání

### Nastavení
- **Rozlišení** - 320x240 až 1920x1080
- **Kvalita JPEG** - 10-100%
- **Auto-capture** - Automatické pořizování fotek každých 5 minut
- **Detekce pohybu** - Simulace detekce pohybu

### Galerie
- Zobrazení pořízených snímků
- Filtry: Vše / Fotky / Videa
- Náhled v modalu
- Stažení snímku
- Nahrání na server
- Smazání snímku

### Status
- Baterie
- Síla WiFi signálu
- Využití úložiště
- Teplota CPU
- Využití paměti

## 🔧 Technické detaily

### Simulace kamery
- Canvas API pro generování živého náhledu
- Animovaný gradient simulující video feed
- Timestamp a info overlay
- Simulace šumu pro realističnost

### MQTT komunikace
- Automatické připojení k brokeru
- Publikování statusu každých 30 sekund
- Zpracování příkazů ze serveru
- QoS 1 pro spolehlivost

### Ukládání snímků
- Base64 encoding pro fotky
- Thumbnail generování
- Odhad velikosti souboru
- Lokální galerie v paměti

## 📡 Integrace s device-simulator

### Scénář 1: Nezávislá kamera
Kamera funguje samostatně, posílá data přímo na server.

### Scénář 2: Lokální komunikace
Kamera může poslat fotku na ESP32 zařízení:
```javascript
// Kamera publikuje
smartcoop/camera/cam_001/snapshot

// Device-simulator může subscribe a zobrazit
```

## 🎨 UI Komponenty

- **Connection Panel** - MQTT připojení
- **Camera Preview** - Živý náhled s Canvas
- **Settings** - Konfigurace kamery
- **Gallery** - Galerie snímků s filtry
- **Status** - Diagnostické informace
- **Event Log** - Historie událostí

## 🔐 Bezpečnost

- MQTT autentizace (username/password)
- Topic ACL pravidla na brokeru
- Validace příkazů
- Omezení velikosti snímků

## 📝 Příklady MQTT zpráv

### Status
```json
{
  "cameraId": "cam_001",
  "type": "camera",
  "status": "online",
  "battery": 85,
  "signal": -45,
  "resolution": "1920x1080",
  "quality": 90,
  "storage": {
    "used": 1200,
    "total": 4096
  },
  "temperature": 42,
  "memory": 45,
  "timestamp": "2025-11-26T13:30:00Z"
}
```

### Snapshot
```json
{
  "cameraId": "cam_001",
  "snapshotId": "photo_1732627800000",
  "timestamp": "2025-11-26T13:30:00Z",
  "type": "photo",
  "size": 245678,
  "resolution": "1920x1080",
  "thumbnail": "data:image/jpeg;base64,..."
}
```

### Command
```json
{
  "action": "capture",
  "params": {
    "resolution": "1920x1080",
    "quality": 90
  }
}
```

## 🛠️ Vývoj

### Struktura souborů
```
camera-simulator/
├── index.html              # Hlavní HTML
├── css/
│   └── styles.css          # Styly
├── js/
│   ├── logger.js           # Event logging
│   ├── mqtt-client.js      # MQTT komunikace
│   ├── image-capture.js    # Canvas simulace
│   ├── camera-device.js    # Hlavní logika
│   └── app.js              # Inicializace
└── README.md               # Tato dokumentace
```

### Přidání nové funkce
1. Upravit `camera-device.js` pro novou funkcionalitu
2. Přidat UI prvky do `index.html`
3. Přidat styly do `styles.css`
4. Aktualizovat MQTT handlery v `mqtt-client.js`

## 🐛 Debugging

### MQTT připojení
- Zkontrolovat broker URL v server-selector
- Ověřit credentials
- Zkontrolovat ACL pravidla v Mosquitto

### Canvas simulace
- Otevřít Developer Tools → Console
- Zkontrolovat chyby Canvas API
- Ověřit podporu prohlížeče

### Galerie
- Zkontrolovat localStorage limity
- Ověřit base64 encoding
- Kontrola velikosti snímků

## 📚 Další informace

- [MQTT.js Documentation](https://github.com/mqttjs/MQTT.js)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [ESP32-CAM Datasheet](https://www.espressif.com/en/products/socs/esp32)

## 🔄 Budoucí vylepšení

- [ ] WebRTC live streaming
- [ ] Motion detection algoritmus
- [ ] Face detection
- [ ] Cloud storage integrace
- [ ] Multi-camera view
- [ ] Time-lapse generování
- [ ] HTTP endpoint pro lokální komunikaci
- [ ] WebSocket stream
