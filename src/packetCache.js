// Packet Cache with Prefetch
// Caches packet details and prefetches adjacent packets for smooth navigation

import { ref } from 'vue';
import { packets, trackFetched, trackSent, setPacketCacheClearer } from './globals';

// Configuration
const WINDOW_SIZE = 3;        // Prefetch ±3 packets around selected
const MAX_CACHE_SIZE = 100;   // Maximum packets to cache (LRU eviction)

// Cache storage: Map<frameNumber, { details, hex, accessTime }>
const cache = new Map();

// Loading state for UI feedback
export const isFetchingBatch = ref(false);

// Pending fetch promise to avoid duplicate requests
let pendingFetch = null;
let pendingFetchRange = null;

// Get packet from cache
export const getCachedPacket = (frameNumber) => {
  const entry = cache.get(frameNumber);
  if (entry) {
    entry.accessTime = Date.now(); // Update for LRU
    return { details: entry.details, hex: entry.hex };
  }
  return null;
};

// Check if packet is in cache
export const isPacketCached = (frameNumber) => {
  return cache.has(frameNumber);
};

// Add packets to cache
const addToCache = (packetsData) => {
  for (const [frameNum, data] of Object.entries(packetsData)) {
    const frame = parseInt(frameNum);
    cache.set(frame, {
      details: data.details,
      hex: data.hex,
      accessTime: Date.now()
    });
  }

  // Evict oldest entries if cache is too large
  if (cache.size > MAX_CACHE_SIZE) {
    evictOldest(cache.size - MAX_CACHE_SIZE);
  }
};

// Evict N oldest entries (LRU)
const evictOldest = (count) => {
  const entries = Array.from(cache.entries());
  entries.sort((a, b) => a[1].accessTime - b[1].accessTime);

  for (let i = 0; i < count && i < entries.length; i++) {
    cache.delete(entries[i][0]);
  }
};

// Clear cache (call when capture restarts or pcap file changes)
export const clearPacketCache = () => {
  cache.clear();
  pendingFetch = null;
  pendingFetchRange = null;
};

// Calculate the range of frames that should be fetched
const calculateFetchRange = (targetFrame, totalPackets) => {
  // Get frame numbers from packets array
  // targetFrame is the frame.number, not index

  // Calculate window bounds
  let startFrame = Math.max(1, targetFrame - WINDOW_SIZE);
  let endFrame = targetFrame + WINDOW_SIZE;

  // Clamp to available packets if we know the total
  // Note: totalPackets is the count, last frame might be higher due to filtering
  if (totalPackets > 0) {
    // We can't really know the max frame number without checking
    // Just request the range and let server return what exists
  }

  return { startFrame, endFrame };
};

// Determine which frames need fetching (not in cache)
const getUncachedFrames = (startFrame, endFrame) => {
  const needed = [];
  for (let f = startFrame; f <= endFrame; f++) {
    if (!cache.has(f)) {
      needed.push(f);
    }
  }
  return needed;
};

// Fetch a batch of packets from server
const fetchBatch = async (startFrame, endFrame) => {
  const rangeKey = `${startFrame}-${endFrame}`;

  // If same range is already being fetched, return existing promise
  if (pendingFetch && pendingFetchRange === rangeKey) {
    return pendingFetch;
  }

  isFetchingBatch.value = true;

  const url = `/api/packets-batch?start=${startFrame}&end=${endFrame}`;
  trackSent(url.length);

  pendingFetchRange = rangeKey;
  pendingFetch = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      trackFetched(text.length);
      return JSON.parse(text);
    })
    .then((data) => {
      if (data.packets) {
        addToCache(data.packets);
      }
      return data;
    })
    .finally(() => {
      isFetchingBatch.value = false;
      pendingFetch = null;
      pendingFetchRange = null;
    });

  return pendingFetch;
};

// Main function: Get packet with prefetch
// Returns { details, hex } or null if not available
// Also triggers background prefetch of adjacent packets
export const getPacketWithPrefetch = async (frameNumber, totalPackets = 0) => {
  // Check cache first
  const cached = getCachedPacket(frameNumber);
  if (cached && cached.details) {
    // Packet is cached - check if we need to prefetch more
    triggerPrefetchIfNeeded(frameNumber, totalPackets);
    return cached;
  }

  // Not in cache - fetch batch centered on this frame
  const { startFrame, endFrame } = calculateFetchRange(frameNumber, totalPackets);

  try {
    await fetchBatch(startFrame, endFrame);
    return getCachedPacket(frameNumber);
  } catch (e) {
    console.error('Failed to fetch packet batch:', e);
    return null;
  }
};

// Trigger prefetch if user is near cache boundary
const triggerPrefetchIfNeeded = (frameNumber, totalPackets) => {
  // Check if we're near the edge of cached data
  const lookAhead = WINDOW_SIZE;

  // Check forward boundary
  let needForward = false;
  for (let i = 1; i <= lookAhead; i++) {
    if (!cache.has(frameNumber + i)) {
      needForward = true;
      break;
    }
  }

  // Check backward boundary
  let needBackward = false;
  for (let i = 1; i <= lookAhead; i++) {
    if (frameNumber - i >= 1 && !cache.has(frameNumber - i)) {
      needBackward = true;
      break;
    }
  }

  // Prefetch in background if needed
  if (needForward) {
    const start = frameNumber + 1;
    const end = frameNumber + WINDOW_SIZE + lookAhead;
    // Only fetch if not already in progress
    const uncached = getUncachedFrames(start, end);
    if (uncached.length > 0) {
      fetchBatch(uncached[0], uncached[uncached.length - 1]).catch(() => {});
    }
  }

  if (needBackward && frameNumber > 1) {
    const end = frameNumber - 1;
    const start = Math.max(1, frameNumber - WINDOW_SIZE - lookAhead);
    const uncached = getUncachedFrames(start, end);
    if (uncached.length > 0) {
      fetchBatch(uncached[0], uncached[uncached.length - 1]).catch(() => {});
    }
  }
};

// Get cache stats (for debugging/status)
export const getCacheStats = () => {
  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    windowSize: WINDOW_SIZE
  };
};

// Register cache clearer with globals (called when clearPackets is invoked)
setPacketCacheClearer(clearPacketCache);
