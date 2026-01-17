/**
 * Event Logger
 */

const logger = {
    log(message, type = 'info') {
        const logDiv = document.getElementById('eventLog');
        const time = new Date().toLocaleTimeString();
        
        const eventDiv = document.createElement('div');
        eventDiv.className = `event-item event-${type}`;
        eventDiv.innerHTML = `
            <span class="event-time">${time}</span>
            <span class="event-text">${message}</span>
        `;
        
        logDiv.insertBefore(eventDiv, logDiv.firstChild);
        
        // Keep only last 50 events
        while (logDiv.children.length > 50) {
            logDiv.removeChild(logDiv.lastChild);
        }
    },

    clear() {
        const logDiv = document.getElementById('eventLog');
        logDiv.innerHTML = `
            <div class="event-item event-info">
                <span class="event-time">--:--:--</span>
                <span class="event-text">Log vymazán</span>
            </div>
        `;
    }
};

