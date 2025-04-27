let requestCount = 0;
let totalResponseTime = 0;
let serverCounts = {}; // Use an object to track counts per server ID

// Adjusted STEP_DELAY and animation duration
const STEP_DELAY = 600; // Time between steps (determines how quickly steps are processed)
const ANIMATION_DURATION = STEP_DELAY * 0.8; // Make animation slightly shorter than step delay (e.g., 80% of delay)

// --- Dynamic Server Management ---
let activeServers = ['server1', 'server2']; // Initial active servers
let serverStates = { // Keep track of server state (active, down, etc.)
    'server1': 'active',
    'server2': 'active'
};
let nextServerId = 3; // Counter for new servers

// --- Cache State ---
let cacheHits = 0;
let cacheMisses = 0;
let cacheHitRate = 0.7; // Simulate a 70% cache hit rate initially
// --- End Cache State ---


function addServer() {
    const serverGroup = document.querySelector('.server-group');
    const newServerId = `server${nextServerId++}`; // Generate unique ID
    const newServerDiv = document.createElement('div');
    newServerDiv.classList.add('component', newServerId); // Add component and unique class
    newServerDiv.textContent = `Server ${nextServerId - 1}`; // Display name
    newServerDiv.style.backgroundColor = getRandomColor(); // Optional: unique color
    serverGroup.appendChild(newServerDiv); // Add to DOM

    activeServers.push(newServerId); // Add to active servers list
    serverStates[newServerId] = 'active'; // Set initial state
    serverCounts[newServerId] = 0; // Initialize count for new server
    addLog(`[System] Added ${newServerId}`);
    console.log("Active Servers:", activeServers);
    console.log("Server States:", serverStates);
}

function removeServer() {
    if (activeServers.length <= 1) {
        addLog("[System] Cannot remove server: At least one active server is required.");
        return;
    }

    // Find the last *active* server to remove
    let serverToRemoveId = null;
    // Iterate backwards to find the most recently added active server
    for (let i = activeServers.length - 1; i >= 0; i--) {
        const serverId = activeServers[i];
        if (serverStates[serverId] === 'active') {
            serverToRemoveId = serverId;
            activeServers.splice(i, 1); // Remove from active list
            break; // Found and removed one, exit loop
        }
    }

    if (serverToRemoveId) {
         const serverToRemoveDiv = document.querySelector(`.${serverToRemoveId}`);
         if (serverToRemoveDiv) {
             serverToRemoveDiv.remove(); // Remove from DOM
             addLog(`[System] Removed ${serverToRemoveId}`);
             delete serverStates[serverToRemoveId]; // Remove from states
             delete serverCounts[serverToRemoveId]; // Remove from counts
             console.log("Active Servers:", activeServers);
             console.log("Server States:", serverStates);
         }
    } else {
        addLog("[System] No active servers available to remove.");
    }
}

function killServer(serverId) {
    if (serverStates[serverId] === 'active') {
        serverStates[serverId] = 'down'; // Mark state as down
        // Remove from activeServers list so Load Balancer doesn't pick it
        const activeIndex = activeServers.indexOf(serverId);
        if (activeIndex > -1) {
            activeServers.splice(activeIndex, 1);
        }

        const serverDiv = document.querySelector(`.${serverId}`);
        if (serverDiv) {
            serverDiv.classList.add('failed'); // Add the failed class for styling
            serverDiv.textContent = `Server ${serverId.replace('server', '')} (DOWN)`; // Update text
        }
        addLog(`[System] ${serverId} failed!`);
        console.log("Active Servers after failure:", activeServers);
        console.log("Server States:", serverStates);

        // Optional: Trigger a check to see if any in-flight requests were targeting this server
        // This is more complex and might involve iterating through active Request instances.
        // The runNextStep logic will handle requests *attempting* to go there.

    } else {
         addLog(`[System] ${serverId} is already down or does not exist.`);
    }
}

function reviveServer(serverId) {
    if (serverStates[serverId] === 'down') {
       serverStates[serverId] = 'active'; // Mark state as active

       // Add back to activeServers list (maintain some order if desired, e.g., sort)
       activeServers.push(serverId);
       // Sort activeServers array if you want them in order 'server1', 'server2', etc.
       activeServers.sort((a, b) => {
           const numA = parseInt(a.replace('server', ''), 10);
           const numB = parseInt(b.replace('server', ''), 10);
           return numA - numB;
       });


       const serverDiv = document.querySelector(`.${serverId}`);
       if (serverDiv) {
           serverDiv.classList.remove('failed'); // Remove the failed class
           serverDiv.textContent = `Server ${serverId.replace('server', '')}`; // Restore text
            // Re-assign a color? Or keep the original? Let's re-assign for now.
            serverDiv.style.backgroundColor = getRandomColor();
       }
       addLog(`[System] ${serverId} revived!`);
       console.log("Active Servers after revival:", activeServers);
       console.log("Server States:", serverStates);

   } else {
        addLog(`[System] ${serverId} is already active or does not exist.`);
   }
}


// --- End Dynamic Server Management ---


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
    const avgResponseTime = Math.round(totalResponseTime / requestCount);

    document.getElementById('requestCount').textContent = requestCount;
    document.getElementById('avgResponseTime').textContent = avgResponseTime;

    // Update Cache Metrics
    document.getElementById('cacheHits').textContent = cacheHits;
    document.getElementById('cacheMisses').textContent = cacheMisses;
    const totalCacheChecks = cacheHits + cacheMisses;
    const currentHitRate = totalCacheChecks > 0 ? ((cacheHits / totalCacheChecks) * 100).toFixed(1) : 0;
    document.getElementById('cacheHitRate').textContent = `${currentHitRate}%`;

    // Optional: Update per-server counts display if you add it
    // console.log("Server Counts:", serverCounts);
}

class Request {
    constructor(id) {
        this.id = id;
        this.startTime = Date.now();
        this.chosenServer = null;
        this.failed = false;
        this.hitCache = false;
        this.finished = false; // Flag to prevent multiple finish calls

        if (activeServers.length === 0) {
             addLog(`[Request #${this.id}] Failed: No active servers available.`);
             this.finishRequest(true);
             return;
         }

        this.currentStep = 0;
        // Initial steps: Client -> LB -> Final Client Return
        // The in-between steps will be added at the LB stage
        this.steps = [
            { component: 'client', message: 'Request sent from Client to Load Balancer.' },
            { component: 'load-balancer', message: 'Load Balancer routing request...' },
            { component: 'client', message: 'Response returned to Client.' } // Final return step
        ];


        createRequestDot(this.id);

        // Start the request process
        this.runNextStep();
    }

    runNextStep() {
        // Stop if the request has failed or all steps are done
        if (this.failed || this.currentStep >= this.steps.length) {
            this.finishRequest(this.failed);
            return;
        }

        const currentStepData = this.steps[this.currentStep];
        let { component, message } = currentStepData;

        // --- Core Step Logic ---

        // Remove highlight from previous component if any
        if (this.currentComponent) {
            const prevComponent = document.querySelector(`.${this.currentComponent}`);
            if (prevComponent) {
                prevComponent.classList.remove('highlight');
            }
        }

        // Check if the *current* component for this step is valid/active (especially for servers)
         if (component.startsWith('server') && (serverStates[component] !== 'active')) {
             addLog(`[Request #${this.id}] Failed: Target server ${component} is down.`);
             this.failed = true;
             this.finishRequest(true);
             return; // Stop processing steps
         }

        // Highlight the current component
        highlightComponent(component);
        this.currentComponent = component; // Update the tracker

        // Log the step
        // Note: Log happens *before* specific step actions might update the message
        addLog(`[Request #${this.id}] ${message}`);

        // Move the dot to the current component's location (This animation will take ANIMATION_DURATION)
        moveRequestDot(this.id, component);


        // --- Handle Specific Step Actions ---

        // Load Balancer Step: Choose a server dynamically and build intermediate steps
        if (component === 'load-balancer' && this.chosenServer === null) {
            if (activeServers.length === 0) {
                 addLog(`[Request #${this.id}] Failed: Load Balancer found no active servers.`);
                 this.failed = true;
                 clearDot(this.id);
                 this.finishRequest(true);
                 return;
            }
            const randomIndex = Math.floor(Math.random() * activeServers.length);
            this.chosenServer = activeServers[randomIndex];

            // Define the intermediate steps *between* LB and the final Client return
            // Ensure these component names match your HTML class names
            const intermediateSteps = [
                 { component: this.chosenServer, message: `Request received by ${this.chosenServer}.` },
                 { component: 'cache', message: 'Server checking Cache.' },
                 { component: 'database', message: 'Cache missed, querying Database.' }, // DB step - will be skipped on hit
                 { component: this.chosenServer, message: `Database returned data from Database.` }, // Server return from DB - will be skipped on hit
            ];

            // Insert intermediate steps after the current Load Balancer step (this.currentStep)
            // The final client step is at index 2 initially, so insert before it.
            const finalClientStepIndex = this.steps.length - 1; // Index of the last step (Client return)
            this.steps.splice(finalClientStepIndex, 0, ...intermediateSteps);

             // Update the message for the load balancer step to indicate the chosen server
             currentStepData.message = `Load Balancer routed to ${this.chosenServer}`;
        }
        // Cache Step: Simulate hit or miss and skip steps if hit
        else if (component === 'cache') {
             this.hitCache = Math.random() < cacheHitRate;

             if (this.hitCache) {
                 cacheHits++;
                 // Update the message for the *current* cache step
                 currentStepData.message = 'Cache HIT!';

                 // Find the 'database' step which should immediately follow the cache step IF it wasn't hit
                 const dbStepIndex = this.steps.findIndex((step, index) => index > this.currentStep && step.component === 'database');

                 if (dbStepIndex !== -1) {
                      // Find the server return from DB step, which should immediately follow the database step
                      const serverReturnDbIndex = this.steps.findIndex((step, index) => index > dbStepIndex && step.component === this.chosenServer && step.message.includes('Database')); // Look for message about DB

                     if (serverReturnDbIndex !== -1) {
                         // Remove the 'database' step and the 'server return from Database' step
                          this.steps.splice(dbStepIndex, serverReturnDbIndex - dbStepIndex + 1);
                     } else {
                         // If server return from DB step isn't found, just remove the DB step
                          this.steps.splice(dbStepIndex, 1);
                     }

                      // Insert a new step for Server returning from Cache right after the current Cache step
                      const serverReturnCacheStep = { component: this.chosenServer, message: `${this.chosenServer} returning data from Cache.` };
                       this.steps.splice(this.currentStep + 1, 0, serverReturnCacheStep);
                 }


             } else {
                 cacheMisses++;
                 // Update the message for the *current* cache step
                 currentStepData.message = 'Cache MISS. Going to Database.';
                 // Flow continues naturally to the database step as defined
             }
             // Note: The initial log message for the cache step happened before this logic.
             // The message update here fixes the text property in the steps array for future reference.
             // If you want the log to reflect HIT/MISS immediately for the cache step,
             // you might need to re-log after this block or structure slightly differently.
             // The visual flow/timing is what matters more for the simulation effect.
        }
         // Server Return Step (Distinguish between from DB and from Cache based on the message set)
         // No extra logic needed here beyond the core step handling.


        // --- End Handle Specific Step Actions ---

        // --- Schedule the NEXT step ---
        this.currentStep++; // Move to the next step index

        // Schedule the next runAfterAnimation completes.
        // The timeout duration should match the STEP_DELAY.
        // The dot animation takes ANIMATION_DURATION, which is less than STEP_DELAY.
        // This means the dot arrives before the next step's logic begins.
         if (this.currentStep < this.steps.length) {
             setTimeout(() => {
                 this.runNextStep();
             }, STEP_DELAY);
         } else {
             // If this was the last step (the final client return), call finishRequest after the timeout
             // The dot is moving to the final client step, wait for that animation
             setTimeout(() => {
                  this.finishRequest(this.failed);
             }, STEP_DELAY); // Wait for the dot to reach the final destination (Client)
         }
    }


     finishRequest(failed = false) {
        // Only finish if the request hasn't already been marked as finished
         if (this.finished) {
             return;
         }
         this.finished = true;

        const endTime = Date.now();
        const responseTime = endTime - this.startTime;

        if (!failed) {
            updateMetrics(responseTime);
            // Increment count for the server that handled the request (the chosen server)
            if (this.chosenServer && serverCounts[this.chosenServer] !== undefined) {
                 serverCounts[this.chosenServer]++;
            }
             console.log(`[Request #${this.id}] Completed in ${responseTime}ms by ${this.chosenServer || 'N/A'} (Cache ${this.hitCache ? 'HIT' : 'MISS'})`);
        } else {
             console.log(`[Request #${this.id}] Failed after ${responseTime}ms`);
        }

        // Clear last highlight
        if (this.currentComponent) {
            const prevComponent = document.querySelector(`.${this.currentComponent}`);
            if (prevComponent) {
                prevComponent.classList.remove('highlight');
            }
        }

        // Wait a little longer before removing the dot to make sure the final animation is visible
        // This timeout should ideally be related to ANIMATION_DURATION if finishRequest was called immediately after the last move.
        // Since finishRequest is called after STEP_DELAY after the last step *starts*,
        // waiting for the remainder of the animation might be needed.
        // Let's just use a small fixed delay for cleanup.
        setTimeout(() => {
             clearDot(this.id);
        }, 50); // Small delay to ensure dot is visible at client before removal
    }
}

let nextRequestId = 1;

document.getElementById('sendRequestBtn').addEventListener('click', () => {
    new Request(nextRequestId++);
});

// --- Event Listeners for Tinker Buttons (Keep them as is) ---
document.getElementById('addServerBtn').addEventListener('click', addServer);
document.getElementById('removeServerBtn').addEventListener('click', removeServer);
document.getElementById('killRandomServerBtn').addEventListener('click', () => {
    const currentlyActive = Object.keys(serverStates).filter(serverId => serverStates[serverId] === 'active'); // Use serverStates
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
// --- End Event Listeners ---

// --- DOT ANIMATION FUNCTIONS ---
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

        // Set position without transition initially
        dot.style.transition = 'none';
        dot.style.left = `${rect.left - containerRect.left + rect.width / 2}px`;
        dot.style.top = `${rect.top - containerRect.top + rect.height / 2}px`;

         // Force a reflow to ensure position is applied before any later transition
         void dot.offsetWidth;

    } else {
        console.error("Client component not found! Cannot place request dot.");
        dot.remove();
    }
}

function moveRequestDot(id, componentName) {
    const dot = document.getElementById(`request-dot-${id}`);
    const component = document.querySelector(`.${componentName}`);

    // Check component state before moving
    if (!component || (componentName.startsWith('server') && serverStates[componentName] !== 'active')) {
        console.warn(`Attempted to move dot ${id} to unavailable component .${componentName}. Removing dot.`);
        clearDot(id);
        return;
    }

    if (dot && component) {
        const rect = component.getBoundingClientRect();
        const containerRect = document.getElementById('animationContainer').getBoundingClientRect();

        // Set transition duration based on ANIMATION_DURATION BEFORE setting the new position
        dot.style.transition = `all ${ANIMATION_DURATION / 1000}s linear`; // Use ANIMATION_DURATION

        dot.style.left = `${rect.left - containerRect.left + rect.width / 2}px`;
        dot.style.top = `${rect.top - containerRect.top + rect.height / 2}px`;

    } else if (dot) {
         console.warn(`Component .${componentName} not found for dot ${id}. Removing dot.`);
         clearDot(id);
    }
}

function clearDot(id) {
    const dot = document.getElementById(`request-dot-${id}`);
    if (dot) {
        dot.remove();
    }
}
// --- END DOT ANIMATION FUNCTIONS ---


function getRandomColor() {
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#d35400', '#7f8c8d'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Initial setup: Initialize server counts and states for existing servers
activeServers.forEach(server => {
    serverCounts[server] = 0;
    serverStates[server] = 'active'; // Ensure initial state is active
    const serverDiv = document.querySelector(`.${server}`);
    if(serverDiv) {
        serverDiv.style.backgroundColor = getRandomColor(); // Give initial servers colors too
    }
});

// Initialize cache metrics display
document.getElementById('cacheHits').textContent = cacheHits;
document.getElementById('cacheMisses').textContent = cacheMisses;
document.getElementById('cacheHitRate').textContent = `${(cacheHitRate * 100).toFixed(1)}%`; // Display initial hit rate percentage