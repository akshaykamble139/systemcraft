// Contains core simulation logic (processing, Request class) and server management.
import * as State from './state_config.js';
import { addLog, clearDot, getRandomColor, showComponentDetails, updateMetrics, positionComponentDots, highlightComponent, createRequestDot, moveRequestDot } from './main.js';

export function initializeComponentProcessors() {
    let processors = {
        'client': { isProcessing: false, queue: [], processTime: 0, currentlyProcessingRequest: null },
        'load-balancer': { isProcessing: false, queue: [], processTime: State.DEFAULT_LOAD_BALANCER_PROCESSING_TIME, currentlyProcessingRequest: null },
        'cache': { isProcessing: false, queue: [], processTime: State.DEFAULT_CACHE_PROCESSING_TIME, currentlyProcessingRequest: null },
        'database': { isProcessing: false, queue: [], processTime: State.currentDbLatency, currentlyProcessingRequest: null },
    };
    State.activeServers.forEach(serverId => {
        processors[serverId] = { isProcessing: false, queue: [], processTime: State.currentServerProcessingTime, currentlyProcessingRequest: null };
    });
    State.updateState({ componentProcessors: processors });
}

export function processComponentQueue(componentName) {
    const processor = State.componentProcessors[componentName];

    if (componentName.startsWith('server') && State.serverStates[componentName] !== 'active') {
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
        const multiplier = State.serverProcessingTimeMultipliers[componentName] || 1.0;
        actualProcessTime = State.currentServerProcessingTime * multiplier;
    } else if (componentName === 'database') {
        actualProcessTime = State.currentDbLatency * State.networkLatencyMultiplier_ServerDB;
    } else if (componentName === 'cache') {
        actualProcessTime = State.DEFAULT_CACHE_PROCESSING_TIME;
    } else if (componentName === 'load-balancer') {
        actualProcessTime = State.DEFAULT_LOAD_BALANCER_PROCESSING_TIME;
    }

    setTimeout(() => {
        processor.isProcessing = false;
        processor.currentlyProcessingRequest = null;
        addLog(`[Request #${request.id}] Finished processing at ${componentName}.`);

        request.runNextStep();

        setTimeout(() => {
            positionComponentDots(componentName);
            processComponentQueue(componentName);
        }, State.DEFAULT_NETWORK_LATENCY / 2);

    }, actualProcessTime);
}

export function selectServer(algorithm) {
    if (State.activeServers.length === 0) {
        return null;
    }

    if (algorithm === 'random') {
        const randomIndex = Math.floor(Math.random() * State.activeServers.length);
        return State.activeServers[randomIndex];
    } else if (algorithm === 'round-robin') {
        const newIndex = (State.lastServerIndex + 1) % State.activeServers.length;
        State.updateState({ lastServerIndex: newIndex });
        return State.activeServers[newIndex];
    }
    console.error("Unknown load balancer algorithm:", algorithm);
    return State.activeServers[0];
}

export class Request {
    constructor(id) {
        this.id = id;
        this.startTime = Date.now();
        this.chosenServer = null;
        this.failed = false;
        this.hitCache = false;
        this.finished = false;
        this.currentComponent = null;


        if (State.activeServers.length === 0) {
            addLog(`[Request #${this.id}] Failed: No active servers available.`, "error");
            this.finishRequest(true);
            return;
        }

        this.currentStep = 0;

        this.steps = State.activeServers.length > 1
            ? [
                { component: 'client', message: 'Request sent from Client.' },
                { component: 'load-balancer', message: 'Load Balancer routing request...' },
                { component: 'client', message: 'Response returned to Client.' }
            ]
            : [
                { component: 'client', message: 'Request sent from Client.' },
                { component: State.activeServers[0], message: `Request received by ${State.activeServers[0]}.` },
                { component: 'cache', message: `[${State.activeServers[0]}] checking Cache.` },
                { component: 'database', message: 'Cache MISS, querying Database.' },
                { component: State.activeServers[0], message: `Database returned data to ${State.activeServers[0]}.` },
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

        if (component.startsWith('server') && State.serverStates[component] !== 'active') {
            addLog(`[Request #${this.id}] Failed: Target server ${component} is down.`);
            this.failed = true;
            clearDot(this.id);
            this.finishRequest(true);
            return;
        }

        if (State.activeServers.length === 1) {
            this.chosenServer = State.activeServers[0];
        }
        highlightComponent(component);
        this.currentComponent = component;

        addLog(`[Request #${this.id}] ${message}`);

        const networkDelayToComponent = State.DEFAULT_NETWORK_LATENCY;

        const isFinalClientStep = this.currentStep === this.steps.length - 1 && component === 'client';

        if (isFinalClientStep) {
            moveRequestDot(this.id, component, State.DEFAULT_NETWORK_LATENCY);
            setTimeout(() => {
                this.finishRequest(this.failed);
                clearDot(this.id);
            }, State.DEFAULT_NETWORK_LATENCY);
            return;
        }

        moveRequestDot(this.id, component, networkDelayToComponent);

        setTimeout(() => {
            const componentProcessor = State.componentProcessors[component];

            if (!componentProcessor) {
                console.error(`Processor not found for component: ${component}`);
                this.failed = true;
                clearDot(this.id);
                this.finishRequest(true);
                return;
            }

            if (component === 'load-balancer' && this.chosenServer === null) {
                this.chosenServer = selectServer(State.currentLbAlgorithm);

                if (this.chosenServer === null) {
                    addLog(`[Request #${this.id}] Failed: Load Balancer found no active servers.`, "error");
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
                this.hitCache = Math.random() < State.cacheHitRate;
                if (this.hitCache) {
                    State.updateState({ cacheHits: State.cacheHits + 1 });
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
                    State.updateState({ cacheMisses: State.cacheMisses + 1 });
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

        State.updateState({ requestCount: State.requestCount + 1 });
        if (!failed) {
            if (this.chosenServer && State.serverCounts[this.chosenServer] !== undefined) {
                let newCounts = { ...State.serverCounts };
                newCounts[this.chosenServer]++;
                State.updateState({ serverCounts: newCounts });
            }
            // console.log(`[Request #${this.id}] Completed in ${responseTime}ms by ${this.chosenServer || 'N/A'} (Cache ${this.hitCache ? 'HIT' : 'MISS'})`);
        } else {
            // console.log(`[Request #${this.id}] Failed after ${responseTime}ms`);
            State.updateState({ totalFailedRequests: State.totalFailedRequests + 1 });
        }
        updateMetrics(failed ? -1 : responseTime);

        if (this.currentComponent) {
            const prevComponent = document.querySelector(`.${this.currentComponent}`);
            if (prevComponent) {
                prevComponent.classList.remove('highlight');
            }
        }
    }
}


// Server Management Functions
export function addServer() {
    const serverGroup = document.querySelector('.server-group');
    const currentNextId = State.nextServerId;
    const newServerId = `server${currentNextId}`;
    State.updateState({ nextServerId: currentNextId + 1 });

    const newServerDiv = document.createElement('div');
    newServerDiv.classList.add('component', newServerId);
    newServerDiv.textContent = `Server ${currentNextId}`;
    newServerDiv.style.backgroundColor = getRandomColor();

    newServerDiv.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!newServerDiv.classList.contains('failed')) {
            showComponentDetails(newServerId);
        } else {
            addLog(`[System] Cannot show details for failed component ${newServerId}.`, "error");
        }
    });

    serverGroup.appendChild(newServerDiv);

    const updatedActiveServers = [...State.activeServers, newServerId];
    const updatedServerStates = { ...State.serverStates, [newServerId]: 'active' };
    const updatedServerCounts = { ...State.serverCounts, [newServerId]: 0 };
    const updatedComponentProcessors = { ...State.componentProcessors, [newServerId]: { isProcessing: false, queue: [], processTime: State.currentServerProcessingTime, currentlyProcessingRequest: null } };
    const updatedServerProcessingMultipliers = { ...State.serverProcessingTimeMultipliers, [newServerId]: 1.0 };

    State.updateState({
        activeServers: updatedActiveServers,
        serverStates: updatedServerStates,
        serverCounts: updatedServerCounts,
        componentProcessors: updatedComponentProcessors,
        serverProcessingTimeMultipliers: updatedServerProcessingMultipliers
    });

    if (State.activeServers.length === 2) {
        document.querySelector('.load-balancer').classList.remove('hidden');
        document.querySelector('.lb-to-servers').classList.remove('hidden');
        document.querySelector('.client-to-server').classList.remove('hidden');
    }

    addLog(`[System] Added ${newServerId}`);
    console.log("Active Servers:", State.activeServers);
    console.log("Server States:", State.serverStates);
}

export function removeServer() {
    if (State.activeServers.length <= 1) {
        addLog("[System] Cannot remove server: At least one active server is required.", "warning");
        return;
    }

    let serverToRemoveId = null;
    let updatedActiveServers = [...State.activeServers];
    for (let i = updatedActiveServers.length - 1; i >= 0; i--) {
        const serverId = updatedActiveServers[i];
        if (State.serverStates[serverId] === 'active') {
            serverToRemoveId = serverId;
            updatedActiveServers.splice(i, 1);
            break;
        }
    }

    if (serverToRemoveId) {
        const processor = State.componentProcessors[serverToRemoveId];
        if (processor) {
            if (processor.currentlyProcessingRequest) {
                addLog(`[System] Request #${processor.currentlyProcessingRequest.id} failed due to ${serverToRemoveId} removal.`, "error");
                processor.currentlyProcessingRequest.failed = true;
                clearDot(processor.currentlyProcessingRequest.id);
                processor.currentlyProcessingRequest.finishRequest(true);
            }
            if (processor.queue.length > 0) {
                addLog(`[System] ${processor.queue.length} requests failed in ${serverToRemoveId}'s queue.`, "error");
                processor.queue.forEach(req => {
                    req.failed = true;
                    clearDot(req.id);
                    req.finishRequest(true);
                });
            }
            const newProcessors = { ...State.componentProcessors };
            delete newProcessors[serverToRemoveId];
            State.updateState({ componentProcessors: newProcessors });
        }

        const serverToRemoveDiv = document.querySelector(`.${serverToRemoveId}`);
        if (serverToRemoveDiv) {
            serverToRemoveDiv.remove();
            addLog(`[System] Removed ${serverToRemoveId}`);

            const newStates = { ...State.serverStates };
            delete newStates[serverToRemoveId];
            const newCounts = { ...State.serverCounts };
            delete newCounts[serverToRemoveId];
            const newMultipliers = { ...State.serverProcessingTimeMultipliers };
            delete newMultipliers[serverToRemoveId];

            State.updateState({
                activeServers: updatedActiveServers,
                serverStates: newStates,
                serverCounts: newCounts,
                serverProcessingTimeMultipliers: newMultipliers
            });

            console.log("Active Servers:", State.activeServers);
            console.log("Server States:", State.serverStates);
        }

        if (State.activeServers.length === 1) {
            document.querySelector('.load-balancer').classList.add('hidden');
            document.querySelector('.lb-to-servers').classList.add('hidden');
            document.querySelector('.client-to-server').classList.remove('hidden');
        }

    } else {
        addLog("[System] No active servers available to remove.", "warning");
    }
}

export function killServer(serverId) {
    if (State.serverStates[serverId] === 'active') {
        const newStates = { ...State.serverStates, [serverId]: 'down' };
        const updatedActiveServers = State.activeServers.filter(id => id !== serverId);

        const serverDiv = document.querySelector(`.${serverId}`);
        if (serverDiv) {
            serverDiv.classList.add('failed');
            serverDiv.textContent = `Server ${serverId.replace('server', '')} (DOWN)`;
        }
        addLog(`[System] ${serverId} failed!`, "error");

        const processor = State.componentProcessors[serverId];
        if (processor) {
            if (processor.currentlyProcessingRequest) {
                const reqId = processor.currentlyProcessingRequest.id;
                clearDot(reqId);
                document.getElementById(`request-dot-${reqId}`)?.remove(); // Force remove
            }
            
            processor.queue.forEach(req => {
                clearDot(req.id);
                document.getElementById(`request-dot-${req.id}`)?.remove(); // Force remove
            });

            if (processor.currentlyProcessingRequest) {
                addLog(`[System] Request #${processor.currentlyProcessingRequest.id} failed due to ${serverId} failure.`, "error");
                processor.currentlyProcessingRequest.failed = true;
                processor.currentlyProcessingRequest.finishRequest(true);
            }
            if (processor.queue.length > 0) {
                addLog(`[System] ${processor.queue.length} requests failed in ${serverId}'s queue.`, "error");
                processor.queue.forEach(req => {
                    req.failed = true;
                    req.finishRequest(true);
                });
            }
            processor.isProcessing = false;
            processor.queue = [];
            processor.currentlyProcessingRequest = null;
        }

        State.updateState({
            activeServers: updatedActiveServers,
            serverStates: newStates
        });


        console.log("Active Servers after failure:", State.activeServers);
        console.log("Server States:", State.serverStates);
    } else {
        addLog(`[System] ${serverId} is already down or does not exist.`, "warning");
    }
}

export function reviveServer(serverId) {
    if (State.serverStates[serverId] === 'down') {
        const newStates = { ...State.serverStates, [serverId]: 'active' };
        let updatedActiveServers = [...State.activeServers, serverId];
        updatedActiveServers.sort((a, b) => {
            const numA = parseInt(a.replace('server', ''), 10);
            const numB = parseInt(b.replace('server', ''), 10);
            return numA - numB;
        });

        const serverDiv = document.querySelector(`.${serverId}`);
        if (serverDiv) {
            serverDiv.classList.remove('failed');
            serverDiv.classList.remove('degraded');
            serverDiv.textContent = `Server ${serverId.replace('server', '')}`;
            serverDiv.style.backgroundColor = getRandomColor();
        }
        addLog(`[System] ${serverId} revived!`);

        const newProcessors = { ...State.componentProcessors };
        if (!newProcessors[serverId]) {
            newProcessors[serverId] = { isProcessing: false, queue: [], processTime: State.currentServerProcessingTime, currentlyProcessingRequest: null };
        } else {
            newProcessors[serverId].isProcessing = false;
            newProcessors[serverId].queue = [];
            newProcessors[serverId].processTime = State.currentServerProcessingTime;
            newProcessors[serverId].currentlyProcessingRequest = null;
        }

        const newMultipliers = { ...State.serverProcessingTimeMultipliers, [serverId]: 1.0 };

        State.updateState({
            activeServers: updatedActiveServers,
            serverStates: newStates,
            componentProcessors: newProcessors,
            serverProcessingTimeMultipliers: newMultipliers
        });

        console.log("Active Servers after revival:", State.activeServers);
        console.log("Server States:", State.serverStates);
    } else {
        addLog(`[System] ${serverId} is already active or does not exist.`, "warning");
    }
}

export function slowDownServer(serverId) {
    if (State.serverStates[serverId] === 'active') {
        const newMultipliers = { ...State.serverProcessingTimeMultipliers, [serverId]: 2.0 }; // Example: Slow down 2x
        State.updateState({ serverProcessingTimeMultipliers: newMultipliers });
        const serverDiv = document.querySelector(`.${serverId}`);
        if (serverDiv) {
            serverDiv.classList.add('degraded');
        }
        addLog(`[System] ${serverId} performance degraded (processing time x2.0).`);
    } else {
        addLog(`[System] Cannot slow down ${serverId}: not active.`, "warning");
    }
}

export function restoreServerSpeed(serverId) {
    if (State.serverStates[serverId] !== 'down') { // Can restore if degraded or already normal
        const newMultipliers = { ...State.serverProcessingTimeMultipliers, [serverId]: 1.0 };
        State.updateState({ serverProcessingTimeMultipliers: newMultipliers });
        const serverDiv = document.querySelector(`.${serverId}`);
        if (serverDiv) {
            serverDiv.classList.remove('degraded');
        }
        addLog(`[System] ${serverId} performance restored.`);
    } else {
        addLog(`[System] Cannot restore speed for ${serverId}: server is down.`, "warning");
    }
}