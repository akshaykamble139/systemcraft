let requestCount = 0;
let totalResponseTime = 0;
let serverCounts = {};

let activeServers = ['server1', 'server2'];
let serverStates = {
    'server1': 'active',
    'server2': 'active'
};
let nextServerId = 3;

let cacheHits = 0;
let cacheMisses = 0;
let cacheHitRate = 0.7;

const DEFAULT_SERVER_PROCESSING_TIME = 200;
const DEFAULT_DATABASE_LATENCY = 300;
const DEFAULT_CACHE_PROCESSING_TIME = 50;
const DEFAULT_LOAD_BALANCER_PROCESSING_TIME = 50;
const DEFAULT_NETWORK_LATENCY = 50;

let currentDbLatency = DEFAULT_DATABASE_LATENCY;
let currentServerProcessingTime = DEFAULT_SERVER_PROCESSING_TIME;
let currentCacheHitRate = cacheHitRate;

let componentProcessors = {};

let lastServerIndex = -1; // For Round Robin
let currentLbAlgorithm = 'random'; // Default algorithm

function initializeComponentProcessors() {
    componentProcessors = {
        'client': { isProcessing: false, queue: [], processTime: 0, currentlyProcessingRequest: null },
        'load-balancer': { isProcessing: false, queue: [], processTime: DEFAULT_LOAD_BALANCER_PROCESSING_TIME, currentlyProcessingRequest: null },
        'cache': { isProcessing: false, queue: [], processTime: DEFAULT_CACHE_PROCESSING_TIME, currentlyProcessingRequest: null },
        'database': { isProcessing: false, queue: [], processTime: DEFAULT_DATABASE_LATENCY, currentlyProcessingRequest: null },
    };
    activeServers.forEach(serverId => {
        componentProcessors[serverId] = { isProcessing: false, queue: [], processTime: currentServerProcessingTime, currentlyProcessingRequest: null };
    });
}

function processComponentQueue(componentName) {
    const processor = componentProcessors[componentName];

    if (componentName.startsWith('server') && serverStates[componentName] !== 'active') {
        positionComponentDots(componentName);
        return;
    }

    if (!processor || processor.isProcessing || processor.queue.length === 0) {
        positionComponentDots(componentName);
        return;
    }

    const request = processor.queue.shift();
    processor.isProcessing = true;
    processor.currentlyProcessingRequest = request;

    addLog(`[Request #${request.id}] Started processing at ${componentName}. Queue size: ${processor.queue.length}`);

    positionComponentDots(componentName);
    let actualProcessTime = processor.processTime;
    if (componentName.startsWith('server')) {
        actualProcessTime = currentServerProcessingTime;
    } else if (componentName === 'database') {
        actualProcessTime = currentDbLatency;
    } else if (componentName === 'cache') {
        actualProcessTime = DEFAULT_CACHE_PROCESSING_TIME;
    } else if (componentName === 'load-balancer') {
        actualProcessTime = DEFAULT_LOAD_BALANCER_PROCESSING_TIME;
    }

    setTimeout(() => {
        processor.isProcessing = false;
        processor.currentlyProcessingRequest = null;
        addLog(`[Request #${request.id}] Finished processing at ${componentName}.`);

        request.runNextStep();

        setTimeout(() => {
            positionComponentDots(componentName);
            processComponentQueue(componentName);

        }, DEFAULT_NETWORK_LATENCY / 2);

    }, actualProcessTime);
}

function addServer() {
    const serverGroup = document.querySelector('.server-group');
    const newServerId = `server${nextServerId++}`;
    const newServerDiv = document.createElement('div');
    newServerDiv.classList.add('component', newServerId);
    newServerDiv.textContent = `Server ${nextServerId - 1}`;
    newServerDiv.style.backgroundColor = getRandomColor();

    newServerDiv.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!newServerDiv.classList.contains('failed')) {
            showComponentDetails(newServerId);
        } else {
            addLog(`[System] Cannot show details for failed component ${newServerId}.`);
        }
    });

    serverGroup.appendChild(newServerDiv);

    activeServers.push(newServerId);
    serverStates[newServerId] = 'active';
    serverCounts[newServerId] = 0;

    componentProcessors[newServerId] = { isProcessing: false, queue: [], processTime: currentServerProcessingTime, currentlyProcessingRequest: null };

    addLog(`[System] Added ${newServerId}`);
    console.log("Active Servers:", activeServers);
    console.log("Server States:", serverStates);
}

function removeServer() {
    if (activeServers.length <= 1) {
        addLog("[System] Cannot remove server: At least one active server is required.");
        return;
    }

    let serverToRemoveId = null;
    for (let i = activeServers.length - 1; i >= 0; i--) {
        const serverId = activeServers[i];
        if (serverStates[serverId] === 'active') {
            serverToRemoveId = serverId;
            activeServers.splice(i, 1);
            break;
        }
    }

    if (serverToRemoveId) {
        const processor = componentProcessors[serverToRemoveId];
        if (processor) {
            if (processor.currentlyProcessingRequest) {
                addLog(`[System] Request #${processor.currentlyProcessingRequest.id} failed due to ${serverToRemoveId} removal.`);
                processor.currentlyProcessingRequest.failed = true;
                clearDot(processor.currentlyProcessingRequest.id);
                processor.currentlyProcessingRequest.finishRequest(true);
            }
            if (processor.queue.length > 0) {
                addLog(`[System] ${processor.queue.length} requests failed in ${serverToRemoveId}'s queue.`);
                processor.queue.forEach(req => {
                    req.failed = true;
                    clearDot(req.id);
                    req.finishRequest(true);
                });
            }

            processor.isProcessing = false;
            processor.queue = [];
            processor.currentlyProcessingRequest = null;
            delete componentProcessors[serverToRemoveId];
        }

        const serverToRemoveDiv = document.querySelector(`.${serverToRemoveId}`);
        if (serverToRemoveDiv) {
            serverToRemoveDiv.remove();
            addLog(`[System] Removed ${serverToRemoveId}`);
            delete serverStates[serverToRemoveId];
            delete serverCounts[serverToRemoveId];

            console.log("Active Servers:", activeServers);
            console.log("Server States:", serverStates);
        }
    } else {
        addLog("[System] No active servers available to remove.");
    }
}

function killServer(serverId) {
    if (serverStates[serverId] === 'active') {
        serverStates[serverId] = 'down';

        const activeIndex = activeServers.indexOf(serverId);
        if (activeIndex > -1) {
            activeServers.splice(activeIndex, 1);
        }

        const serverDiv = document.querySelector(`.${serverId}`);
        if (serverDiv) {
            serverDiv.classList.add('failed');
            serverDiv.textContent = `Server ${serverId.replace('server', '')} (DOWN)`;
        }
        addLog(`[System] ${serverId} failed!`);

        const processor = componentProcessors[serverId];
        if (processor) {
            if (processor.currentlyProcessingRequest) {
                addLog(`[System] Request #${processor.currentlyProcessingRequest.id} failed due to ${serverId} failure.`);
                processor.currentlyProcessingRequest.failed = true;
                clearDot(processor.currentlyProcessingRequest.id);
                processor.currentlyProcessingRequest.finishRequest(true);
            }
            if (processor.queue.length > 0) {
                addLog(`[System] ${processor.queue.length} requests failed in ${serverId}'s queue.`);
                processor.queue.forEach(req => {
                    req.failed = true;
                    clearDot(req.id);
                    req.finishRequest(true);
                });
            }
            processor.isProcessing = false;
            processor.queue = [];
            processor.currentlyProcessingRequest = null;
        }

        console.log("Active Servers after failure:", activeServers);
        console.log("Server States:", serverStates);
    } else {
        addLog(`[System] ${serverId} is already down or does not exist.`);
    }
}

function reviveServer(serverId) {
    if (serverStates[serverId] === 'down') {
        serverStates[serverId] = 'active';

        activeServers.push(serverId);
        activeServers.sort((a, b) => {
            const numA = parseInt(a.replace('server', ''), 10);
            const numB = parseInt(b.replace('server', ''), 10);
            return numA - numB;
        });

        const serverDiv = document.querySelector(`.${serverId}`);
        if (serverDiv) {
            serverDiv.classList.remove('failed');
            serverDiv.textContent = `Server ${serverId.replace('server', '')}`;
            serverDiv.style.backgroundColor = getRandomColor();
        }
        addLog(`[System] ${serverId} revived!`);

        if (!componentProcessors[serverId]) {
            componentProcessors[serverId] = { isProcessing: false, queue: [], processTime: currentServerProcessingTime, currentlyProcessingRequest: null };
        } else {
            componentProcessors[serverId].isProcessing = false;
            componentProcessors[serverId].queue = [];
            componentProcessors[serverId].processTime = currentServerProcessingTime;
            componentProcessors[serverId].currentlyProcessingRequest = null;
        }
        console.log("Active Servers after revival:", activeServers);
        console.log("Server States:", serverStates);
    } else {
        addLog(`[System] ${serverId} is already active or does not exist.`);
    }
}

function selectServer(algorithm) {
    if (activeServers.length === 0) {
        return null;
    }

    if (algorithm === 'random') {
        const randomIndex = Math.floor(Math.random() * activeServers.length);
        return activeServers[randomIndex];
    } else if (algorithm === 'round-robin') {
        lastServerIndex = (lastServerIndex + 1) % activeServers.length;
        return activeServers[lastServerIndex];
    }
    console.error("Unknown load balancer algorithm:", algorithm);
    return activeServers[0];
}

function addLog(message) {
    const logContainer = document.getElementById('logContainer');
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.textContent = `[${timestamp}] ${message}`;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function highlightComponent(componentClass) {
    const component = document.querySelector(`.${componentClass}`);
    if (component) {
        component.classList.add('highlight');
    }
}

function updateMetrics(responseTime) {
    requestCount++;
    totalResponseTime += responseTime;

    let successfulRequestCount = parseInt(document.getElementById('requestCount').textContent) + 1;

    const requestCountSpan = document.getElementById('requestCount');
    requestCountSpan.textContent = successfulRequestCount;

    const avgResponseTime = successfulRequestCount > 0 ? Math.round(totalResponseTime / successfulRequestCount) : 0;

    document.getElementById('avgResponseTime').textContent = avgResponseTime;

    document.getElementById('cacheHits').textContent = cacheHits;
    document.getElementById('cacheMisses').textContent = cacheMisses;
    const totalCacheChecks = cacheHits + cacheMisses;
    const currentHitRate = totalCacheChecks > 0 ? ((cacheHits / totalCacheChecks) * 100).toFixed(1) : 0;
    document.getElementById('cacheHitRate').textContent = `${currentHitRate}%`;
}

class Request {
    constructor(id) {
        this.id = id;
        this.startTime = Date.now();
        this.chosenServer = null;
        this.failed = false;
        this.hitCache = false;
        this.finished = false;

        if (activeServers.length === 0) {
            addLog(`[Request #${this.id}] Failed: No active servers available.`);
            this.finishRequest(true);
            return;
        }

        this.currentStep = 0;
        this.steps = [
            { component: 'client', message: 'Request sent from Client.' },
            { component: 'load-balancer', message: 'Load Balancer routing request...' },
            { component: 'client', message: 'Response returned to Client.' }
        ];

        createRequestDot(this.id);

        this.runNextStep();
    }

    runNextStep() {
        if (this.failed || this.currentStep >= this.steps.length) {
            this.finishRequest(this.failed);
            return;
        }

        const currentStepData = this.steps[this.currentStep];
        let { component, message } = currentStepData;

        if (this.currentComponent) {
            const prevComponent = document.querySelector(`.${this.currentComponent}`);
            if (prevComponent) {
                prevComponent.classList.remove('highlight');
            }
        }

        if (component.startsWith('server') && serverStates[component] !== 'active') {
            addLog(`[Request #${this.id}] Failed: Target server ${component} is down.`);
            this.failed = true;
            clearDot(this.id);
            this.finishRequest(true);
            return;
        }

        highlightComponent(component);
        this.currentComponent = component;

        addLog(`[Request #${this.id}] ${message}`);

        const networkDelayToComponent = DEFAULT_NETWORK_LATENCY;

        const isFinalClientStep = this.currentStep === this.steps.length - 1 && component === 'client';

        if (isFinalClientStep) {
            moveRequestDot(this.id, component, DEFAULT_NETWORK_LATENCY);
            setTimeout(() => {
                this.finishRequest(this.failed);
                clearDot(this.id);
            }, DEFAULT_NETWORK_LATENCY);
            return;
        }

        moveRequestDot(this.id, component, networkDelayToComponent);

        setTimeout(() => {
            const componentProcessor = componentProcessors[component];

            if (!componentProcessor) {
                console.error(`Processor not found for component: ${component}`);
                this.failed = true;
                clearDot(this.id);
                this.finishRequest(true);
                return;
            }

            if (component === 'load-balancer' && this.chosenServer === null) {
                this.chosenServer = selectServer(currentLbAlgorithm); // Use the new function

                if (this.chosenServer === null) {
                    addLog(`[Request #${this.id}] Failed: Load Balancer found no active servers.`);
                    this.failed = true;
                    clearDot(this.id);
                    this.finishRequest(true);
                    return;
                }

                const intermediateSteps = [
                    { component: this.chosenServer, message: `Request received by ${this.chosenServer}.` },
                    { component: 'cache', message: `[${this.chosenServer}] checking Cache.` },
                    { component: 'database', message: 'Cache MISS, querying Database.' },
                    { component: this.chosenServer, message: `Database returned data to ${this.chosenServer}.` },
                ];

                const finalClientStepIndex = this.steps.length - 1;
                this.steps.splice(finalClientStepIndex, 0, ...intermediateSteps);

                currentStepData.message = `Load Balancer routed to ${this.chosenServer}`;
            }
            else if (component === 'cache') {
                this.hitCache = Math.random() < cacheHitRate;
                if (this.hitCache) {
                    cacheHits++;
                    currentStepData.message = 'Cache HIT!';

                    const dbStepIndex = this.steps.findIndex((step, index) => index > this.currentStep && step.component === 'database');

                    if (dbStepIndex !== -1) {
                        const serverReturnDbIndex = this.steps.findIndex((step, index) => index > dbStepIndex && step.component === this.chosenServer && step.message.includes('Database returned data'));

                        if (serverReturnDbIndex !== -1) {
                            this.steps.splice(dbStepIndex, serverReturnDbIndex - dbStepIndex + 1);
                        } else {
                            this.steps.splice(dbStepIndex, 1);
                        }

                        const serverReturnCacheStep = {
                            component: this.chosenServer,
                            message: `${this.chosenServer} returning data from Cache.`,
                        };
                        this.steps.splice(this.currentStep + 1, 0, serverReturnCacheStep);
                    }

                } else {
                    cacheMisses++;
                    currentStepData.message = 'Cache MISS. Going to Database.';
                }
            }

            this.currentStep++;
            componentProcessor.queue.push(this);
            positionComponentDots(component);

            if (!componentProcessor.isProcessing) {
                processComponentQueue(component);
            }

        }, networkDelayToComponent);
    }

    finishRequest(failed = false) {
        if (this.finished) {
            return;
        }
        this.finished = true;

        const endTime = Date.now();
        const responseTime = endTime - this.startTime;

        if (!failed) {
            updateMetrics(responseTime);
            if (this.chosenServer && serverCounts[this.chosenServer] !== undefined) {
                serverCounts[this.chosenServer]++;
            }
            console.log(`[Request #${this.id}] Completed in ${responseTime}ms by ${this.chosenServer || 'N/A'} (Cache ${this.hitCache ? 'HIT' : 'MISS'})`);
        } else {
            console.log(`[Request #${this.id}] Failed after ${responseTime}ms`);
        }

        if (this.currentComponent) {
            const prevComponent = document.querySelector(`.${this.currentComponent}`);
            if (prevComponent) {
                prevComponent.classList.remove('highlight');
            }
        }
    }
}

let nextRequestId = 1;

document.getElementById('sendRequestBtn').addEventListener('click', () => {
    new Request(nextRequestId++);
});

document.getElementById('lbAlgorithmSelect').addEventListener('change', (event) => {
    currentLbAlgorithm = event.target.value;
    addLog(`[System] Load Balancer algorithm changed to: ${currentLbAlgorithm.replace('-', ' ').toUpperCase()}`);
});
document.getElementById('addServerBtn').addEventListener('click', addServer);
document.getElementById('removeServerBtn').addEventListener('click', removeServer);
document.getElementById('killRandomServerBtn').addEventListener('click', () => {
    const currentlyActive = Object.keys(serverStates).filter(serverId => serverStates[serverId] === 'active');
    if (currentlyActive.length > 0) {
        const randomServerId = currentlyActive[Math.floor(Math.random() * currentlyActive.length)];
        killServer(randomServerId);
    } else {
        addLog("[System] No active servers to kill.");
    }
});

document.getElementById('reviveRandomServerBtn').addEventListener('click', () => {
    const currentlyDown = Object.keys(serverStates).filter(serverId => serverStates[serverId] === 'down');
    if (currentlyDown.length > 0) {
        const randomServerId = currentlyDown[Math.floor(Math.random() * currentlyDown.length)];
        reviveServer(randomServerId);
    } else {
        addLog("[System] No servers are currently down.");
    }
});
document.getElementById('dbLatencyInput').addEventListener('change', (event) => {
    currentDbLatency = parseInt(event.target.value);
    if (componentProcessors['database']) {
        componentProcessors['database'].processTime = currentDbLatency;
    }
    addLog(`[System] Database latency set to ${currentDbLatency}ms.`);
});

document.getElementById('serverProcessingInput').addEventListener('change', (event) => {
    currentServerProcessingTime = parseInt(event.target.value);
    Object.keys(componentProcessors).forEach(compName => {
        if (compName.startsWith('server')) {
            componentProcessors[compName].processTime = currentServerProcessingTime;
        }
    });
    addLog(`[System] Server processing time set to ${currentServerProcessingTime}ms.`);
});

document.getElementById('cacheHitRateInput').addEventListener('change', (event) => {
    currentCacheHitRate = parseInt(event.target.value) / 100;
    cacheHitRate = currentCacheHitRate;
    addLog(`[System] Cache hit rate set to ${(currentCacheHitRate * 100).toFixed(0)}%.`);
});

document.getElementById('sendBatchBtn').addEventListener('click', () => {
    sendMultipleRequests(10);
});

function createRequestDot(id) {
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

        void dot.offsetWidth; // Force reflow

    } else {
        console.error("Client component not found! Cannot place request dot.");
        dot.remove();
    }
}

function moveRequestDot(id, componentName, duration) {
    const dot = document.getElementById(`request-dot-${id}`);
    const component = document.querySelector(`.${componentName}`);

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

function clearDot(id) {
    const dot = document.getElementById(`request-dot-${id}`);
    if (dot) {
        dot.remove();
    }
}

function positionComponentDots(componentName) {
    const processor = componentProcessors[componentName];
    if (!processor) return;

    const componentDiv = document.querySelector(`.${componentName}`);
    if (!componentDiv) {
        console.error(`Component div not found for ${componentName}`);
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

function getRandomColor() {
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#d35400', '#7f8c8d'];
    return colors[Math.floor(Math.random() * colors.length)];
}

initializeComponentProcessors();

activeServers.forEach(server => {
    serverCounts[server] = 0;
    serverStates[server] = 'active';
    const serverDiv = document.querySelector(`.${server}`);
    if (serverDiv) {
        serverDiv.style.backgroundColor = getRandomColor();
        serverDiv.addEventListener('click', (event) => {
            event.stopPropagation();
            if (!serverDiv.classList.contains('failed')) {
                showComponentDetails(server);
            } else {
                addLog(`[System] Cannot show details for failed component ${server}.`);
            }
        });
    }
});

document.querySelectorAll('.component:not(.server1):not(.server2)').forEach(componentDiv => {
    const componentClass = Array.from(componentDiv.classList).find(cls =>
        cls === 'client' || cls === 'load-balancer' || cls === 'cache' || cls === 'database'
    );
    if (componentClass) {
        componentDiv.addEventListener('click', (event) => {
            event.stopPropagation();
            if (!componentDiv.classList.contains('failed')) {
                showComponentDetails(componentClass);
            } else {
                addLog(`[System] Cannot show details for failed component ${componentClass}.`);
            }
        });
    }
});

document.getElementById('cacheHits').textContent = cacheHits;
document.getElementById('cacheMisses').textContent = cacheMisses;
document.getElementById('cacheHitRate').textContent = `${(cacheHitRate * 100).toFixed(1)}%`;

function sendMultipleRequests(count, interval = 100) {
    let sentCount = 0;
    const intervalId = setInterval(() => {
        if (sentCount < count) {
            new Request(nextRequestId++);
            sentCount++;
        } else {
            clearInterval(intervalId);
        }
    }, interval);
}

function showComponentDetails(componentName) {
    const modal = document.getElementById('componentDetailModal');
    const modalName = document.getElementById('modalComponentName');
    const modalDetails = document.getElementById('modalComponentDetails');

    modalName.textContent = componentName.replace('-', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') + " Details";

    let detailsHtml = '';
    const processor = componentProcessors[componentName];

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
        const state = serverStates[serverId] || 'unknown';
        const requestsHandled = serverCounts[serverId] !== undefined ? serverCounts[serverId] : 0;
        detailsHtml += `<p><strong>ID:</strong> ${serverId}</p>`;
        detailsHtml += `<p><strong>State:</strong> <span style="color: ${state === 'active' ? 'green' : 'red'};">${state.toUpperCase()}</span></p>`;
        detailsHtml += `<p><strong>Requests Handled:</strong> ${requestsHandled}</p>`;
        detailsHtml += `<p><strong>Simulated Process Time:</strong> ${currentServerProcessingTime}ms</p>`;

    } else if (componentName === 'cache') {
        detailsHtml += `<p><strong>Hits:</strong> ${cacheHits}</p>`;
        detailsHtml += `<p><strong>Misses:</strong> ${cacheMisses}</p>`;
        const total = cacheHits + cacheMisses;
        const hitRate = total > 0 ? ((cacheHits / total) * 100).toFixed(1) : 0;
        detailsHtml += `<p><strong>Hit Rate:</strong> ${hitRate}%</p>`;
        detailsHtml += `<p><strong>Configured Hit Rate:</strong> ${(currentCacheHitRate * 100).toFixed(0)}%</p>`;
    } else if (componentName === 'database') {
        detailsHtml += `<p><strong>Simulated Latency:</strong> ${currentDbLatency}ms</p>`;
    } else if (componentName === 'load-balancer') {
        detailsHtml += `<p><strong>Algorithm:</strong> ${currentLbAlgorithm.replace('-', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</p>`;
        detailsHtml += `<p><strong>Active Servers:</strong> ${activeServers.length}</p>`;
        if (currentLbAlgorithm === 'round-robin') {
            detailsHtml += `<p><strong>Last Used Index:</strong> ${lastServerIndex === -1 ? 'N/A' : lastServerIndex}</p>`;
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

const modal = document.getElementById('componentDetailModal');
const closeModalBtn = document.getElementById('closeModalBtn');

closeModalBtn.addEventListener('click', () => {
    modal.style.display = "none";
});

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.style.display = "none";
    }
});