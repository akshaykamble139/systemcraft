// Combines UI handlers, utilities, main initialization, and event listeners.
import * as State from './state_config.js';
import { Request, initializeComponentProcessors, addServer, removeServer, killServer, reviveServer, slowDownServer, restoreServerSpeed } from './simulation.js';

export function addLog(message, type = 'info') {
    const logContainer = document.getElementById('logContainer');
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.classList.add(`log-${type}`);
    logEntry.textContent = `[${timestamp}] ${message}`;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

export function getRandomColor() {
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#d35400', '#7f8c8d'];
    return colors[Math.floor(Math.random() * colors.length)];
}


export function highlightComponent(componentClass) {
    const component = document.querySelector(`.${componentClass}:not(.hidden)`);
    if (component) {
        component.classList.add('highlight');
    }
}

export function updateMetrics(responseTime) {
    const requestCountSpan = document.getElementById('requestCount');
    requestCountSpan.textContent = State.requestCount;

    if (responseTime !== -1) {
        State.updateState({ totalResponseTime: State.totalResponseTime + responseTime });
    }

    const successfulRequests = State.requestCount - State.totalFailedRequests;
    const avgResponseTime = successfulRequests > 0 ? Math.round(State.totalResponseTime / successfulRequests) : 0;
    document.getElementById('avgResponseTime').textContent = avgResponseTime;

    document.getElementById('failedRequests').textContent = State.totalFailedRequests;
    const currentErrorRate = State.requestCount > 0 ? ((State.totalFailedRequests / State.requestCount) * 100).toFixed(1) : 0;
    document.getElementById('errorRate').textContent = `${currentErrorRate}%`;

    document.getElementById('cacheHits').textContent = State.cacheHits;
    document.getElementById('cacheMisses').textContent = State.cacheMisses;
    const totalCacheChecks = State.cacheHits + State.cacheMisses;
    const currentHitRate = totalCacheChecks > 0 ? ((State.cacheHits / totalCacheChecks) * 100).toFixed(1) : 0;
    document.getElementById('cacheHitRate').textContent = `${currentHitRate}%`;
}

export function createRequestDot(id) {
    const dot = document.createElement('div');
    dot.classList.add('request-dot');
    dot.id = `request-dot-${id}`;
    dot.style.backgroundColor = getRandomColor();
    document.getElementById('animationContainer').appendChild(dot);

    const clientComponent = document.querySelector('.client');
    if (clientComponent) {
        const rect = clientComponent.getBoundingClientRect();
        const containerRect = document.getElementById('animationContainer').getBoundingClientRect();

        dot.style.transition = 'none';
        dot.style.left = `${rect.left - containerRect.left + rect.width / 2}px`;
        dot.style.top = `${rect.top - containerRect.top + rect.height / 2}px`;
        void dot.offsetWidth;
    } else {
        console.error("Client component not found! Cannot place request dot.");
        dot.remove();
    }
}

export function moveRequestDot(id, componentName, duration) {
    const dot = document.getElementById(`request-dot-${id}`);
    const component = document.querySelector(`.${componentName}:not(.hidden)`); 

    if (!dot || !component) {
        console.warn(`Attempted to move dot ${id} to component .${componentName}, but one was not found. Removing dot.`);
        clearDot(id);
        return;
    }

    const rect = component.getBoundingClientRect();
    const containerRect = document.getElementById('animationContainer').getBoundingClientRect();

    const targetX = rect.left - containerRect.left + rect.width / 2;
    const targetY = rect.top - containerRect.top + rect.height / 2;

    dot.style.transition = `all ${duration / 1000}s linear`;
    dot.style.left = `${targetX}px`;
    dot.style.top = `${targetY}px`;
}

export function clearDot(id) {
    const dot = document.getElementById(`request-dot-${id}`);
    if (dot) {
        dot.remove();
    }
}

export function positionComponentDots(componentName) {
    const processor = State.componentProcessors[componentName];
    if (!processor) return;

    const componentDiv = document.querySelector(`.${componentName}`);
    if (!componentDiv) {
        // console.error(`Component div not found for ${componentName}`); // Reduce console noise if component is just inactive
        return;
    }

    const componentRect = componentDiv.getBoundingClientRect();
    const containerRect = document.getElementById('animationContainer').getBoundingClientRect();
    const baseX = componentRect.left - containerRect.left + componentRect.width / 2;
    const baseY = componentRect.top - containerRect.top + componentRect.height + 10;

    const dotSize = 10;
    const spacing = 5;
    const requestsToPosition = [];
    if (processor.currentlyProcessingRequest) {
        requestsToPosition.push(processor.currentlyProcessingRequest);
    }
    requestsToPosition.push(...processor.queue);

    const totalDots = requestsToPosition.length;
    const totalWidth = (totalDots * dotSize) + Math.max(0, (totalDots - 1) * spacing);
    let startX = baseX - totalWidth / 2;

    requestsToPosition.forEach((request, index) => {
        const dot = document.getElementById(`request-dot-${request.id}`);
        if (dot) {
            const targetX = startX + index * (dotSize + spacing);
            const targetY = baseY;

            dot.style.transition = `all 0.2s ease-out`;
            dot.style.left = `${targetX}px`;
            dot.style.top = `${targetY}px`;
        }
    });
}

export function showComponentDetails(componentName) {
    const modal = document.getElementById('componentDetailModal');
    const modalName = document.getElementById('modalComponentName');
    const modalDetails = document.getElementById('modalComponentDetails');

    modalName.textContent = componentName.replace('-', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') + " Details";

    let detailsHtml = '';
    const processor = State.componentProcessors[componentName];

    if (processor) {
        detailsHtml += `<p><strong>Current Queue:</strong> ${processor.queue.length}</p>`;
        detailsHtml += `<p><strong>Processing Now:</strong> ${processor.isProcessing ? 'Yes' : 'No'}</p>`;
        if (processor.currentlyProcessingRequest) {
            detailsHtml += `<p><strong>Processing Request ID:</strong> ${processor.currentlyProcessingRequest.id}</p>`;
        }
        detailsHtml += `<hr>`;
    }

    if (componentName.startsWith('server')) {
        const serverId = componentName;
        const state = State.serverStates[serverId] || 'unknown';
        const requestsHandled = State.serverCounts[serverId] !== undefined ? State.serverCounts[serverId] : 0;
        detailsHtml += `<p><strong>ID:</strong> ${serverId}</p>`;
        detailsHtml += `<p><strong>State:</strong> <span style="color: ${state === 'active' ? 'green' : 'red'};">${state.toUpperCase()}</span></p>`;
        detailsHtml += `<p><strong>Requests Handled:</strong> ${requestsHandled}</p>`;
        detailsHtml += `<p><strong>Simulated Process Time:</strong> ${State.currentServerProcessingTime}ms</p>`;

    } else if (componentName === 'cache') {
        detailsHtml += `<p><strong>Hits:</strong> ${State.cacheHits}</p>`;
        detailsHtml += `<p><strong>Misses:</strong> ${State.cacheMisses}</p>`;
        const total = State.cacheHits + State.cacheMisses;
        const hitRate = total > 0 ? ((State.cacheHits / total) * 100).toFixed(1) : 0;
        detailsHtml += `<p><strong>Hit Rate:</strong> ${hitRate}%</p>`;
        detailsHtml += `<p><strong>Configured Hit Rate:</strong> ${(State.currentCacheHitRate * 100).toFixed(0)}%</p>`;
    } else if (componentName === 'database') {
        detailsHtml += `<p><strong>Simulated Latency:</strong> ${State.currentDbLatency}ms</p>`;
    } else if (componentName === 'load-balancer') {
        detailsHtml += `<p><strong>Algorithm:</strong> ${State.currentLbAlgorithm.replace('-', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</p>`;
        detailsHtml += `<p><strong>Active Servers:</strong> ${State.activeServers.length}</p>`;
        if (State.currentLbAlgorithm === 'round-robin') {
            detailsHtml += `<p><strong>Last Used Index:</strong> ${State.lastServerIndex === -1 ? 'N/A' : State.lastServerIndex}</p>`;
        }
    } else if (componentName === 'client') {
        detailsHtml += `<p>This represents the user/browser.</p>`;
        detailsHtml += `<p>It initiates and receives requests.</p>`;
    } else {
        detailsHtml += `<p>No detailed information available for this component yet.</p>`;
    }

    modalDetails.innerHTML = detailsHtml;
    modal.style.display = "block";
}

function sendMultipleRequests(count, interval = 100, onComplete = null) {
    let sentCount = 0;
    const intervalId = setInterval(() => {
        if (sentCount < count) {
            let currentId = State.nextRequestId;
            State.updateState({ nextRequestId: currentId + 1 });
            new Request(currentId);
            sentCount++;
        } else {
            clearInterval(intervalId);
            if (onComplete) {
                onComplete();
            }
        }
    }, interval);
}

function validateInput(inputId, min, max, defaultValue) {
    const input = document.getElementById(inputId);
    const tooltip = input.nextElementSibling;
    
    let value = inputId === 'networkMultiplierInput' 
        ? parseFloat(input.value) 
        : parseInt(input.value);
    
    const isValid = !isNaN(value) && value >= min && value <= max;
    
    if (!isValid) {
        input.classList.add('input-error');
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';
        tooltip.style.animation = 'none';
        void tooltip.offsetWidth; // Trigger reflow
        tooltip.style.animation = 'fadeOut 0.5s ease 5s forwards';
        value = Math.min(max, Math.max(min, isNaN(value) ? defaultValue : value));
        input.value = value;
        return {value: value, isValid: false};
    }
    
    input.classList.remove('input-error');
    tooltip.style.display = 'none';
    return {value: value, isValid: true};
}

function initializeApp() {
    initializeComponentProcessors();

    document.getElementById('requestCount').textContent = State.requestCount;
    document.getElementById('avgResponseTime').textContent = '0';
    document.getElementById('cacheHits').textContent = State.cacheHits;
    document.getElementById('cacheMisses').textContent = State.cacheMisses;
    document.getElementById('cacheHitRate').textContent = `${(State.cacheHitRate * 100).toFixed(1)}%`;
    document.getElementById('dbLatencyInput').value = State.currentDbLatency;
    document.getElementById('serverProcessingInput').value = State.currentServerProcessingTime;
    document.getElementById('cacheHitRateInput').value = State.currentCacheHitRate * 100;
    document.getElementById('lbAlgorithmSelect').value = State.currentLbAlgorithm;


    const modal = document.getElementById('componentDetailModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            modal.style.display = "none";
        });
    }
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    });

    State.activeServers.forEach(server => {
        if (State.serverCounts[server] === undefined) {
            State.serverCounts[server] = 0;
        }
        const serverDiv = document.querySelector(`.${server}`);
        if (serverDiv) {
            serverDiv.style.backgroundColor = getRandomColor();
            serverDiv.addEventListener('click', (event) => {
                event.stopPropagation();
                if (!serverDiv.classList.contains('failed')) {
                    showComponentDetails(server);
                } else {
                    addLog(`[System] Cannot show details for failed component ${server}.`, "error");
                }
            });
        }
    });
    document.querySelectorAll('.component').forEach(componentDiv => {
        const componentClass = Array.from(componentDiv.classList).find(cls =>
            ['client', 'load-balancer', 'cache', 'database'].includes(cls)
        );
        if (componentClass) {
            componentDiv.addEventListener('click', (event) => {
                event.stopPropagation();
                showComponentDetails(componentClass);
            });
        }
    });

    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('input', function() {
            const tooltip = this.nextElementSibling;
            if (tooltip && tooltip.classList.contains('input-tooltip')) {
                const min = parseFloat(this.min);
                const max = parseFloat(this.max);
                const value = parseFloat(this.value);
                
                if (!isNaN(value) && value >= min && value <= max) {
                    this.classList.remove('input-error');
                    tooltip.style.display = 'none';
                } else {
                    this.classList.add('input-error');
                    tooltip.style.display = 'block';
                    tooltip.style.opacity = '1';
                    tooltip.style.animation = 'none';
                    void tooltip.offsetWidth;
                    tooltip.style.animation = 'fadeOut 0.5s ease 5s forwards';
                }
            }
        });
    });

    document.getElementById('stressRequestCount').addEventListener('change', () => {
        validateInput('stressRequestCount', 10, 1000, 100);
    });
    
    document.getElementById('dbLatencyInput').addEventListener('change', () => {
        const validation = validateInput('dbLatencyInput', 50, 2000, 300);
        State.updateState({ currentDbLatency: validation.value });
        if (State.componentProcessors['database']) {
            State.componentProcessors['database'].processTime = validation.value;
        }
    });
    
    document.getElementById('serverProcessingInput').addEventListener('change', () => {
        const validation = validateInput('serverProcessingInput', 20, 1000, 200);
        State.updateState({ currentServerProcessingTime: validation.value });
        Object.keys(State.componentProcessors).forEach(compName => {
            if (compName.startsWith('server')) {
                State.componentProcessors[compName].processTime = validation.value;
            }
        });
    });
    
    document.getElementById('cacheHitRateInput').addEventListener('change', () => {
        const validation = validateInput('cacheHitRateInput', 0, 100, 70);
        const rate = validation.value / 100;
        State.updateState({ currentCacheHitRate: rate, cacheHitRate: rate });
    });
    
    document.getElementById('networkMultiplierInput').addEventListener('change', () => {
        const validation = validateInput('networkMultiplierInput', 1, 10, 1.0);
        State.updateState({ networkLatencyMultiplier_ServerDB: validation.value });
    });    

    document.getElementById('sendRequestBtn').addEventListener('click', () => {
        let currentId = State.nextRequestId;
        State.updateState({ nextRequestId: currentId + 1 });
        new Request(currentId);
    });

    document.getElementById('sendBatchBtn').addEventListener('click', () => {
        sendMultipleRequests(10);
    });

    document.getElementById('startStressTestBtn').addEventListener('click', () => {
        const stressBtn = document.getElementById('startStressTestBtn');
        const validation = validateInput('stressRequestCount', 10, 1000, 100);
        
        if (validation.isValid) {
            const count = validation.value;
            const interval = 10;
            
            if (count > 0 && !stressBtn.disabled) {
                addLog(`[System] Starting Stress Test: ${count} requests...`);
                stressBtn.disabled = true;
                sendMultipleRequests(count, interval, () => {
                    addLog(`[System] Stress Test Finished.`);
                    stressBtn.disabled = false;
                });
            }
        }
    });

    document.getElementById('lbAlgorithmSelect').addEventListener('change', (event) => {
        const newAlgo = event.target.value;
        State.updateState({ currentLbAlgorithm: newAlgo });
        addLog(`[System] Load Balancer algorithm changed to: ${newAlgo.replace('-', ' ').toUpperCase()}`);
    });

    document.getElementById('addServerBtn').addEventListener('click', addServer);
    document.getElementById('removeServerBtn').addEventListener('click', removeServer);

    document.getElementById('killRandomServerBtn').addEventListener('click', () => {
        const currentlyActive = Object.keys(State.serverStates).filter(serverId => State.serverStates[serverId] === 'active');
        if (currentlyActive.length > 0) {
            const randomServerId = currentlyActive[Math.floor(Math.random() * currentlyActive.length)];
            killServer(randomServerId);
        } else {
            addLog("[System] No active servers to kill.", "warning");
        }
    });

    document.getElementById('reviveRandomServerBtn').addEventListener('click', () => {
        const currentlyDown = Object.keys(State.serverStates).filter(serverId => State.serverStates[serverId] === 'down');
        if (currentlyDown.length > 0) {
            const randomServerId = currentlyDown[Math.floor(Math.random() * currentlyDown.length)];
            reviveServer(randomServerId);
        } else {
            addLog("[System] No servers are currently down.", "warning");
        }
    });

    document.getElementById('dbLatencyInput').addEventListener('change', (event) => {
        const newLatency = parseInt(event.target.value);
        State.updateState({ currentDbLatency: newLatency });
        if (State.componentProcessors['database']) {
            State.componentProcessors['database'].processTime = newLatency;
        }
        addLog(`[System] Database latency set to ${newLatency}ms.`);
    });

    document.getElementById('serverProcessingInput').addEventListener('change', (event) => {
        const newTime = parseInt(event.target.value);
        State.updateState({ currentServerProcessingTime: newTime });
        Object.keys(State.componentProcessors).forEach(compName => {
            if (compName.startsWith('server')) {
                State.componentProcessors[compName].processTime = newTime;
            }
        });
        addLog(`[System] Server processing time set to ${newTime}ms.`);
    });

    document.getElementById('cacheHitRateInput').addEventListener('change', (event) => {
        const newRate = parseInt(event.target.value) / 100;
        State.updateState({ currentCacheHitRate: newRate, cacheHitRate: newRate });
        addLog(`[System] Cache hit rate set to ${(newRate * 100).toFixed(0)}%.`);
    });

    document.getElementById('networkMultiplierInput').addEventListener('change', (event) => {
        const newMultiplier = parseFloat(event.target.value);
        State.updateState({ networkLatencyMultiplier_ServerDB: newMultiplier });
        // Update DB processor's base time immediately if needed, or rely on next processing tick
        if (State.componentProcessors['database']) {
            // This update is slightly redundant if processComponentQueue always recalculates,
            // but might be useful conceptually or if base time was cached.
            // Keeping it simple by letting processComponentQueue handle the multiplication.
        }
        addLog(`[System] Server<->DB network multiplier set to ${newMultiplier.toFixed(1)}x.`);
    });

    document.getElementById('slowServerBtn').addEventListener('click', () => {
        const activeAndNotSlowServers = State.activeServers.filter(id =>
            State.serverStates[id] === 'active' &&
            (State.serverProcessingTimeMultipliers[id] || 1.0) === 1.0
        );
        if (activeAndNotSlowServers.length > 0) {
            const randomServerId = activeAndNotSlowServers[Math.floor(Math.random() * activeAndNotSlowServers.length)];
            slowDownServer(randomServerId); // Call the function from simulation.js
        } else {
            addLog("[System] No active servers available to slow down (or all are already slowed).", "warning");
        }
    });

    document.getElementById('restoreServerBtn').addEventListener('click', () => {
        const slowedDownServers = Object.keys(State.serverProcessingTimeMultipliers).filter(id =>
            State.serverStates[id] === 'active' && // Ensure it's active
            State.serverProcessingTimeMultipliers[id] > 1.0
        );
        if (slowedDownServers.length > 0) {
            const randomServerId = slowedDownServers[Math.floor(Math.random() * slowedDownServers.length)];
            restoreServerSpeed(randomServerId); // Call the function from simulation.js
        } else {
            addLog("[System] No slowed down servers to restore.", "warning");
        }
    });

    if (State.activeServers.length <= 1) {
        document.querySelector('.load-balancer').classList.add('hidden');
        document.querySelector('.lb-to-servers').classList.add('hidden');
        document.querySelector('.client-to-server').classList.remove('hidden');
    }

    addLog("[System] Application Initialized.");
    console.log("Initial Active Servers:", State.activeServers);
    console.log("Initial Server States:", State.serverStates);
    console.log("Initial Component Processors:", State.componentProcessors);
}

initializeApp();