/**
 * Rotating Provider for Web3.js
 * 
 * A simple, elegant library that handles RPC provider rotation
 * with rate limit detection and two-tier provider support.
 * 
 * Features:
 * - Multiple instances supported (each gets own index in window.RPCState[])
 * - Fallback cooldown: After all preferred providers fail, uses fallback
 *   for 50 calls OR until 4 consecutive fallback failures
 * - Automatic cycling back to preferred providers after cooldown expires
 * 
 * Usage:
 *   const provider = new RotatingProvider(preferredConfig, fallbackConfig);
 *   const web3 = new Web3(provider);
 * 
 * Global state available at window.RPCState (array of instance states)
 */

var preferredProvidersDefault = [
  { 
    url: "https://polygon.drpc.org/",
    limitPerMinute: 100,
    limitPerHour: 1000,
    limitPerDay: 25000
  },
  { 
    url: "https://1rpc.io/matic",
    limitPerMinute: 70
  },
  { 
    url: "https://polygon-rpc.com",
    limitPerMinute: 70
  },
  { 
    url: "https://polygon-bor.publicnode.com",
    limitPerMinute: 100
  }
];

// Fallback providers - used when all preferred providers fail
var fallbackProvidersDefault = [
  { url: "https://api.blockeden.xyz/polygon/67nCBdZQSH9z3YqDDjdm" },
  { url: "https://polygon-mainnet.gateway.tatum.io/" },
  { url: "https://go.getblock.us/6fc0e1edcb0a41dd8c7d729e67b97970" },
  { url: "https://pol.leorpc.com/?api_key=FREE" },
  { url: "https://api.noderpc.xyz/rpc-polygon-pos/public" },
  { url: "https://endpoints.omniatech.io/v1/matic/mainnet/public" },
  { url: "https://polygon.api.onfinality.io/public" },
  { url: "https://poly.api.pocket.network/" },
  { url: "https://polygon-public.nodies.app" },
];

(function(global) {
  'use strict';

  // Configuration constants
  var FALLBACK_COOLDOWN_CALLS = 50;  // Number of calls to stay in fallback mode
  var MAX_CONSECUTIVE_FAILURES = 4;  // Max consecutive fallback failures before trying preferred again

  /**
   * Check if an error is a rate limit error
   * @param {Error} err - The error to check
   * @returns {boolean}
   */
  function isRateLimitError(err) {
    if (!err) return false;
    
    var message = (err.message || '').toLowerCase();
    var code = err.code;
    if(!message.includes('execution reverted')) {
      console.log(err)
    }
    // Common rate limit indicators and transient RPC errors
    return (
      code === 429 ||
      code === -32005 ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('throttle') ||
      message.includes('invalid json rpc response') ||
      message.includes('did it run out of gas') ||
      message.includes("returned values aren't valid") ||
      message.includes('is not a function') ||
      message.includes('exceeded your limit') ||
      message.includes('dialing to the given tcp address timed out') ||
      message.includes('api key disabled') ||
      message.includes('rpc error') ||
      message.includes('unauthorized') ||
      message.includes('paid plan')
    );
  }

  /**
   * Provider statistics tracker
   * @param {Object} config - Provider configuration
   */
  function ProviderStats(config) {
    this.url = config.url;
    this.limitPerMinute = config.limitPerMinute || Infinity;
    this.limitPerHour = config.limitPerHour || Infinity;
    this.limitPerDay = config.limitPerDay || Infinity;
    
    this.requestsThisMinute = 0;
    this.requestsThisHour = 0;
    this.requestsThisDay = 0;
    
    this.minuteStart = Date.now();
    this.hourStart = Date.now();
    this.dayStart = Date.now();
  }

  /**
   * Record a request and check if we should rotate due to limits
   * @returns {boolean} - true if limit exceeded and should rotate
   */
  ProviderStats.prototype.recordRequest = function() {
    var now = Date.now();
    
    // Reset minute counter if needed
    if (now - this.minuteStart >= 60000) {
      this.requestsThisMinute = 0;
      this.minuteStart = now;
    }
    
    // Reset hour counter if needed
    if (now - this.hourStart >= 3600000) {
      this.requestsThisHour = 0;
      this.hourStart = now;
    }
    
    // Reset day counter if needed
    if (now - this.dayStart >= 86400000) {
      this.requestsThisDay = 0;
      this.dayStart = now;
    }
    
    this.requestsThisMinute++;
    this.requestsThisHour++;
    this.requestsThisDay++;
    
    // Check if any limit exceeded
    return (
      this.requestsThisMinute > this.limitPerMinute ||
      this.requestsThisHour > this.limitPerHour ||
      this.requestsThisDay > this.limitPerDay
    );
  };

  /**
   * Get current stats as plain object
   * @returns {Object}
   */
  ProviderStats.prototype.getStats = function() {
    return {
      url: this.url,
      requestsThisMinute: this.requestsThisMinute,
      requestsThisHour: this.requestsThisHour,
      requestsThisDay: this.requestsThisDay,
      limitPerMinute: this.limitPerMinute,
      limitPerHour: this.limitPerHour,
      limitPerDay: this.limitPerDay
    };
  };

  /**
   * RotatingProvider - Web3 compatible provider with automatic rotation
   * 
   * @param {Array} preferredProviders - Array of preferred provider configs
   *   Each config: { url: string, limitPerMinute?: number, limitPerHour?: number, limitPerDay?: number }
   * @param {Array} fallbackProviders - Array of fallback provider configs (optional)
   */
  function RotatingProvider(prefInx = 0, preferredProviders = preferredProvidersDefault, fallbackProviders = fallbackProvidersDefault) {
    var self = this;
    
    // Normalize inputs
    this.preferredConfigs = (preferredProviders || []).map(function(p) {
      return typeof p === 'string' ? { url: p } : p;
    });
    
    this.fallbackConfigs = (fallbackProviders || []).map(function(p) {
      return typeof p === 'string' ? { url: p } : p;
    });
    
    // Create providers and stats
    this.preferredProviders = [];
    this.preferredStats = [];
    this.fallbackProviders = [];
    this.fallbackStats = [];
    this.callRetries = 0;
    this.txRetries = 0;
    
    // Track indices
    this.preferredIndex = prefInx;
    this.fallbackIndex = 0;
    this.usingFallback = false;
    
    // Cooldown tracking for fallback cycling
    this.fallbackCallsRemaining = 0;  // How many calls to stay in fallback mode
    this.consecutiveFallbackFailures = 0;  // Track consecutive fallback failures
    this.forcedToFallback = false;  // Whether we were forced to fallback due to all preferred failing
    
    // Initialize global state array for multiple instances
    if (typeof window !== 'undefined') {
      if (!Array.isArray(window.RPCState)) {
        window.RPCState = [];
      }
      // Find the next available index
      this._stateIndex = window.RPCState.length;
      window.RPCState.push({
        currentProvider: null,
        currentTier: 'preferred',
        preferredIndex: 0,
        fallbackIndex: 0,
        fallbackCallsRemaining: 0,
        consecutiveFallbackFailures: 0,
        forcedToFallback: false,
        providers: {
          preferred: [],
          fallback: []
        },
        getStats: function() {
          return self._getGlobalStats();
        }
      });
    }
    
    // Lazy-initialize providers (deferred until Web3 is available)
    this._initialized = false;
  }

  /**
   * Initialize providers (called lazily when first request is made)
   */
  RotatingProvider.prototype._ensureInitialized = function() {
    if (this._initialized) return;
    
    var Web3Provider = this._getWeb3Provider();
    if (!Web3Provider) {
      throw new Error('Web3 is not available. Please include web3.js before using RotatingProvider.');
    }
    
    var self = this;
    
    // Create preferred providers
    this.preferredConfigs.forEach(function(config) {
      self.preferredProviders.push(new Web3Provider(config.url));
      self.preferredStats.push(new ProviderStats(config));
    });
    
    // Create fallback providers
    this.fallbackConfigs.forEach(function(config) {
      self.fallbackProviders.push(new Web3Provider(config.url));
      self.fallbackStats.push(new ProviderStats(config));
    });
    
    this._initialized = true;
    this._updateGlobalState();
  };

  /**
   * Get Web3 HttpProvider class
   * @returns {Function|null}
   */
  RotatingProvider.prototype._getWeb3Provider = function() {
    if (typeof Web3 !== 'undefined') {
      return Web3.providers.HttpProvider;
    }
    return null;
  };

  /**
   * Update global state
   */
  RotatingProvider.prototype._updateGlobalState = function() {
    if (typeof window === 'undefined' || !Array.isArray(window.RPCState)) return;
    
    var state = window.RPCState[this._stateIndex];
    if (!state) return;
    
    var currentStats = this._getCurrentStats();
    
    state.currentProvider = currentStats ? currentStats.url : null;
    state.currentTier = this.usingFallback ? 'fallback' : 'preferred';
    state.preferredIndex = this.preferredIndex;
    state.fallbackIndex = this.fallbackIndex;
    state.fallbackCallsRemaining = this.fallbackCallsRemaining;
    state.consecutiveFallbackFailures = this.consecutiveFallbackFailures;
    state.forcedToFallback = this.forcedToFallback;
    state.providers.preferred = this.preferredStats.map(function(s) {
      return s.getStats();
    });
    state.providers.fallback = this.fallbackStats.map(function(s) {
      return s.getStats();
    });
  };

  /**
   * Get global stats snapshot
   * @returns {Object}
   */
  RotatingProvider.prototype._getGlobalStats = function() {
    if (typeof window === 'undefined' || !Array.isArray(window.RPCState)) {
      return null;
    }
    var state = window.RPCState[this._stateIndex];
    if (!state) return null;
    
    return {
      currentProvider: state.currentProvider,
      currentTier: state.currentTier,
      preferredIndex: state.preferredIndex,
      fallbackIndex: state.fallbackIndex,
      fallbackCallsRemaining: state.fallbackCallsRemaining,
      consecutiveFallbackFailures: state.consecutiveFallbackFailures,
      forcedToFallback: state.forcedToFallback,
      providers: {
        preferred: state.providers.preferred.slice(),
        fallback: state.providers.fallback.slice()
      }
    };
  };

  /**
   * Get current provider
   * @returns {Object|null}
   */
  RotatingProvider.prototype._getCurrentProvider = function() {
    if (this.usingFallback) {
      return this.fallbackProviders[this.fallbackIndex] || null;
    }
    return this.preferredProviders[this.preferredIndex] || null;
  };

  /**
   * Get current provider stats
   * @returns {ProviderStats|null}
   */
  RotatingProvider.prototype._getCurrentStats = function() {
    if (this.usingFallback) {
      return this.fallbackStats[this.fallbackIndex] || null;
    }
    return this.preferredStats[this.preferredIndex] || null;
  };

  /**
   * Rotate to next provider
   * @param {boolean} isFailure - Whether this rotation is due to a failure
   * @returns {boolean} - true if there are more providers to try
   */
  RotatingProvider.prototype._rotateProvider = function(isFailure) {
    // If in cooldown mode (using fallback with calls remaining)
    if (this.fallbackCallsRemaining > 0 && this.usingFallback) {
      this.fallbackCallsRemaining--;
      
      if (isFailure) {
        this.consecutiveFallbackFailures++;
        // If max consecutive fallback failures, try preferred providers again
        if (this.consecutiveFallbackFailures >= MAX_CONSECUTIVE_FAILURES) {
          this.usingFallback = false;
          this.fallbackCallsRemaining = 0;
          this.consecutiveFallbackFailures = 0;
          this.forcedToFallback = false;
          this.preferredIndex = 0;
          this._updateGlobalState();
          return true;
        }
        // Rotate within fallback providers
        this.fallbackIndex = (this.fallbackIndex + 1) % this.fallbackProviders.length;
        console.log('[RotatingProvider] Switched to fallback provider: ' + this.fallbackIndex);
      } else {
        this.consecutiveFallbackFailures = 0;
      }
      
      this._updateGlobalState();
      return true;
    }
    
    if (!this.usingFallback) {
      // Still in preferred tier
      this.preferredIndex++;
      console.log('[RotatingProvider] Switched to preferred provider: ' + this.preferredIndex);
      if (this.preferredIndex >= this.preferredProviders.length) {
        // Switch to fallback tier
        this.usingFallback = true;
        this.forcedToFallback = true;
        this.fallbackCallsRemaining = FALLBACK_COOLDOWN_CALLS;
        this.consecutiveFallbackFailures = 0;
        this.fallbackIndex = 0;
        
        if (this.fallbackProviders.length === 0) {
          // No fallback providers, wrap preferred
          this.usingFallback = false;
          this.forcedToFallback = false;
          this.fallbackCallsRemaining = 0;
          this.preferredIndex = 0;
          return false;
        }
      }
    } else {
      // In fallback tier (not in cooldown mode)      
      this.fallbackIndex++;
      console.log('[RotatingProvider] Switched to fallback provider: ' + this.fallbackIndex);
      if (this.fallbackIndex >= this.fallbackProviders.length) {
        // All providers exhausted, check if we should retry preferred
        if (this.forcedToFallback) {
          // After exhausting all fallbacks, start cooldown mode
          this.fallbackCallsRemaining = FALLBACK_COOLDOWN_CALLS;
          this.consecutiveFallbackFailures = 0;
          this.fallbackIndex = 0;
        } else {
          // All providers exhausted
          return false;
        }
      }
    }
    this._updateGlobalState();
    return true;
  };

  /**
   * Reset to start of preferred providers
   */
  RotatingProvider.prototype._resetProviders = function() {
    this.preferredIndex = 0;
    this.fallbackIndex = 0;
    this.usingFallback = false;
    this.fallbackCallsRemaining = 0;
    this.consecutiveFallbackFailures = 0;
    this.forcedToFallback = false;
    this._updateGlobalState();
  };

  /**
   * Update cooldown state on successful request
   * Called after a successful request when in fallback mode with cooldown active
   */
  RotatingProvider.prototype._updateCooldownOnSuccess = function() {
    if (this.usingFallback && this.fallbackCallsRemaining > 0) {
      this.fallbackCallsRemaining--;
      this.consecutiveFallbackFailures = 0;
      
      // If cooldown expired, go back to preferred providers
      if (this.fallbackCallsRemaining === 0) {
        this.usingFallback = false;
        this.forcedToFallback = false;
        this.preferredIndex = 0;
      }
      this._updateGlobalState();
    }
  };

  /**
   * Generate a unique request ID
   * Uses timestamp + random to ensure uniqueness across concurrent requests
   */
  function getNextRequestId() {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
  }

  /**
   * Ensure payload has all required JSON-RPC 2.0 fields
   * Some RPC providers are strict and require jsonrpc and id fields
   * @param {Object} payload - The request payload
   * @returns {Object} - Payload with required fields
   */
  function ensureJsonRpcFormat(payload) {
    if (!payload) return payload;
    
    // If payload already has jsonrpc field, assume it's complete
    if (payload.jsonrpc) {
      return payload;
    }
    
    // Add required JSON-RPC 2.0 fields
    return {
      jsonrpc: '2.0',
      id: (payload.id !== null && payload.id !== undefined) ? payload.id : getNextRequestId(),
      method: payload.method,
      params: payload.params  // Preserve original params value
    };
  }

  /**
   * Send a request to the underlying provider (wraps callback in Promise)
   * Returns the FULL JSON-RPC response unchanged - true passthrough
   * @param {Object} provider - The HttpProvider to use
   * @param {Object} payload - JSON-RPC request payload
   * @returns {Promise} - Resolves with full JSON-RPC response object
   */
  function sendToProvider(provider, payload) {
    return new Promise(function(resolve, reject) {
      // Ensure payload has required JSON-RPC 2.0 fields
      // Some RPC providers are strict and reject requests without jsonrpc/id
      var formattedPayload = ensureJsonRpcFormat(payload);
      
      provider.send(formattedPayload, function(err, result) {
        if (err) {
          reject(err);
        } else if (result && result.error) {
          // JSON-RPC error - pass through the error info
          var rpcError = new Error(result.error.message || 'RPC Error');
          rpcError.code = result.error.code;
          rpcError.data = result.error.data;
          reject(rpcError);
        } else if (formattedPayload && formattedPayload.method === 'eth_call' &&
                   result && (!result.result || result.result === '0x' || result.result === '0X')) {
          // Empty eth_call result from an unreliable RPC node - reject so we can retry
          // This prevents Web3's ABI decoder from throwing "Returned values aren't valid, did it run Out of Gas?"
          var emptyError = new Error("Returned values aren't valid, did it run Out of Gas? Empty eth_call result from RPC node.");
          emptyError.code = -32000;
          reject(emptyError);
        } else {
          // Return the FULL response unchanged - true passthrough
          resolve(result);
        }
      });
    });
  }

  /**
   * Web3 provider interface - request method (Promise-based, EIP-1193)
   * @param {Object} payload - JSON-RPC request payload
   * @returns {Promise} - Resolves with just the result value (per EIP-1193)
   */
  RotatingProvider.prototype.request = function(payload) {
    var self = this;
    
    this._ensureInitialized();
    
    // Calculate max attempts (all preferred + up to 4 fallback)
    var maxAttempts = this.preferredProviders.length + 
      Math.min(4, this.fallbackProviders.length);
    
    if (maxAttempts === 0) {
      return Promise.reject(new Error('No providers configured'));
    }
    
    var lastError = null;
    var attempts = 0;
    
    // Save starting position to reset after
    var startPreferredIndex = this.preferredIndex;
    var startFallbackIndex = this.fallbackIndex;
    var startUsingFallback = this.usingFallback;
    
    function tryRequest() {
      if (attempts >= maxAttempts) {
        // Reset to starting position for next request
        self.preferredIndex = startPreferredIndex;
        self.fallbackIndex = startFallbackIndex;
        self.usingFallback = startUsingFallback;
        self._updateGlobalState();
        
        return Promise.reject(lastError || new Error('All providers failed'));
      }
      
      var provider = self._getCurrentProvider();
      var stats = self._getCurrentStats();
      
      if (!provider) {
        return Promise.reject(new Error('No provider available'));
      }
      
      // Check if we should pre-emptively rotate due to limits
      var shouldRotate = stats.recordRequest();
      if (shouldRotate && attempts < maxAttempts - 1) {
        self._rotateProvider(false);
        provider = self._getCurrentProvider();
        stats = self._getCurrentStats();
        // Note: We don't record again here - the next iteration will record
      }
      
      self._updateGlobalState();
      
      attempts++;
      
      var isTx = payload && (payload.method === 'eth_sendTransaction' || payload.method === 'eth_sendRawTransaction');
      return sendToProvider(provider, payload).then(function(response) {
        // On successful request, update cooldown state
        self._updateCooldownOnSuccess();
        // EIP-1193 request() should return just the result value
        // Reset only the counter relevant to this call type (tx vs read)
        if (isTx) { self.txRetries = 0; } else { self.callRetries = 0; }
        return response && response.result !== undefined ? response.result : response;
      }).catch(function(err) {
        lastError = err;
        
        // Only rotate on rate limit errors
        if (!isRateLimitError(err)) {
          // Use separate counters: tx failures and call failures should not influence each other
          var retryCount = isTx ? (++self.txRetries) : (++self.callRetries);
          if(retryCount < 10) {
            throw err; // Semantic error, don't retry
          } else {
            if (isTx) { self.txRetries = 0; } else { self.callRetries = 0; }
          }
        }
        
        // Rotate and retry
        var hasMore = self._rotateProvider(true);
        if (!hasMore || attempts >= maxAttempts) {
          throw lastError;
        }
        
        return tryRequest();
      });
    }
    
    return tryRequest();
  };

  /**
   * Web3 provider interface - send method (legacy callback style)
   * Retries with the next provider on transient errors instead of failing outright.
   * @param {Object} payload - JSON-RPC request payload
   * @param {Function} callback - Callback function(error, result)
   */
  RotatingProvider.prototype.send = function(payload, callback) {
    var self = this;
    
    if (typeof callback !== 'function') {
      throw new Error('Synchronous send is not supported');
    }
    
    this._ensureInitialized();
    
    var maxAttempts = this.preferredProviders.length +
      Math.min(4, this.fallbackProviders.length);
    var attempts = 0;
    var formattedPayload = ensureJsonRpcFormat(payload);

    function trySend() {
      var provider = self._getCurrentProvider();
      var stats = self._getCurrentStats();

      if (!provider) {
        callback(new Error('No provider available'), null);
        return;
      }

      stats.recordRequest();
      self._updateGlobalState();
      attempts++;

      provider.send(formattedPayload, function(err, result) {
        // Build an error object for empty eth_call results
        if (!err && formattedPayload && formattedPayload.method === 'eth_call' &&
            result && (!result.result || result.result === '0x' || result.result === '0X')) {
          err = new Error("Returned values aren't valid, did it run Out of Gas? Empty eth_call result from RPC node.");
          err.code = -32000;
          result = null;
        }

        if (err) {
          if (isRateLimitError(err) && attempts < maxAttempts) {
            // Transient error - rotate and retry with next provider
            self._rotateProvider(true);
            return trySend();
          }
          callback(err, null);
        } else {
          self._updateCooldownOnSuccess();
          callback(null, result);
        }
      });
    }

    trySend();
  };

  /**
   * Web3 provider interface - sendAsync method
   * @param {Object} payload - JSON-RPC request payload
   * @param {Function} callback - Callback function(error, result)
   */
  RotatingProvider.prototype.sendAsync = function(payload, callback) {
    this.send(payload, callback);
  };

  /**
   * Check if connected
   * @returns {boolean}
   */
  RotatingProvider.prototype.isConnected = function() {
    return this._initialized && this._getCurrentProvider() !== null;
  };

  /**
   * Get current provider URL for debugging
   * @returns {string|null}
   */
  RotatingProvider.prototype.getCurrentUrl = function() {
    var stats = this._getCurrentStats();
    return stats ? stats.url : null;
  };

  // Export for different module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RotatingProvider;
  } else if (typeof define === 'function' && define.amd) {
    define(function() { return RotatingProvider; });
  } else {
    global.RotatingProvider = RotatingProvider;
  }

})(typeof window !== 'undefined' ? window : this);
