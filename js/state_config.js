// Contains all shared state and configuration constants.

export let requestCount = 0;
export let totalResponseTime = 0;
export let serverCounts = {};

export let activeServers = ['server1', 'server2'];
export let serverStates = {
    'server1': 'active',
    'server2': 'active'
};
export let nextServerId = 3;

export let cacheHits = 0;
export let cacheMisses = 0;
export let cacheHitRate = 0.7;

export const DEFAULT_SERVER_PROCESSING_TIME = 200;
export const DEFAULT_DATABASE_LATENCY = 300;
export const DEFAULT_CACHE_PROCESSING_TIME = 50;
export const DEFAULT_LOAD_BALANCER_PROCESSING_TIME = 50;
export const DEFAULT_NETWORK_LATENCY = 50;

export let currentDbLatency = DEFAULT_DATABASE_LATENCY;
export let currentServerProcessingTime = DEFAULT_SERVER_PROCESSING_TIME;
export let currentCacheHitRate = cacheHitRate;

export let componentProcessors = {};

export let lastServerIndex = -1;
export let currentLbAlgorithm = 'random';

export let nextRequestId = 1;

export let networkLatencyMultiplier_ServerDB = 1.0;
export let serverProcessingTimeMultipliers = {}; // Will store multipliers like {'server1': 1.5}
export let totalFailedRequests = 0;

activeServers.forEach(id => {
    serverProcessingTimeMultipliers[id] = 1.0;
});
// Helper to update state variables from other modules
export function updateState(updates) {
    if (updates.requestCount !== undefined) requestCount = updates.requestCount;
    if (updates.totalResponseTime !== undefined) totalResponseTime = updates.totalResponseTime;
    if (updates.serverCounts !== undefined) serverCounts = updates.serverCounts;
    if (updates.activeServers !== undefined) activeServers = updates.activeServers;
    if (updates.serverStates !== undefined) serverStates = updates.serverStates;
    if (updates.nextServerId !== undefined) nextServerId = updates.nextServerId;
    if (updates.cacheHits !== undefined) cacheHits = updates.cacheHits;
    if (updates.cacheMisses !== undefined) cacheMisses = updates.cacheMisses;
    if (updates.cacheHitRate !== undefined) cacheHitRate = updates.cacheHitRate;
    if (updates.currentDbLatency !== undefined) currentDbLatency = updates.currentDbLatency;
    if (updates.currentServerProcessingTime !== undefined) currentServerProcessingTime = updates.currentServerProcessingTime;
    if (updates.currentCacheHitRate !== undefined) currentCacheHitRate = updates.currentCacheHitRate;
    if (updates.componentProcessors !== undefined) componentProcessors = updates.componentProcessors;
    if (updates.lastServerIndex !== undefined) lastServerIndex = updates.lastServerIndex;
    if (updates.currentLbAlgorithm !== undefined) currentLbAlgorithm = updates.currentLbAlgorithm;
    if (updates.nextRequestId !== undefined) nextRequestId = updates.nextRequestId;
    if (updates.networkLatencyMultiplier_ServerDB !== undefined) networkLatencyMultiplier_ServerDB = updates.networkLatencyMultiplier_ServerDB;
    if (updates.serverProcessingTimeMultipliers !== undefined) serverProcessingTimeMultipliers = updates.serverProcessingTimeMultipliers;
    if (updates.totalFailedRequests !== undefined) totalFailedRequests = updates.totalFailedRequests;
}