/**
 * Logger utility for camera simulator
 */

const logger = {
    maxEntries: 100,

    log(message, level = 'info') {
        const logContainer = document.getElementById('eventLog');
        if (!logContainer) return;

        const time = new Date().toLocaleTimeString('cs-CZ');
        const entry = document.createElement('div');
        entry.className = `event-item event-${level}`;
        entry.innerHTML = `
            <span class="event-time">${time}</span>
            <span class="event-text">${message}</span>
        `;

        // Remove first entry if too many
        if (logContainer.children.length >= this.maxEntries) {
            logContainer.removeChild(logContainer.firstChild);
        }

        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;

        // Also log to console
        console.log(`[${time}] ${message}`);
    },

    clear() {
        const logContainer = document.getElementById('eventLog');
        if (logContainer) {
            logContainer.innerHTML = `
                <div class="event-item event-info">
                    <span class="event-time">--:--:--</span>
                    <span class="event-text">Log vymazán</span>
                </div>
            `;
        }
    }
};
