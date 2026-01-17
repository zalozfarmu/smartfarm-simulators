# 🤖 ESP32 Device Simulator

Simulace fyzického SmartCoop ESP32 zařízení pro testování a vývoj.

## 🎯 Účel

Simuluje reálné ESP32 zařízení bez nutnosti fyzického hardware. Umožňuje testovat:
- MQTT komunikaci
- Senzory a aktuátory
- Reakce na příkazy
- Auto-publishing dat
- Network události

## ✨ Funkce

### 🌡️ **Senzory**
- **Teplota**: 15°C - 35°C (slidery + auto-generování)
- **Vlhkost**: 30% - 90% (slidery + auto-generování)
- **Světlo**: 0 - 1000 lux (slidery + auto-generování)
- Auto-mode: Generuje náhodné změny každých 5s

### 🚪 **Dveře**
- Stavy: closed, opening, open, closing
- Animace pohybu (0-100%)
- Reaguje na příkazy: open, close, stop, toggle
- Auto režim
- Publikuje status při každé změně

### 🐔 **Slepice**
- Počítání slepic uvnitř/venku
- RFID události (enter/exit)
- Auto-mode: Náhodné RFID události každých 15s
- Adjustable total count

### 📡 **Síť**
- WiFi: connect/disconnect, signal strength
- GSM: connect/disconnect, signal strength
- Simulace network stavů

### ⚙️ **Systém**
- Uptime tracker
- Free RAM simulation
- Firmware verze
- Auto heartbeat každých 10s
- Restart funkce

### 📝 **Event Log**
- Real-time log všech událostí
- Color-coded (info, success, warning, error)
- Max 50 eventů
- Clear function

## 🚀 Spuštění

```bash
cd device-simulator
python -m http.server 8003
```

Pak otevřete: http://localhost:8003

## 🔌 Připojení

### Výchozí nastavení:
```
Broker: ws://localhost:9001/mqtt
Device ID: 123
Username: device_123
Password: dev_abc123
```

### Kroky:
1. Nastavte MQTT credentials (z Management Console)
2. Klikněte "🔌 Připojit"
3. Simulátor automaticky:
   - Subscribe na `smartcoop/{deviceId}/commands`
   - Subscribe na `smartcoop/{deviceId}/system`
   - Subscribe na `smartcoop/{deviceId}/config`
   - Publikuje initial status všech modulů

## 📡 MQTT Topics

### Publikuje (OUT):
```
smartcoop/{deviceId}/status   # Status snapshot (sensors, door, chickens, network, heartbeat)
smartcoop/{deviceId}/response # Potvrzení příkazů (ACK)
```

**Struktura status payload:**
```json
{
  "doorStatus": "open|closed|opening|closing",
  "doorPosition": 0-100,
  "doorAutoMode": true|false,
  "environment": {
    "temperature": 22.5,
    "humidity": 65,
    "light": 450
  },
  "chickensInCoop": 5,
  "chickensOutside": 5,
  "totalChickens": 10,
  "wifiStatus": "connected|disconnected",
  "wifiSignal": -45,
  "gsmStatus": "connected|disabled",
  "gsmSignal": -70,
  "uptime": 3600,
  "freeRam": 234,
  "firmware": "v1.2.5",
  "timestamp": 1699632000000
}
```

Poznámka: Obecný topic `smartcoop/{deviceId}/events` se v simulátoru záměrně nepoužívá (aby nevznikaly duplicity a chaos). Pro události používej specifické topicy, např. `smartcoop/{deviceId}/modules/{moduleId}/rfid_scan`.

### Subscribe (IN):
```
smartcoop/{deviceId}/commands # Příkazy: { action: "open|close|stop|toggle" }
smartcoop/{deviceId}/system   # Systémové příkazy: { action: "get_status|restart|set_rtc" }
smartcoop/{deviceId}/config   # Konfigurace: { doorAutoMode: true|false }
```

## 🎮 Použití

### Manuální ovládání:
1. **Senzory**: Použijte slidery nebo zapněte auto-mode
2. **Dveře**: Klikněte na tlačítka open/close/stop
3. **Slepice**: Klikněte enter/exit nebo zapněte auto RFID
4. **Síť**: Simulujte WiFi/GSM připojení/odpojení

### Testování s Dashboard:
1. Spusťte Device Simulator (port 8003)
2. Připojte k MQTT
3. Spusťte User Dashboard (port 8002)
4. Připojte k MQTT se stejným Device ID
5. Dashboard pošle příkaz → Simulator reaguje
6. Simulator publikuje status → Dashboard zobrazí

## 🐛 Debug Funkce

V konzoli prohlížeče:

```javascript
// Zjistit aktuální stav
deviceSim.getStatus()

// Simulovat celý den (25s)
deviceSim.simulateDay()
// - Ráno: otevře dveře, slepice vycházejí
// - Poledne: některé se vrací
// - Odpoledne: zase vycházejí
// - Večer: všechny se vrací, dveře se zavřou
```

## 📊 Příklad Message Flow

### 1. Dashboard pošle příkaz:
```json
Topic: smartcoop/123/commands
Payload: {
  "action": "open",
  "requestId": "req_1699632000000",
  "timestamp": 1699632000000
}
```

### 2. Simulator přijme a reaguje:
```
- Spustí animaci otevírání
- Publikuje progress každých 100ms
```

### 3. Simulator publikuje status:
```json
Topic: smartcoop/123/status
Payload: {
  "doorStatus": "opening",
  "doorPosition": 45,
  "doorAutoMode": false,
  "timestamp": 1699632001000
}
```

### 4. Simulator pošle ACK:
```json
Topic: smartcoop/123/response
Payload: {
  "requestId": "req_1699632000000",
  "action": "open",
  "status": "success",
  "timestamp": 1699632001000
}
```

## 🔄 Auto Features

- **Senzory**: Náhodné změny každých 5s (když zapnuto)
- **RFID**: Náhodné události každých 15s (když zapnuto)
- **Heartbeat**: Každých 10s (když zapnuto)
- **Uptime**: Update každou sekundu

## 🎨 Visual Features

- **Door Visual**: Barevná animace (červená=closed, zelená=open)
- **Status Badges**: Color-coded (success, warning, danger)
- **Event Log**: Real-time s timestamps
- **Stats**: Velké čísla pro slepice

## 💡 Tips

1. **První start**: Vytvořte zařízení v Management Console
2. **Credentials**: Použijte username/password z Management Console
3. **Testing**: Použijte `deviceSim.simulateDay()` pro rychlý test
4. **Debug**: Sledujte Event Log pro všechny akce
5. **Multi-device**: Otevřete více tabů s různými Device ID

## 🔒 Poznámky

- Toto je development nástroj
- Data se nepersistují (refresh = reset)
- Pro produkční simulaci použijte backend API
- MQTT komunikace není šifrovaná (použijte WSS v produkci)

## 📄 Licence

MIT

