// Earn Tab Functionality for BitBay Treasury System
// Handles Lido HODL Vault, StableVault, Staking, and Voting

// ============================================================================
// TREASURY CONTRACT ADDRESSES
// ============================================================================

const TREASURY_ADDRESSES = {
  // Polygon Network
  BAYL_TREASURY: '0xE31DcAE0440cBeaF7B1325F41b7fD7DDEbFD9Aef',
  BAYR_TREASURY: '0xBE096a8fc127eCFD8ca8dD826057bd617d5A5587',
  VAULT: '0x46A0DFf165E3Fdf92cf390C74c972a2247f8634B',
  FLOW_BAYL: '0xB9773b8F280b7c5c1Bf85528264c07fFc58dbc81',
  FLOW_BAYR: '0xA8aea8Ea55c9C9626234AB097d1d29eDF78da2ce',
  VOTE_BAYL: '0x13a8D0E90BA6D29f2bE87aC81C80799813b68E92',
  VOTE_BAYR: '0x482e26B0309D9D3052aE50aA2D4E7DbcC6E1A3E7',
  STABLE_POOL: '0x3bec8b6d568720133D2a4C5B98E811cA43687d57',
  STABLE_FEE_VAULT: '0xD47B0e7e46CEccEaa1C40a805053a69754FAfEf0',
  AUTOBRIDGE: '0x1c682Bcb55B9be1296eed6e60dc0e4832b05B05A',
  UNISWAP_V4_POOL_MANAGER: '0x67366782805870060151383F4BbFF9daB53e5cD6',
  UNISWAP_V4_STATE_VIEW: '0x5eA1bD7974c8A611cBAB0bDCAFcB1D9CC9b3BA5a',
  USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
  
  // LP Pairs
  BAYL_DAI_UNISWAP: '0x37f75363c6552D47106Afb9CFdA8964610207938',
  BAYR_DAI_UNISWAP: '0x63Ff2f545E4CbCfeBBdeE27bB5dA56fdEE076524',
  
  // Chainlink Price Feeds
  ETH_USD_FEED: '0xF9680D99D6C9589e2a93a78A04A279e509205945', // ETH/USD on Polygon
  
  // Ethereum Network
  LIDO_VAULT: '0x618B4dBf7d071d3Eb4281DfDb484606C55c5f1d1',
  LIDO_STETH: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

var earnState = {
  stakingEnabled: false,
  stakingInterval: null,
  nextStakeTime: null,
  randomDelaySeconds: 0,
  ethWeb3: null, // Separate Web3 instance for Ethereum mainnet
  polWeb3: null, // Web3 instance for Polygon
  userVaultAddress: null,
  isPasswordLogin: false, // Track if user logged in with password
  lastEthCheck: 0,
  lastPolCheck: 0,
  userTotalRewards: {}, // Track total rewards per coin
  consoleLog: [], // Console log for transactions (max 100)
  minLido: '1000000000000000'
};

// Reset earnState to default values - called when switching accounts or logging out
function resetEarnState() {
  // Stop any running automation
  if (earnState.stakingInterval) {
    clearInterval(earnState.stakingInterval);
  }
  
  // Reset all state values explicitly
  earnState.stakingEnabled = false;
  earnState.stakingInterval = null;
  earnState.nextStakeTime = null;
  earnState.randomDelaySeconds = 0;
  earnState.ethWeb3 = null;
  earnState.polWeb3 = null;
  earnState.userVaultAddress = null;
  earnState.isPasswordLogin = false;
  earnState.lastEthCheck = 0;
  earnState.lastPolCheck = 0;
  earnState.userTotalRewards = {};
  earnState.consoleLog = [];
  
  // Reset UI checkbox
  const stakingCheckbox = document.getElementById('stakingEnabledCheckbox');
  if (stakingCheckbox) {
    stakingCheckbox.checked = false;
  }
  
  // Reset each UI element explicitly to avoid destroying HTML structure
  // Balance displays (spans) - reset to "0.0"
  const balanceElements = [
    'ethBalance', 'lidoBalance', 'vaultBaylBalance', 'vaultBayrBalance', 
    'daiBalanceAmount', 'usdcBalanceAmount', 'wethBalanceAmount', 'polBalanceAmount'
  ];
  balanceElements.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '0.0';
  });
  
  // Staking POL balance
  const stakingPolBalance = document.getElementById('stakingPolBalance');
  if (stakingPolBalance) stakingPolBalance.textContent = '0';
  
  // User position elements - reset to default values
  const userLidoAmount = document.getElementById('userLidoAmount');
  if (userLidoAmount) userLidoAmount.textContent = '0';
  
  const userLidoUnlockDate = document.getElementById('userLidoUnlockDate');
  if (userLidoUnlockDate) userLidoUnlockDate.textContent = 'N/A';
  
  const userStableDAI = document.getElementById('userStableDAI');
  if (userStableDAI) userStableDAI.textContent = '0';
  
  const userStablePercent = document.getElementById('userStablePercent');
  if (userStablePercent) userStablePercent.textContent = '0';
  
  const userStablePendingFees = document.getElementById('userStablePendingFees');
  if (userStablePendingFees) userStablePendingFees.textContent = '0';
  
  // User staking info elements
  const userVaultAddress = document.getElementById('userVaultAddress');
  if (userVaultAddress) userVaultAddress.textContent = 'Loading...';
  
  const userShares = document.getElementById('userShares');
  if (userShares) userShares.textContent = '0';
  
  const userLastRefresh = document.getElementById('userLastRefresh');
  if (userLastRefresh) userLastRefresh.textContent = 'N/A';
  
  const userTrackingCoins = document.getElementById('userTrackingCoins');
  if (userTrackingCoins) userTrackingCoins.textContent = 'None';
  
  const userPendingRewards = document.getElementById('userPendingRewards');
  if (userPendingRewards) userPendingRewards.textContent = 'Loading...';
  
  const userTotalRewards = document.getElementById('userTotalRewards');
  if (userTotalRewards) userTotalRewards.textContent = 'Loading...';
  
  // Vote elements
  const bayrPreviousVotes = document.getElementById('bayrPreviousVotes');
  if (bayrPreviousVotes) bayrPreviousVotes.textContent = 'Not Active';
  
  const bayrPendingVotes = document.getElementById('bayrPendingVotes');
  if (bayrPendingVotes) bayrPendingVotes.textContent = 'Not Active';
  
  // Console content
  const stakingConsoleContent = document.getElementById('stakingConsoleContent');
  if (stakingConsoleContent) stakingConsoleContent.textContent = '';
  
  // ROI display text
  const earnRoiText = document.getElementById('earnRoiText');
  if (earnRoiText) earnRoiText.textContent = 'Calculating...';
  
  // Input fields - clear values
  const inputsToClear = ['lidoDepositAmount', 'lidoLockDays', 'stableDepositAmount', 'stakingDepositAmount'];
  inputsToClear.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  // Lock estimate
  const lidoLockEstimate = document.getElementById('lidoLockEstimate');
  if (lidoLockEstimate) lidoLockEstimate.textContent = '0m';
  
  console.log('Earn state reset');
}

// ============================================================================
// CONSOLE LOGGING FOR AUTOMATION
// ============================================================================

function logToConsole(message) {
  const timestamp = new Date().toLocaleString();
  const logEntry = `[${timestamp}] ${message}`;
  
  earnState.consoleLog.unshift(logEntry);
  
  // Keep only last 100 messages
  if (earnState.consoleLog.length > 100) {
    earnState.consoleLog = earnState.consoleLog.slice(0, 100);
  }

  const consoleDiv = document.getElementById('stakingConsole');
  if (consoleDiv) {
    if (!consoleDiv.classList.contains('hidden')) {
      showConsoleHistory(true);
    }
  }
  
  // Save to localStorage
  try {
    localStorage.setItem(myaccounts+'earnConsoleLog', JSON.stringify(earnState.consoleLog));
  } catch (e) {
    console.error('Failed to save console log:', e);
  }
  
  // Also log to browser console
  console.log(logEntry);
}

// ============================================================================
// TRANSACTION HELPER - Use sendTx with network switching support
// ============================================================================

/**
 * Send transaction using earn.js web3 instances or main sendTx
 * @param {Object} contract - Web3 contract instance or type "ETH" for base send
 * @param {String} method - Method name to call
 * @param {Array} args - Method arguments
 * @param {Number} glimit - Gas limit
 * @param {String} val - Value to send (in wei)
 * @param {Boolean} confirmBox - Show confirmation dialog (ignored for loginType 2)
 * @param {Boolean} switchNetworks - Switch to Ethereum mainnet for this tx
 * @param {Boolean} confCheck - check for transaction confirmations
 * @returns {Promise} Transaction receipt
 */
// Helper function to show vote payload details
async function showVotePayload(hash) {
  if (!earnState.polWeb3) return;
  
  const voteContract = new earnState.polWeb3.eth.Contract(stakingABI, TREASURY_ADDRESSES.VOTE_BAYL);
  
  voteContract.methods.getProposalPayload(hash).call().then(async (payload) => {
    // 1. Main Container
    const mainContainer = document.createElement('div');
    mainContainer.style.textAlign = 'left';
    mainContainer.style.fontFamily = 'monospace';
    mainContainer.style.fontSize = '0.85em';

    // 2. Header
    const headerHtml = `
      <p><strong>Hash:</strong> ${DOMPurify.sanitize(String(validation(hash)))}</p>
      <p><strong>Decoded Actions:</strong></p>
    `;
    const headerDiv = document.createElement('div');
    headerDiv.innerHTML = headerHtml;
    mainContainer.appendChild(headerDiv);
    
    try {
      payload = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(payload))));
      
      // 3. Actions Scrollable List
      const actionsContainer = document.createElement('div');
      actionsContainer.style.background = '#f5f5f5';
      actionsContainer.style.padding = '10px';
      actionsContainer.style.borderRadius = '5px';
      actionsContainer.style.maxHeight = '400px';
      actionsContainer.style.overflowY = 'auto';
      actionsContainer.style.boxSizing = 'border-box';
      
      const actions = [];
      for (let i = 0; i < payload.length; i += 3) {
        if (i + 2 >= payload.length) break;
        
        const sig = earnState.polWeb3.eth.abi.decodeParameter('string', payload[i]);
        const target = earnState.polWeb3.eth.abi.decodeParameter('address', payload[i + 1]);
        const argsBlob = earnState.polWeb3.eth.abi.decodeParameter('bytes', payload[i + 2]);
        
        const typesString = sig.substring(sig.indexOf('(') + 1, sig.lastIndexOf(')'));
        const typesArray = typesString === "" ? [] : typesString.split(',').map(t => t.trim()).filter(t => t);
        
        let decodedArgs = [];
        let decodeError = null;
        if (typesArray.length > 0 && argsBlob !== '0x') {
          try {
            decodedArgs = earnState.polWeb3.eth.abi.decodeParameters(typesArray, argsBlob);
            decodedArgs = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(decodedArgs))));
          } catch (e) {
            console.error('Error decoding arguments: ' + (e.name || 'Unknown error'));
            decodeError = 'Unable to decode arguments';  // Generic message, don't expose e.message
            decodedArgs = [];
          }
        }
        
        actions.push({
          function: sig,
          target: target,
          arguments: decodedArgs,
          decodeError: decodeError
        });
      }
      
      if (actions.length === 0) {
        actionsContainer.innerHTML = '<div style="padding:10px;">No actions found in payload</div>';
      } else {
        // 4. Create Wrapper + SafeDiv + Button for each action
        actions.forEach((action, idx) => {
            // A. Create Wrapper for this specific action entry
            const actionWrapper = document.createElement('div');
            actionWrapper.style.marginBottom = '15px';
            actionWrapper.style.padding = '8px';
            actionWrapper.style.background = 'white';
            actionWrapper.style.borderRadius = '3px';
            actionWrapper.style.border = '1px solid #ddd';

            // B. Build HTML Content
            let html = `<div>`;
            html += `<div style="font-weight: bold; color: #2196F3;">Action ${idx + 1}</div>`;
            html += `<div style="margin-top: 5px;"><strong>Target:</strong> ${DOMPurify.sanitize(action.target)}</div>`;
            html += `<div><strong>Function:</strong> ${DOMPurify.sanitize(action.function)}</div>`;
            
            const typesString = action.function.substring(action.function.indexOf('(') + 1, action.function.lastIndexOf(')'));
            const typesArray = typesString === "" ? [] : typesString.split(',').map(t => t.trim()).filter(t => t);
            
            if (action.decodeError) {
              html += `<div style="margin-top: 5px; background: #fff3cd; padding: 5px; border-radius: 3px;">`;
              html += `<strong style="color: #856404;">⚠ Decode Error:</strong> ${DOMPurify.sanitize(action.decodeError)}`;
              html += `</div>`;
            } else if (typesArray.length > 0) {
              html += `<div style="margin-top: 5px;"><strong>Arguments:</strong></div>`;
              html += `<ul style="margin: 5px 0; padding-left: 20px;">`;
              typesArray.forEach((type, argIdx) => {
                const value = action.arguments[argIdx] !== undefined ? action.arguments[argIdx] : '';
                html += `<li><span style="color: #777;">${DOMPurify.sanitize(type)}:</span> ${DOMPurify.sanitize(String(value))}</li>`;
              });
              html += `</ul>`;
            } else {
              html += `<div style="margin-top: 5px; color: #999;">No arguments</div>`;
            }
            html += `</div>`;

            // C. Create SafeDiv (Iframe Content)
            // width: 100% (CSS) to fit wrapper, but calc height based on ~440px
            const safeDiv = SafeDiv(html, "", 440);
            actionWrapper.appendChild(safeDiv);
            
            // D. Add to list
            actionsContainer.appendChild(actionWrapper);
        });
      }
      
      mainContainer.appendChild(actionsContainer);

    } catch (error) {
      // Log only safe error type information, never raw error objects or payload data
      // Console logging can also be exploited (console XSS, format string injection, log injection)
      console.log(error)
      
      // Display generic error message without exposing any details
      const errDiv = document.createElement('div');
      errDiv.style.background = '#fff3cd';
      errDiv.style.padding = '10px';
      errDiv.style.borderRadius = '5px';
      errDiv.style.color = '#856404';
      errDiv.textContent = 'Error: Unable to decode payload. This may indicate invalid or malicious data.';
      
      mainContainer.appendChild(errDiv);
    }
    
    await Swal.fire({
      title: 'Vote Details',
      html: mainContainer,
      width: '500px',
      confirmButtonText: 'Close'
    });
  }).catch(async(error) => {
    console.error('Failed to load vote details: ' + (error.name || 'Unknown error'));
    await Swal.fire('Error', translateThis('Failed to load vote details'), 'error');
  });
}

function SafeDiv(rawHtml, containerStyle = "", height = "150px") {

    // 1. SANITIZE
    function sanitizeHtml(html) {
        const temp = document.createElement("div");
        temp.innerHTML = html;
        const walker = document.createTreeWalker(temp, NodeFilter.SHOW_ELEMENT, null, false);
        while (walker.nextNode()) {
            const el = walker.currentNode;
            el.removeAttribute("width");
            el.removeAttribute("height");
            el.removeAttribute("position");
            if (el.tagName === "SCRIPT") { el.remove(); continue; }
            [...el.attributes].forEach(attr => {
                if (attr.name.startsWith("on")) el.removeAttribute(attr.name);
            });
        }
        return temp.innerHTML;
    }
    const cleanedHtml = sanitizeHtml(rawHtml);

    // 2. DETECT STYLES
    function getMajorityStyles() {
        const elements = document.body.querySelectorAll("*");
        const colorCount = {}, fontSizeCount = {}, fontFamilyCount = {}, bgCount = {};
        elements.forEach(el => {
            const s = getComputedStyle(el);
            colorCount[s.color] = (colorCount[s.color] || 0) + 1;
            fontSizeCount[s.fontSize] = (fontSizeCount[s.fontSize] || 0) + 1;
            fontFamilyCount[s.fontFamily] = (fontFamilyCount[s.fontFamily] || 0) + 1;
            if (s.backgroundColor !== "rgba(0, 0, 0, 0)") bgCount[s.backgroundColor] = (bgCount[s.backgroundColor] || 0) + 1;
        });
        const majority = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0];
        return {
            color: majority(colorCount) || "#000",
            fontSize: majority(fontSizeCount) || "16px",
            fontFamily: majority(fontFamilyCount) || "sans-serif",
            background: majority(bgCount) || "transparent"
        };
    }
    const majority = getMajorityStyles();

    // 3. CREATE IFRAME
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", ""); 
    iframe.style.border = "none";
    iframe.style.display = "block";
    iframe.style.width = "100%"; 
    iframe.style.height = height;
    
    // DECISION LOGIC:
    // Is this a small "pill" (Address/Balance) or a big "block" (Vote List)?
    const isSmallField = (height !== 'auto' && parseInt(height) < 60);

    // If it's a big block, we allow scrolling. 
    // If it's a small pill, we hide it to look clean.
    iframe.style.overflow = isSmallField ? "hidden" : "auto";

    // 4. CSS INJECTION (The Brains)
    // We toggle between 'flex' (centering) and 'block' (scrolling) based on size.
    iframe.srcdoc = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:;">
            <style>
                html, body {
                    margin:0; padding:0;
                    width: 100%; height: 100%;
                    box-sizing: border-box;
                    
                    /* INHERITED THEME */
                    background:${majority.background};
                    color:${majority.color};
                    font-size:${majority.fontSize};
                    font-family:${majority.fontFamily};

                    /* LAYOUT SWITCHING */
                    /* Small Fields: Use Flexbox to center text vertically */
                    /* Large Fields: Use Block to allow natural scrolling */
                    display: ${isSmallField ? 'flex' : 'block'};
                    align-items: ${isSmallField ? 'center' : 'unset'};
                    
                    /* SCROLLBAR LOGIC */
                    /* This FORCES the scrollbar if content is too long */
                    overflow: ${isSmallField ? 'hidden' : 'auto'};
                }
                * { box-sizing:border-box; }
            </style>
        </head>
        <body>
            <div style="width:100%;">${cleanedHtml}</div>
        </body>
        </html>
    `;

    // 5. OUTER CONTAINER
    const container = document.createElement("div");
    container.style.cssText = containerStyle;
    container.style.width = "100%"; 
    container.style.height = height; 
    container.style.overflow = "hidden"; 
    container.appendChild(iframe);

    return container;
}

function showConsoleHistory(showThis=false) {
  // Toggle console visibility instead of showing popup
  const consoleDiv = document.getElementById('stakingConsole');
  if (consoleDiv) {
    if (consoleDiv.classList.contains('hidden') || showThis) {
      consoleDiv.classList.remove('hidden');
      const consoleContent = document.getElementById('stakingConsoleContent');
      if (consoleContent) {
        consoleContent.textContent = earnState.consoleLog.join('\n') || translateThis('No logs yet');
        // Scroll to bottom
        consoleContent.scrollTop = consoleContent.scrollHeight;
      }
    } else {
      consoleDiv.classList.add('hidden');
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS FOR SAFE NUMBER HANDLING
// ============================================================================

// Helper to display BAY amounts with proper decimals
function displayBAYAmount(amountString, decimals = 2) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return stripZeros(new BN(amountString).dividedBy('1e8').toFixed(decimals, BN.ROUND_DOWN));
}

// Helper for ETH amounts (18 decimals)
function displayETHAmount(amountString, decimals = 4) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return stripZeros(new BN(amountString).dividedBy('1e18').toFixed(decimals, BN.ROUND_DOWN));
}

// Helper for USDC amounts (6 decimals)
function displayUSDCAmount(amountString, decimals = 2) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return stripZeros(new BN(amountString).dividedBy('1e6').toFixed(decimals, BN.ROUND_DOWN));
}

// Helper to check if BigNumber is greater than zero
function isGreaterThanZero(amountString) {
  if (!amountString) return false;
  const BN = BigNumber;
  return new BN(amountString).gt(new BN('0'));
}

// Helper to format ETH amounts (18 decimals) without stripping zeros
function formatETHAmount(amountString, decimals = 4) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return new BN(amountString).dividedBy('1e18').toFixed(decimals, BN.ROUND_DOWN);
}

// Helper to format DAI amounts (18 decimals) without stripping zeros
function formatDAIAmount(amountString, decimals = 2) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return new BN(amountString).dividedBy('1e18').toFixed(decimals, BN.ROUND_DOWN);
}

// Helper to format USDC amounts (6 decimals) without stripping zeros
function formatUSDCAmount(amountString, decimals = 2) {
  if (!amountString || amountString === '0') return '0';
  const BN = BigNumber;
  return new BN(amountString).dividedBy('1e6').toFixed(decimals, BN.ROUND_DOWN);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeEarnTab() {  
  if (!myaccounts || loginType === 0) {
    return;
  }
  console.log('Initializing Earn tab...');
  // Initialize Ethereum Web3 for Lido operations using custom RPC if available
  const ethRpc = typeof getEthereumRpc === 'function' ? getEthereumRpc() : 'https://eth.drpc.org/';
  earnState.ethWeb3 = new Web3(ethRpc);
  
  // Use custom Polygon RPC if available
  const polRpc = new RotatingProvider(1);//typeof getPolygonRpc === 'function' ? getPolygonRpc() : RPC_ENDPOINTS[0];
  earnState.polWeb3 = new Web3(polRpc);
  
  // Load saved staking state
  const stakingEnabled = localStorage.getItem(myaccounts+'earnStakingEnabled');
  if (stakingEnabled === 'true' && loginType == 2) {
    const checkbox = document.getElementById('stakingEnabledCheckbox');
    if (checkbox) {
      checkbox.checked = true;
      earnState.stakingEnabled = true;
    }
  }
  
  // Load saved total rewards
  const savedRewards = localStorage.getItem(myaccounts+'earnTotalRewards');
  if (savedRewards) {
    try {
      earnState.userTotalRewards = JSON.parse(savedRewards);
    } catch (e) {
      earnState.userTotalRewards = {};
    }
  }
  
  // Load console log
  const savedLog = localStorage.getItem(myaccounts+'earnConsoleLog');
  if (savedLog) {
    try {
      earnState.consoleLog = JSON.parse(savedLog);
    } catch (e) {
      earnState.consoleLog = [];
    }
  }
  
  // Setup sub-tab navigation for Earn tab
  setupEarnSubTabs();
  
  // Setup lock days estimator
  setupLockDaysEstimator();
  
  // Setup stable profit destination change handler
  setupStableProfitDestinationHandler();
  
  console.log('Earn tab initialized');
}

// Function to be called when user logs in
async function onEarnUserLogin() {
  console.log('User logged in, initializing Earn data...');
  
  // Don't proceed if user is not logged in
  if (!myaccounts || loginType === 0) {
    console.log('User not logged in, skipping Earn tab login initialization');
    return;
  }
  
  // Update web3 references with custom RPC if available
  const polRpc = new RotatingProvider(1);
  const ethRpc = typeof getEthereumRpc === 'function' ? getEthereumRpc() : 'https://eth.drpc.org/';
  earnState.polWeb3 = new Web3(polRpc);
  earnState.ethWeb3 = new Web3(ethRpc);
  
  // Detect login type
  earnState.isPasswordLogin = (loginType === 2);
  
  // Load initial data
  await refreshEarnTab();  
  // Start staking automation if enabled and using password login
  if (earnState.stakingEnabled && earnState.isPasswordLogin) {
    startStakingAutomation();
  }
}

function setupEarnSubTabs() {
  const earnSubNav = document.querySelector('.earn-subnav');
  if (!earnSubNav) return;
  
  const subNavItems = earnSubNav.querySelectorAll('.tabs__nav-item');
  const subPanels = document.querySelectorAll('.earn-subtabs .tabs__panels > .tabs__panel');
  
  earnSubNav.addEventListener('click', (e) => {
    if (e.target.classList.contains('tabs__nav-item')) {
      const clickedIndex = Array.from(subNavItems).indexOf(e.target);
      
      // Update active nav item
      subNavItems.forEach(item => item.classList.remove('js-active'));
      e.target.classList.add('js-active');
      
      // Update active panel
      subPanels.forEach(panel => panel.classList.remove('js-active'));
      if (subPanels[clickedIndex]) {
        subPanels[clickedIndex].classList.add('js-active');
      }
    }
  });
  subNavItems. forEach((item, index) => {
    if (index === 0) {
      item.classList.add('js-active');
    } else {
      item.classList. remove('js-active');
    }
  });  
  subPanels.forEach((panel, index) => {
    if (index === 0) {
      panel.classList.add('js-active');
    } else {
      panel.classList.remove('js-active');
    }
  });
}

function setupLockDaysEstimator() {
  const lockDaysInput = document.getElementById('lidoLockDays');
  const estimateSpan = document.getElementById('lidoLockEstimate');
  
  if (lockDaysInput && estimateSpan) {
    lockDaysInput.addEventListener('input', () => {
      const days = parseInt(lockDaysInput.value) || 0;
      const months = Math.floor(days / 30);
      const years = Math.floor(days / 365);
      
      if (years > 0) {
        estimateSpan.textContent = `${years}y ${Math.floor((days % 365) / 30)}m`;
      } else if (months > 0) {
        estimateSpan.textContent = `${months}m`;
      } else {
        estimateSpan.textContent = `${days}d`;
      }
    });
  }
}

function setupStableProfitDestinationHandler() {
  const dropdown = document.getElementById('stableProfitDestination');
  if (!dropdown) return;
  
  dropdown.addEventListener('change', async function() {
    const selected = dropdown.value;
    
    // If custom is selected, prompt for address via Swal
    if (selected === 'custom') {
      const result = await Swal.fire({
        title: translateThis('Custom Address'),
        input: 'text',
        inputLabel: translateThis('Enter a valid ETH address'),
        inputPlaceholder: '0x...',
        showCancelButton: true,
        confirmButtonText: translateThis('Confirm'),
        cancelButtonText: translateThis('Cancel'),
        inputValidator: (value) => {
          if (!value) return translateThis('Please enter an address');
          if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return translateThis('Invalid Ethereum address');
        }
      });
      if (result.isConfirmed && result.value) {
        dropdown.dataset.customAddress = DOMPurify.sanitize(result.value);
      } else {
        // Revert to previous value
        dropdown.value = dropdown.dataset.previousValue || 'user';
        return;
      }
    }
    
    // Check if new selection differs from current on-chain sendTo and update on-chain
    if (!myaccounts || !earnState.polWeb3) return;
    const currentSendTo = dropdown.dataset.currentSendTo || '';
    let newTarget = myaccounts;
    if (selected === 'bayl') newTarget = TREASURY_ADDRESSES.BAYL_DAI_UNISWAP;
    else if (selected === 'bayr') newTarget = TREASURY_ADDRESSES.BAYR_DAI_UNISWAP;
    else if (selected === 'custom') newTarget = dropdown.dataset.customAddress || '';
    
    const needsUpdate = newTarget && (currentSendTo === '0x0000000000000000000000000000000000000000' || 
                        !currentSendTo || currentSendTo.toLowerCase() !== newTarget.toLowerCase());
    
    if (needsUpdate) {
      const confirm = await Swal.fire({
        title: translateThis('Change Profit Destination'),
        html: translateThis('Do you want to update your profit destination on chain?'),
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: translateThis('Update'),
        cancelButtonText: translateThis('Cancel')
      });
      if (!confirm.isConfirmed) {
        dropdown.value = dropdown.dataset.previousValue || 'user';
        return;
      }
      try {
        showSpinner();
        const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
        const feeVault = validation(DOMPurify.sanitize(await stableContract.methods.feeVault().call()));
        const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
        await sendTx(feeVaultContract, "changeSendTo", [newTarget], 200000, "0", true, false);
        dropdown.dataset.currentSendTo = newTarget;
        hideSpinner();
        await Swal.fire(translateThis('Success'), translateThis('Profit destination updated!'), 'success');
      } catch (error) {
        hideSpinner();
        console.log(error);
        dropdown.value = dropdown.dataset.previousValue || 'user';
        await showScrollableError(translateThis('Transaction failed'), translateThis('Please check your browsers console for the full error message'));
        return;
      }
    }
    
    dropdown.dataset.previousValue = selected;
  });
}

// ============================================================================
// LIDO HODL VAULT FUNCTIONS
// ============================================================================

async function loadLidoVaultInfo() {
  if (!earnState.ethWeb3) return;
  
  try {
    const BN = BigNumber;
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    
    // Get total principal and yield
    const totalPrincipal = validation(DOMPurify.sanitize(await lidoContract.methods.totalPrincipal().call()));
    var totalYield = validation(DOMPurify.sanitize(await lidoContract.methods.totalYield().call()));
    totalYield = (new BN(validation(DOMPurify.sanitize(await lidoContract.methods.availableYield().call()))).plus(new BN(totalYield))).toString();
    
    // Convert from wei to ETH using BigNumber
    const principalETH = formatETHAmount(totalPrincipal, 8);
    const yieldETH = formatETHAmount(totalYield, 8);
    
    document.getElementById('lidoTotalPrincipal').textContent = principalETH;
    document.getElementById('lidoTotalYield').textContent = yieldETH;
    
    // Get current and next epoch unlock amounts
    const epochLength = parseInt(validation(DOMPurify.sanitize(await lidoContract.methods.EPOCH_LENGTH().call())));
    const currentTime = Math.floor(Date.now() / 1000);
    const currentEpoch = Math.floor(currentTime / epochLength);
    const nextEpoch = currentEpoch + 1;
    
    const currentEpochUnlock = validation(DOMPurify.sanitize(await lidoContract.methods.unlockAmountByEpoch(currentEpoch).call()));
    const nextEpochUnlock = validation(DOMPurify.sanitize(await lidoContract.methods.unlockAmountByEpoch(nextEpoch).call()));
    
    document.getElementById('lidoCurrentEpochUnlock').textContent = formatETHAmount(currentEpochUnlock, 8);
    document.getElementById('lidoNextEpochUnlock').textContent = formatETHAmount(nextEpochUnlock, 8);
    
  } catch (error) {
    console.error('Error loading Lido vault info:', error);
  }
}

async function loadUserLidoPosition() {
  if (!earnState.ethWeb3 || !myaccounts) return;
  
  try {
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    const userDeposit = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await lidoContract.methods.deposits(myaccounts).call()))));
    
    if (isGreaterThanZero(userDeposit.amount)) {
      const amountETH = formatETHAmount(userDeposit.amount, 8);
      const unlockDate = new Date(userDeposit.unlockTimestamp * 1000);
      
      document.getElementById('userLidoAmount').textContent = amountETH;
      document.getElementById('userLidoUnlockDate').textContent = unlockDate.toLocaleDateString();
      document.getElementById('userLidoPosition').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading user Lido position:', error);
  }
}

async function loadETHBalances() {
  if (!earnState.ethWeb3 || !myaccounts) return;
  
  try {
    const BN = earnState.ethWeb3.utils.BN;
    const balances = {};
    
    // Get ETH balance
    const ethBalance = validation(DOMPurify.sanitize(await earnState.ethWeb3.eth.getBalance(myaccounts)));
    const ethBalanceETH = formatETHAmount(ethBalance, 8);
    document.getElementById('ethBalance').textContent = ethBalanceETH;

    if (new BN(ethBalance).gt(new BN('0'))) {
      balances.ETH = ethBalanceETH;
    }
    
    // Show gas warning if low (0.0025 ETH)
    const lowBalanceThreshold = earnState.ethWeb3.utils.toWei('0.0025', 'ether');
    if (new BN(ethBalance).lt(new BN(lowBalanceThreshold))) {
      document.getElementById('ethGasWarning').classList.remove('hidden');
    } else {
      document.getElementById('ethGasWarning').classList.add('hidden');
    }
    
    // Get stETH balance
    const stETHContract = new earnState.ethWeb3.eth.Contract(
      [{
        "constant": true,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
      }],
      TREASURY_ADDRESSES.LIDO_STETH
    );
    
    const stETHBalance = validation(DOMPurify.sanitize(await stETHContract.methods.balanceOf(myaccounts).call()));
    
    if (new BN(stETHBalance).gt(new BN('0'))) {
      const stETHBalanceETH = formatETHAmount(stETHBalance, 8);
      document.getElementById('lidoBalance').textContent = stETHBalanceETH;
      document.getElementById('lidoBalanceField').classList.remove('hidden');
      balances.SETH = stETHBalanceETH;
    }

    if (Object.keys(balances).length > 0) {
      localStorage.setItem(myaccounts+'earnTabBalances2', JSON.stringify(balances));
      showBalanceNotification();
    }
    
    document.getElementById('ethBalances').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error loading ETH balances:', error);
  }
}

async function depositLidoHODL() {
  if (!earnState.ethWeb3 || !myaccounts) {
    await Swal.fire('Error', translateThis('Please connect your wallet first'), 'error');
    return;
  }
  
  try {
    // Get user's current position and min/max days
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    const userDeposit = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await lidoContract.methods.deposits(myaccounts).call()))));
    const minDays = parseInt(validation(DOMPurify.sanitize(await lidoContract.methods.mindays().call())));
    const maxDays = parseInt(validation(DOMPurify.sanitize(await lidoContract.methods.maxdays().call())));
    
    // Get ETH and stETH balances
    const ethBalance = validation(DOMPurify.sanitize(await earnState.ethWeb3.eth.getBalance(myaccounts)));
    const stETHContract = new earnState.ethWeb3.eth.Contract(
      [{
        "constant": true,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
      }],
      TREASURY_ADDRESSES.LIDO_STETH
    );
    const stETHBalance = validation(DOMPurify.sanitize(await stETHContract.methods.balanceOf(myaccounts).call()));
    
    const hasETH = earnState.ethWeb3.utils.toBN(ethBalance).gt(earnState.ethWeb3.utils.toBN('0'));
    const hasStETH = earnState.ethWeb3.utils.toBN(stETHBalance).gt(earnState.ethWeb3.utils.toBN('0'));
    const hasExistingDeposit = earnState.ethWeb3.utils.toBN(userDeposit.amount).gt(earnState.ethWeb3.utils.toBN('0'));
    
    // Build deposit form
    let depositOptions = '';
    if (hasETH) {
      depositOptions += '<option value="eth">' + translateThis('Deposit') + 'ETH (' + translateThis('will be swapped to stETH')+')</option>';
    }
    if (hasStETH) {
      depositOptions += '<option value="steth">' + translateThis('Deposit') + ' stETH</option>';
    }
    
    if (!hasETH && !hasStETH) {
      await Swal.fire('Error', translateThis('You need ETH or stETH on the Ethereum network to deposit'), 'error');
      return;
    }
    
    let incrementOption = '';
    if (hasExistingDeposit) {
      incrementOption = `
        <div style="margin-top: 5px;">
          <label style="display: flex; align-items: center;">
            <input type="checkbox" id="incrementLock" style="all: unset; font-size: 8px; display: inline-block; cursor: pointer; appearance: auto;
                  -webkit-appearance: checkbox; -moz-appearance: checkbox;"/>
            <span>`+translateThis(`Increase the lock time for all locked funds by the number of days specified. This will overwrite the previous unlock time.`)+`</span>
          </label>
        </div>
      `;
    }
    
    const result = await Swal.fire({
      title: 'Deposit to Lido HODL Vault',
      html: `
        <div style="text-align: left; max-height: 60vh; overflow-y: auto; overflow-x: hidden; padding-right: 5px;">
          <label>Deposit Type:</label>
          <select id="depositType" class="swal2-select" style="width: 100%;">
            ${depositOptions}
          </select>
          
          <label style="margin-top: 5px; display: block;">Amount:</label>
          <input type="number" id="depositAmountL" class="swal2-input" placeholder="0.0" step="0.001" style="width: 100%;" />
          
          <div id="timeSection" style="margin-top: 5px; display: block;">
            <label style="margin-top: 5px; display: block;">`+translateThis(`Lock Period`)+` (days, min: ${minDays}, max: ${maxDays}):</label>
            <input type="number" id="lockDays" class="swal2-input" placeholder="${minDays}" min="${minDays}" max="${maxDays}" style="width: 100%;" />
            <div id="lockEstimate" style="margin-top: 5px; font-size: 0.9em; color: #777;"></div>
          </div>
          
          ${incrementOption}
          
          <div id="slippageSection" style="margin-top: 5px; display: none;">
            <label>`+translateThis(`Slippage Tolerance`)+` (basis points, max 1000 = 10%):</label>
            <input type="number" id="slippageInput" class="swal2-input" value="100" min="1" max="1000" style="width: 100%;" />
            <div style="font-size: 0.85em; color: #777;">100 = 1%, 500 = 5%</div>
          </div>
          
          <div style="margin-top: 5px; padding: 10px; background: #f0f0f0; border-radius: 5px; font-size: 0.9em;">
            <strong>`+translateThis(`Important:`)+`</strong>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>`+translateThis(`100% of staking yields go to BAY stakers`)+`</li>
              <li>`+translateThis(`Your principal is locked until unlock date`)+`</li>
              <li>`+translateThis(`Lido is well-audited but carries contract risk`)+`</li>
            </ul>
          </div>
        </div>
      `,
      width: '450px',
      showCancelButton: true,
      confirmButtonText: 'Deposit',
      cancelButtonText: 'Cancel',
      didOpen: () => {
        const incLock = document.getElementById('incrementLock');
        const depositTypeSelect = document.getElementById('depositType');
        const slippageSection = document.getElementById('slippageSection');
        const lockDaysInput = document.getElementById('lockDays');
        const lockEstimate = document.getElementById('lockEstimate');
        document.getElementById('depositAmountL').value = document.getElementById('lidoDepositAmount').value;
        document.getElementById('lockDays').value = document.getElementById('lidoLockDays').value;
        if(hasExistingDeposit) {
          incLock.checked = false;
          incLock.addEventListener('change', (e) => {
            var lockval = document.getElementById('lidoLockDays').value;
            if(!isNaN(lockval)) {
              if(lockval < minDays) {
                lockval = minDays;
              }
              document.getElementById('lockDays').value = lockval;
            } else {
              document.getElementById('lockDays').value = minDays;
            }
            if (e.target.checked) {
              document.getElementById('timeSection').style.display = 'block';
            } else {
              document.getElementById('timeSection').style.display = 'none';
            }
          });
          document.getElementById('timeSection').style.display = 'none';
        }
        
        // Show/hide slippage based on deposit type
        depositTypeSelect.addEventListener('change', () => {
          if (depositTypeSelect.value === 'eth') {
            slippageSection.style.display = 'block';
          } else {
            slippageSection.style.display = 'none';
          }
        });

        incLock.addEventListener('click', () => {
          updateEstimate();
        });
        
        // Trigger initial check
        if (depositTypeSelect.value === 'eth') {
          slippageSection.style.display = 'block';
        }

        // Update lock estimate
        function updateEstimate() {
          const days = parseInt(lockDaysInput.value) || minDays;
          const months = Math.floor(days / 30);
          const years = Math.floor(days / 365);
          
          if (years > 0) {
            lockEstimate.textContent = `≈ ${years} year(s) ${Math.floor((days % 365) / 30)} month(s)`;
          } else if (months > 0) {
            lockEstimate.textContent = `≈ ${months} month(s)`;
          } else {
            lockEstimate.textContent = `${days} day(s)`;
          }
          var unlockDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
          if (hasExistingDeposit) {
            if (incLock.checked ==  false) {
               unlockDate = new Date(userDeposit.unlockTimestamp * 1000);
            }
          }
          lockEstimate.textContent += "  \n" + translateThis("Unlock date:") + ` ${unlockDate.toLocaleDateString()}`;
        }
        lockDaysInput.addEventListener('change', () => {
          updateEstimate();
        });
        lockDaysInput.addEventListener('input', () => {
          updateEstimate();
        });        
        updateEstimate();
      },
      preConfirm: () => {
        const depositType = document.getElementById('depositType').value;
        const amount = document.getElementById('depositAmountL').value;
        var lockDays = document.getElementById('lockDays').value;
        const increment = hasExistingDeposit ? document.getElementById('incrementLock').checked : false;
        const slippage = depositType === 'eth' ? document.getElementById('slippageInput').value : 0;
        
        if (!amount || amount === '' || amount === '0') {
          Swal.showValidationMessage(translateThis('Please enter a valid amount'));
          return false;
        }
        
        if (!lockDays || parseInt(lockDays) < minDays || parseInt(lockDays) > maxDays) {
          if(increment == false) {
            lockDays = minDays;
          } else {
            Swal.showValidationMessage(translateThis("Lock days must be between") + ` ${minDays} and ${maxDays}`);
            return false;
          }
        }
        return { depositType, amount, lockDays, increment, slippage };
      }
    });
    
    if (!result.isConfirmed) return;
    
    const { depositType, amount, lockDays, increment, slippage } = result.value;
    
    showSpinner();
    
    try {
      const BN = earnState.ethWeb3.utils.BN;
      const amountWei = earnState.ethWeb3.utils.toWei(amount, 'ether');
      
      if (depositType === 'eth') {
        // Show Curve trading disclaimer
        showDisclaimer();
        const tradeDisclaimer = await Swal.fire({
          title: translateThis('Trading Disclaimer'),
          html: '<p>' + translateThis('By proceeding, you acknowledge that the desired ETH will be traded into Lido Staked ETH through the decentralized exchange Curve. This implies you understand their terms and conditions and understand the implications of using cryptocurrency services.') + '</p>',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: translateThis('I Understand'),
          cancelButtonText: translateThis('Cancel')
        });

        
        if (!tradeDisclaimer.isConfirmed) {
          hideSpinner();
          return;
        }
        
        // Deposit ETH (will be swapped to stETH via Curve)
        await sendTx(lidoContract, "tradeAndLockStETH", [slippage, lockDays, increment], 500000, amountWei, true, true);
        
        await Swal.fire(translateThis('Success'), translateThis('ETH deposited and converted to stETH!'), 'success');
      } else {
        // Deposit stETH
        const stETHContract = new earnState.ethWeb3.eth.Contract(
          [{
            "constant": false,
            "inputs": [
              {"name": "spender", "type": "address"},
              {"name": "amount", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"name": "", "type": "bool"}],
            "type": "function"
          },
          {
            "constant": true,
            "inputs": [
              {"name": "owner", "type": "address"},
              {"name": "spender", "type": "address"}
            ],
            "name": "allowance",
            "outputs": [{"name": "", "type": "uint256"}],
            "type": "function"
          }],
          TREASURY_ADDRESSES.LIDO_STETH
        );
        
        // Check existing allowance before requesting approval
        const BN2 = BigNumber;
        const existingAllowance = String(await stETHContract.methods.allowance(myaccounts, TREASURY_ADDRESSES.LIDO_VAULT).call());
        if (new BN2(existingAllowance).lt(new BN2(amountWei))) {
          Swal.fire({
            icon: 'info',
            title: translateThis('Allowance'),
            text: translateThis('Authorizing stETH allowance...'),
            showConfirmButton: false
          });
          await delay(500);
          
          // Approve stETH
          await sendTx(stETHContract, "approve", [TREASURY_ADDRESSES.LIDO_VAULT, amountWei], 100000, "0", true, true);
        }
        
        Swal.fire({
          icon: 'info',
          title: translateThis('Depositing'),
          text: translateThis('Depositing stETH to vault...'),
          showConfirmButton: false
        });
        await delay(500);
        
        // Deposit stETH
        await sendTx(lidoContract, "lockStETH", [amountWei, lockDays, increment], 300000, "0", true, true);
        
        await Swal.fire(translateThis('Success'), translateThis('stETH deposited successfully!'), 'success');
      }
      
      hideSpinner();
      await refreshLidoInfo();
      
    } catch (error) {
      hideSpinner();
      console.log(error);
      const message = translateThis("Please check your browsers console for the full error message");
      await showScrollableError(translateThis('Transaction failed'), message);
    }
    
  } catch (error) {
    console.error('Error in depositLidoHODL:', error);
    await showScrollableError(translateThis('Error'), translateThis('Failed to prepare deposit'));
  }
}

async function withdrawLidoHODL() {
  if (!earnState.ethWeb3 || !myaccounts) {
    Swal.fire(translateThis('Error'), translateThis('Please connect your wallet first'), 'error');
    return;
  }
  
  try {
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    const userDeposit = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await lidoContract.methods.deposits(myaccounts).call()))));
    
    const BN = earnState.ethWeb3.utils.BN;
    if (new BN(userDeposit.amount).lte(new BN('0'))) {
      Swal.fire(translateThis('Error'), translateThis('You have no deposits to withdraw'), 'error');
      return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const unlockTime = parseInt(userDeposit.unlockTimestamp);
    const isLocked = now < unlockTime;
    
    if (isLocked) {
      const unlockDate = new Date(unlockTime * 1000);
      Swal.fire({
        title: translateThis('Funds Locked'),
        html: translateThis('Your funds are locked until') + ` <strong>${unlockDate.toLocaleString()}</strong>`,
        icon: 'info'
      });
      return;
    }
    
    const amountETH = earnState.ethWeb3.utils.fromWei(userDeposit.amount, 'ether');
    
    const result = await Swal.fire({
      title: translateThis('Withdraw from Lido HODL'),
      html: `
        <div style="text-align: left;">
          <p><strong>${translateThis('Available to withdraw')}:</strong> ${amountETH} stETH</p>
          <label style="margin-top: 15px; display: block;">${translateThis('Amount to withdraw')}:</label>
          <input type="number" id="withdrawAmount" class="swal2-input" placeholder="${amountETH}" max="${amountETH}" step="0.001" style="width: 100%;" />
          <div style="margin-top: 10px; font-size: 0.9em; color: #777;">${translateThis('Leave empty or enter full amount to withdraw everything')}</div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: translateThis('Withdraw'),
      cancelButtonText: translateThis('Cancel'),
      preConfirm: () => {
        const amount = document.getElementById('withdrawAmount').value;
        const BN = earnState.ethWeb3.utils.BN;
        const amountWei = userDeposit.amount; // Already in wei
        
        if (amount) {
          const inputWei = earnState.ethWeb3.utils.toWei(amount, 'ether');
          if (new BN(inputWei).lte(new BN('0')) || new BN(inputWei).gt(new BN(amountWei))) {
            Swal.showValidationMessage(translateThis('Amount must be between 0 and') + ` ${amountETH}`);
            return false;
          }
        }
        return amount || amountETH;
      }
    });
    
    if (!result.isConfirmed) return;
    
    const withdrawAmount = result.value;
    const withdrawAmountWei = earnState.ethWeb3.utils.toWei(withdrawAmount, 'ether');
    
    showSpinner();
    
    try {
      await sendTx(lidoContract, "withdrawStETH", [withdrawAmountWei], 300000, "0", true, true);
      
      hideSpinner();
      Swal.fire(translateThis('Success'), translateThis('Withdrew') + ` ${withdrawAmount} stETH ` + translateThis('successfully!'), 'success');
      await refreshLidoInfo();
      
    } catch (error) {
      hideSpinner();
      console.log(error);
      const message = translateThis("Please check your browsers console for the full error message");
      await showScrollableError(translateThis('Transaction failed'), message);
    }
    
  } catch (error) {
    console.error('Error in withdrawLidoHODL:', error);
    await showScrollableError(translateThis('Error'), translateThis('Failed to prepare withdrawal'));
  }
}

// ============================================================================
// STABLEVAULT FUNCTIONS
// ============================================================================

async function loadStableVaultInfo() {
  if (!earnState.polWeb3) return;
  
  try {
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    
    // Get total shares (represents total DAI in pool)
    const totalShares = validation(DOMPurify.sanitize(await stableContract.methods.totalShares().call()));
    const totalDAI = formatETHAmount(totalShares, 4);  // DAI has 18 decimals like ETH
    document.getElementById('stableTotalDAI').textContent = totalDAI;
    
    // Get current tick position
    const tickLower = validation(DOMPurify.sanitize(await stableContract.methods.tickLower().call()));
    const tickUpper = validation(DOMPurify.sanitize(await stableContract.methods.tickUpper().call()));
    document.getElementById('stableCurrentTick').textContent = `${tickLower} to ${tickUpper}`;
    
    // Check if position is in range using the contract's built-in function
    const isInRange = validation(DOMPurify.sanitize(await stableContract.methods.isInRange().call())) === true;
    document.getElementById('stableInRange').textContent = isInRange ? '✅ Yes' : '❌ No';
    
    // Get commission
    const commission = validation(DOMPurify.sanitize(await stableContract.methods.commission().call()));
    document.getElementById('stableCommission').textContent = commission;
    
    // Check which treasury it sends to
    const treasury = validation(DOMPurify.sanitize(await stableContract.methods.treasury().call()));
    const isBaylTreasury = treasury.toLowerCase() === TREASURY_ADDRESSES.BAYL_TREASURY.toLowerCase();
    document.getElementById('stableSendsTo').textContent = isBaylTreasury ? 'BAYL Liquid' : 'BAYR Reserve';
    
    // Calculate weekly rewards - fetch previous week's rewards for USDC and DAI
    const WEEK_SECONDS = 7 * 24 * 60 * 60;
    const currentWeek = Math.floor(Date.now() / 1000 / WEEK_SECONDS);
    const previousWeek = currentWeek - 1;
    
    // Calculate date range for the previous week
    const prevWeekStart = new Date(previousWeek * WEEK_SECONDS * 1000);
    const prevWeekEnd = new Date((previousWeek + 1) * WEEK_SECONDS * 1000 - 1);
    const formatDate = (date) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
    };
    const dateRange = `(${formatDate(prevWeekStart)} → ${formatDate(prevWeekEnd)})`;
    
    try {
      // Get previous week's rewards for DAI and USDC
      const BN = BigNumber;
      const daiRewards = await stableContract.methods.weeklyRewards(previousWeek, TREASURY_ADDRESSES.DAI).call();
      const usdcRewards = await stableContract.methods.weeklyRewards(previousWeek, TREASURY_ADDRESSES.USDC).call();
      
      // Convert to dollar amounts (DAI is 18 decimals, USDC is 6 decimals, both = $1)
      const daiDollars = new BN(daiRewards).dividedBy('1e18');
      const usdcDollars = new BN(usdcRewards).dividedBy('1e6');
      const totalWeeklyDollars = daiDollars.plus(usdcDollars);
      
      // Calculate estimated yearly rewards in dollars based on previous week's data
      //let yearlyRewardsDollars = '0';
      //if (totalWeeklyDollars.gt(0)) {
      //  yearlyRewardsDollars = totalWeeklyDollars.times(52).toFixed(4);
      //}
      
      document.getElementById('stableWeeklyRewards').textContent = `$${totalWeeklyDollars.toFixed(4, BN.ROUND_DOWN)} ${dateRange}`;
    } catch (weeklyError) {
      console.error('Error fetching weekly rewards:', weeklyError);
      document.getElementById('stableWeeklyRewards').textContent = 'N/A';
    }
    
    // Load user position if logged in
    if (myaccounts) {
      await loadUserStablePosition(stableContract, totalShares);
    }
    
  } catch (error) {
    console.error('Error loading StableVault info:', error);
  }
}

async function loadUserStablePosition(stableContract, totalShares) {
  try {
    const userShares = validation(DOMPurify.sanitize(await stableContract.methods.shares(myaccounts).call()));
    
    if (isGreaterThanZero(userShares)) {
      const BN = BigNumber;
      const userDAI = new BN(userShares).dividedBy('1e18').toFixed(8, BN.ROUND_DOWN);
      const percent = new BN(userShares).dividedBy(totalShares).times(100).toFixed(4, BN.ROUND_DOWN);
      
      document.getElementById('userStableDAI').textContent = stripZeros(userDAI);
      document.getElementById('userStablePercent').textContent = stripZeros(percent);
      
      // Calculate anticipated weekly profit (rough estimate)
      // This would be percent of weekly rewards minus commission
      //document.getElementById('userStableWeeklyProfit').textContent = '0.00';
      
      // Get pending fees
      const feeVault = validation(DOMPurify.sanitize(await stableContract.methods.feeVault().call()));
      const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
      const pendingFees = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await feeVaultContract.methods.pendingFees(myaccounts).call()))));
      
      const pendingDAI = new BN(pendingFees[0]).dividedBy('1e18');
      const pendingUSDC = new BN(pendingFees[1]).dividedBy('1e6');
      const totalPendingUSD = new BN(pendingDAI).plus(new BN(pendingUSDC)).toFixed(8, BN.ROUND_DOWN);
      
      document.getElementById('userStablePendingFees').textContent = stripZeros(totalPendingUSD);
      document.getElementById('userStablePosition').classList.remove('hidden');
      
      // Check current sendTo setting and update dropdown
      const sendTo = validation(DOMPurify.sanitize(await feeVaultContract.methods.sendTo(myaccounts).call()));
      const dropdown = document.getElementById('stableProfitDestination');
      if (dropdown) {
        if (sendTo === '0x0000000000000000000000000000000000000000' || sendTo.toLowerCase() === myaccounts.toLowerCase()) {
          dropdown.value = 'user';
        } else if (sendTo.toLowerCase() === TREASURY_ADDRESSES.BAYL_DAI_UNISWAP.toLowerCase()) {
          dropdown.value = 'bayl';
        } else if (sendTo.toLowerCase() === TREASURY_ADDRESSES.BAYR_DAI_UNISWAP.toLowerCase()) {
          dropdown.value = 'bayr';
        } else {
          dropdown.value = 'custom';
          dropdown.dataset.customAddress = sendTo;
        }
        dropdown.dataset.currentSendTo = sendTo;
        dropdown.dataset.previousValue = dropdown.value;
      }
    }
  } catch (error) {
    console.error('Error loading user StableVault position:', error);
  }
}

async function depositStableVault() {
  if (!earnState.polWeb3 || !myaccounts) {
    Swal.fire(translateThis('Error'), translateThis('Please connect your wallet first'), 'error');
    return;
  }
  
  const amount = document.getElementById('stableDepositAmount').value;
  const profitDestination = document.getElementById('stableProfitDestination').value;
  
  const BN = BigNumber;
  if (!amount || new BN(amount).lte(new BN('0'))) {
    Swal.fire(translateThis('Error'), translateThis('Please enter a valid DAI amount'), 'error');
    return;
  }
  
  // Show trading disclaimer first
  var result = await Swal.fire({
    title: translateThis('StableVault Deposit'),
    html: `
      <p><strong>${translateThis('Disclaimer')}:</strong></p>
      <ul style="text-align: left;">
        <li>${translateThis('Stablecoin pairs are very low risk but you should always audit the source code. BitBay is a community-driven project and not responsible for bugs, errors, or omissions. The stablecoin position is managed by stakers within very tight ranges for security and to get the best yield. Impermanent loss is very unlikely due to these hard coded protections. DAI and USDC are bridged tokens so you should understand their risks. UniSwap V4 risks also apply so please do your due diligence.')}</li>
      </ul>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: translateThis('I Understand, Continue'),
    cancelButtonText: translateThis('Cancel')
  });
  
  if (!result.isConfirmed) return;
  
  try {
    showSpinner();
    result = await checkPoolHealth();
    if (!result) {
      hideSpinner();
      return;
    }    
    const amountWei = earnState.polWeb3.utils.toWei(amount, 'ether');
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const feeVault = validation(DOMPurify.sanitize(await stableContract.methods.feeVault().call()));
    const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
    
    // Check current sendTo setting
    const currentSendTo = validation(DOMPurify.sanitize(await feeVaultContract.methods.sendTo(myaccounts).call()));
    let targetSendTo = myaccounts; // Default to user
    
    if (profitDestination === 'bayl') {
      targetSendTo = TREASURY_ADDRESSES.BAYL_DAI_UNISWAP;
    } else if (profitDestination === 'bayr') {
      targetSendTo = TREASURY_ADDRESSES.BAYR_DAI_UNISWAP;
    } else if (profitDestination === 'custom') {
      const dropdown = document.getElementById('stableProfitDestination');
      const customAddr = DOMPurify.sanitize((dropdown?.dataset.customAddress || '').trim());
      if (!/^0x[0-9a-fA-F]{40}$/.test(customAddr)) {
        hideSpinner();
        Swal.fire(translateThis('Error'), translateThis('Please enter a valid Ethereum address'), 'error');
        return;
      }
      targetSendTo = customAddr;
    }
    
    // Only call changeSendTo if it's different from current setting
    const needsUpdate = currentSendTo === '0x0000000000000000000000000000000000000000' || 
                       currentSendTo.toLowerCase() !== targetSendTo.toLowerCase();
    
    if (needsUpdate && profitDestination !== 'user') {
      Swal.fire({
        icon: 'info',
        title: translateThis('Setting Profit Destination'),
        text: translateThis('Configuring where your profits will be sent...'),
        showConfirmButton: false
      });
      await delay(500);
      await sendTx(feeVaultContract, "changeSendTo", [targetSendTo], 200000, "0", true, false);
    }
    
    // Approve DAI (check allowance first)
    const daiContract = new earnState.polWeb3.eth.Contract(
      [{
        "constant": false,
        "inputs": [
          {"name": "spender", "type": "address"},
          {"name": "amount", "type": "uint256"}
        ],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {"name": "owner", "type": "address"},
          {"name": "spender", "type": "address"}
        ],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
      }],
      TREASURY_ADDRESSES.DAI
    );
    
    // Check existing allowance before requesting approval
    const existingAllowance = String(await daiContract.methods.allowance(myaccounts, TREASURY_ADDRESSES.STABLE_POOL).call());
    if (new BN(existingAllowance).lt(new BN(amountWei))) {
      Swal.fire({
        icon: 'info',
        title: translateThis('Allowance'),
        text: translateThis('Authorizing DAI allowance...'),
        showConfirmButton: false
      });
      
      await sendTx(daiContract, "approve", [TREASURY_ADDRESSES.STABLE_POOL, amountWei], 100000, "0", false, false);
    }
    
    Swal.fire({
      icon: 'info',
      title: translateThis('Depositing'),
      text: translateThis('Depositing DAI to StableVault...'),
      showConfirmButton: false
    });
    await delay(500);
    
    // Deposit with 5 minute deadline
    const deadline = Math.floor(Date.now() / 1000) + 300;
    await sendTx(stableContract, "deposit", [amountWei, deadline], 2000000, "0", true, false);
    
    hideSpinner();
    await Swal.fire(translateThis('Success'), translateThis('Deposit successful!'), 'success');
    await refreshStableVaultInfo();
    
  } catch (error) {
    hideSpinner();
    console.log(error);
    const message = translateThis("Please check your browsers console for the full error message");
    await showScrollableError(translateThis('Transaction failed'), message);
  }
}

async function checkPoolHealth() {
  if (!earnState.polWeb3) return false;

  try {
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const BN = BigNumber;

    // 1. Get Total Assets (Liquidity + Dust)
    // Defined in StableVault.sol, returns: positionValue + daiBal + usdcBal (normalized)
    var totalAssets = new BN(validation(DOMPurify.sanitize(await stableContract.methods.getTotalAssets().call())));

    // 2. Get Total Shares
    const totalShares = new BN(validation(DOMPurify.sanitize(await stableContract.methods.totalShares().call())));

    // If pool is empty, it is considered healthy for first depositor
    if (totalShares.eq(0)) return true;

    // 3. Calculate the 98% threshold
    // If Assets < (Shares * 0.98), the pool is underwater by > 2%
    const threshold = totalShares.times(0.98);
    console.log(threshold.toString());
    console.log(totalAssets.toString());

    if (totalAssets.lt(threshold)) {
      // Calculate current health percentage for display
      const healthPercent = totalAssets.div(totalShares).times(100).toFixed(2, BN.ROUND_DOWN);
      
      // Alert the user and let them choose
      const result = await Swal.fire({
        title: translateThis('Pool Value Warning'),
        html: `
          <p><strong>${translateThis('Health')}: ${healthPercent}%</strong></p>
          <p>${translateThis('The StableVault is currently under valued. This can happen if it repositions too frequently or when there is impermanent loss or changes in stablecoin prices.')}</p>          
          <p>${translateThis('The total liquidity plus dust is less than the total shares by more than 2%. Depositing now effectively pays off this debt and may result in immediate loss of value.')}</p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: translateThis('I Understand, Deposit Anyway'),
        cancelButtonText: translateThis('Cancel Deposit'),
        confirmButtonColor: '#d33'
      });

      return result.isConfirmed;
    }

    return true; // Pool is healthy

  } catch (error) {
    console.error("Error checking pool health:", error);
    throw new Error("Error checking pool health");
  }
}

async function collectStableFees() {
  if (!earnState.polWeb3 || !myaccounts) {
    await Swal.fire(translateThis('Error'), translateThis('Please connect your wallet first'), 'error');
    return;
  }
  
  try {
    showSpinner();
    
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const feeVault = validation(DOMPurify.sanitize(await stableContract.methods.feeVault().call()));
    const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
    
    await sendTx(feeVaultContract, "claim", [], 500000, "0", true, false);
    
    hideSpinner();
    await Swal.fire(translateThis('Success'), translateThis('Fees collected!'), 'success');
    await refreshStableVaultInfo();
    
  } catch (error) {
    hideSpinner();
    console.log(error);
    const message = translateThis("Please check your browsers console for the full error message");
    await showScrollableError(translateThis('Transaction failed'), message);
  }
}

async function withdrawStableVault() {
  if (!earnState.polWeb3 || !myaccounts) {
    await Swal.fire(translateThis('Error'), translateThis('Please login to withdraw'), 'error');
    return;
  }
  
  const result = await Swal.fire({
    title: translateThis('Withdraw from StableVault'),
    input: 'number',
    inputLabel: translateThis('Percentage to withdraw (1-100)'),
    inputPlaceholder: '100',
    showCancelButton: true,
    inputValidator: (value) => {
      const BN = BigNumber;
      if (!value || new BN(value).lte(new BN('0')) || new BN(value).gt(new BN('100'))) {
        return translateThis('Please enter a valid percentage (1-100)');
      }
    }
  });
  
  if (!result.isConfirmed) return;
  
  try {
    showSpinner();
    
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const userShares = validation(DOMPurify.sanitize(await stableContract.methods.shares(myaccounts).call()));
    
    const BN = BigNumber;
    const withdrawPercent = new BN(result.value);
    const withdrawShares = new BN(userShares).times(withdrawPercent).div(new BN('100')).integerValue(BN.ROUND_DOWN);
    
    const deadline = Math.floor(Date.now() / 1000) + 300;
    
    //Only compact dust if there is enough to avoid USDC slippage truncation
    const daiTokenDust = new earnState.polWeb3.eth.Contract(ERC20ABI, TREASURY_ADDRESSES.DAI);
    const daiDust = validation(DOMPurify.sanitize(await daiTokenDust.methods.balanceOf(TREASURY_ADDRESSES.STABLE_POOL).call()));
    const addDust = new BN(daiDust).gt(new BN('10000000000000000'));
    await sendTx(stableContract, "withdraw", [withdrawShares.toString(), deadline, addDust], 1000000, "0", true, false);
    
    hideSpinner();
    await Swal.fire(translateThis('Success'), translateThis('Withdrawal successful!'), 'success');
    await refreshStableVaultInfo();
    
  } catch (error) {
    hideSpinner();
    console.log(error);
    const message = translateThis("Please check your browsers console for the full error message");
    await showScrollableError(translateThis('Transaction failed'), message);
  }
}

async function verifyUniswapPosition() {
  if (!earnState.polWeb3) return false;

  try {
    const web3 = earnState.polWeb3;
    const BN = web3.utils.BN;

    // 1. Get Vault Parameters
    const stableContract = new web3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const tickLower = await stableContract.methods.tickLower().call();
    const tickUpper = await stableContract.methods.tickUpper().call();
    
    // Note: In StableVault.sol constructor, salt is hardcoded to bytes32(uint256(1))
    // salt = 0x0000000000000000000000000000000000000000000000000000000000000001
    const salt = web3.utils.padLeft('0x1', 64);

    // 2. Define the Pool Key (Must match StableVault.sol)
    // StableVault.sol uses: DAI, USDC, FEE=50, TICK_SPACING=1, hooks=address(0)
    // Important: Currency0/1 must be sorted numerically
    const tokenA = TREASURY_ADDRESSES.DAI.toLowerCase();
    const tokenB = TREASURY_ADDRESSES.USDC.toLowerCase();
    
    const [currency0, currency1] = tokenA < tokenB 
      ? [tokenA, tokenB] 
      : [tokenB, tokenA];

    const fee = 50;
    const tickSpacing = 1;
    const hooks = '0x0000000000000000000000000000000000000000'; // address(0)

    // 3. Calculate Global Pool ID (keccak256(abi.encode(PoolKey)))
    // Structure: address, address, uint24, int24, address
    const poolKeyEncoded = web3.eth.abi.encodeParameters(
      ['address', 'address', 'uint24', 'int24', 'address'],
      [currency0, currency1, fee, tickSpacing, hooks]
    );
    const poolId = web3.utils.keccak256(poolKeyEncoded);

    // 4. Calculate Position ID (keccak256(abi.encodePacked(owner, lower, upper, salt)))
    // Owner is the StableVault contract address itself
    const owner = TREASURY_ADDRESSES.STABLE_POOL;

    // encodePacked is tricky in standard web3.js 1.x, we simulate it by concatenation
    // But since we are using web3.js, we can use encodeParameters but we need to match solidity's packed behavior.
    // However, solidityPackedKeccak256 is cleaner. 
    // Since we might not have ethers here, let's use web3.utils.soliditySha3
    const positionId = web3.utils.soliditySha3(
      { t: 'address', v: owner },
      { t: 'int24', v: tickLower },
      { t: 'int24', v: tickUpper },
      { t: 'bytes32', v: salt }
    );

    console.log(`[Verify] Pool ID: ${poolId}`);
    console.log(`[Verify] Position ID: ${positionId}`);

    // 5. Query the Official Uniswap State View
    // Interface: function getPositionLiquidity(bytes32 poolId, bytes32 positionId) external view returns (uint128 liquidity)
    const stateViewContract = new web3.eth.Contract(
      [{
        "inputs": [
          { "internalType": "bytes32", "name": "poolId", "type": "bytes32" },
          { "internalType": "bytes32", "name": "positionId", "type": "bytes32" }
        ],
        "name": "getPositionLiquidity",
        "outputs": [{ "internalType": "uint128", "name": "liquidity", "type": "uint128" }],
        "stateMutability": "view",
        "type": "function"
      }],
      TREASURY_ADDRESSES.UNISWAP_V4_STATE_VIEW
    );

    const liquidity = await stateViewContract.methods.getPositionLiquidity(poolId, positionId).call();
    
    if (new BN(liquidity).gt(new BN(0))) {
      console.log(`✅ Position Verified in Uniswap Core. Liquidity: ${liquidity}`);
      return true;
    } else {
      console.warn(`❌ Position not found or empty in Uniswap Core.`);
      return false;
    }

  } catch (error) {
    console.error('Error verifying Uniswap position:', error);
    return false;
  }
}

async function verifyTotalPoolLiquidity() {
  if (!earnState.polWeb3) return;

  try {
    const web3 = earnState.polWeb3;
    const BN = web3.utils.BN;

    // 1. RE-CALCULATE POOL ID (Same as before)
    const ADDR_DAI = TREASURY_ADDRESSES.DAI;
    const ADDR_USDC = TREASURY_ADDRESSES.USDC;
    const isUSDCZero = ADDR_USDC.toLowerCase() < ADDR_DAI.toLowerCase();
    const currency0 = isUSDCZero ? ADDR_USDC : ADDR_DAI;
    const currency1 = isUSDCZero ? ADDR_DAI : ADDR_USDC;

    const poolKey = {
      currency0: currency0,
      currency1: currency1,
      fee: 50,
      tickSpacing: 1,
      hooks: '0x0000000000000000000000000000000000000000'
    };

    const encodedKey = web3.eth.abi.encodeParameters(
      ['address', 'address', 'uint24', 'int24', 'address'],
      [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
    );
    const poolId = web3.utils.keccak256(encodedKey);

    // 2. GET TOTAL ACTIVE LIQUIDITY FROM UNISWAP CORE (STATE VIEW)
    // We need the interface for `getLiquidity(poolId)`
    // This returns the 'L' value active at the current tick for the ENTIRE pool.
    const stateViewAbi = [{
      "inputs": [{"internalType": "bytes32","name": "poolId","type": "bytes32"}],
      "name": "getLiquidity",
      "outputs": [{"internalType": "uint128","name": "liquidity","type": "uint128"}],
      "stateMutability": "view", "type": "function"
    }];

    const stateView = new web3.eth.Contract(stateViewAbi, TREASURY_ADDRESSES.UNISWAP_V4_STATE_VIEW);
    
    // Total Liquidity (Everyone combined)
    const totalLiquidity = new BN(await stateView.methods.getLiquidity(poolId).call());

    // 3. GET YOUR VAULT'S LIQUIDITY
    const stableVault = new web3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const myLiquidity = new BN(await stableVault.methods.liquidity().call());

    // 4. COMPARE
    console.log("--- LIQUIDITY CHECK ---");
    console.log(`Total Global Liquidity: ${totalLiquidity.toString()}`);
    console.log(`My Vault Liquidity:     ${myLiquidity.toString()}`);

    let statusMsg = "";
    
    if (totalLiquidity.eq(new BN(0))) {
      statusMsg = "⚠️ POOL IS EMPTY (Zero Liquidity)";
    } else if (totalLiquidity.eq(myLiquidity)) {
      statusMsg = "👻 YOU ARE ALONE! (100% of Liquidity is Yours)";
    } else if (myLiquidity.gt(new BN(0))) {
      // Calculate your share
      // Note: totalLiquidity might be slightly different due to rounding or tick boundaries,
      // but if total >> myLiquidity, there are others.
      const share = myLiquidity.mul(new BN(100)).div(totalLiquidity);
      statusMsg = `✅ SHARED POOL: You own approx ${share.toString()}% of active liquidity.`;
    } else {
      statusMsg = "ℹ️ You have 0 liquidity, but the pool is active with others.";
    }

    console.log(statusMsg);

    await Swal.fire({
      title: 'Liquidity Analysis',
      html: `
        <p><strong>Total Pool Liquidity:</strong> ${totalLiquidity.toString()}</p>
        <p><strong>Your Vault Liquidity:</strong> ${myLiquidity.toString()}</p>
        <hr>
        <p><strong>Status:</strong> ${statusMsg}</p>
      `,
      icon: 'info'
    });

  } catch (e) {
    console.error("Liquidity check failed:", e);
    // Note: If getLiquidity() fails, it usually means the pool doesn't exist yet
    await Swal.fire("Error", "Pool likely not initialized or there was an error checking the liquidity.", "error");
  }
}

// ============================================================================
// STAKING FUNCTIONS
// ============================================================================

async function toggleStaking() {
  const checkbox = document.getElementById('stakingEnabledCheckbox');
  
  // Check if user is logged in with Metamask
  if (checkbox.checked && loginType === 1) {
    // Show prompt to unlock with private key
    const result = await Swal.fire({
      title: translateThis('Staking with Metamask'),
      html: `
        <div style="text-align: left; max-height: 400px; overflow-y: auto;">
          <p>${translateThis('In order to stake this tab must be left in focus with the wallet unlocked. For your security, Metamask does not reveal the private key for your connected account.')}</p>
          <br>
          <p>${translateThis('It is recommended that you connect to this site using a password instead of Metamask. However if you wish to stake with Metamask you may unlock your wallet directly using your private key.')}</p>
          <br>
          <p><strong>${translateThis('Security Notice')}:</strong> ${translateThis('We only recommend this option if you trust the source code of this site. You may also wish to run the code locally. You are responsible for risks of direct key handling.')}</p>
          <br>
          <p>${translateThis('If you agree, you may continue and unlock your wallet using your private key.')}</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: translateThis('Unlock with Private Key'),
      cancelButtonText: translateThis('Cancel'),
      width: 550
    });
    
    if (!result.isConfirmed) {
      // User cancelled, uncheck the checkbox
      checkbox.checked = false;
      earnState.stakingEnabled = false;
      return;
    }
    
    // Prompt for private key
    const pkResult = await Swal.fire({
      title: translateThis('Enter Private Key'),
      html: `
        <div style="text-align: left;">
          <p>${translateThis('Enter the private key for your connected wallet')}:</p>
          <p style="font-size: 0.9em; color: #777;">${translateThis('Address')}: ${myaccounts}</p>
          <input type="password" id="privateKeyInput" class="swal2-input" placeholder="${translateThis('Private Key (with or without 0x)')}" style="width: 100%;">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: translateThis('Unlock'),
      cancelButtonText: translateThis('Cancel'),
      preConfirm: () => {
        let pk = document.getElementById('privateKeyInput').value.trim();
        if (!pk) {
          Swal.showValidationMessage(translateThis('Please enter a private key'));
          return false;
        }
        // Add 0x prefix if not present
        if (!pk.startsWith('0x')) {
          pk = '0x' + pk;
        }
        // Validate private key format (should be 66 chars with 0x)
        if (pk.length !== 66 || !/^0x[a-fA-F0-9]{64}$/.test(pk)) {
          Swal.showValidationMessage(translateThis('Invalid private key format'));
          return false;
        }
        return pk;
      }
    });
    
    if (!pkResult.isConfirmed) {
      // User cancelled, uncheck the checkbox
      checkbox.checked = false;
      earnState.stakingEnabled = false;
      return;
    }
    
    const privateKey = pkResult.value;
    
    // Verify the private key matches the connected address
    try {
      const account = web3.eth.accounts.privateKeyToAccount(privateKey);
      if (account.address.toLowerCase() !== myaccounts.toLowerCase()) {
        await Swal.fire(translateThis('Error'), translateThis('The private key does not match your connected wallet address.'), 'error');
        checkbox.checked = false;
        earnState.stakingEnabled = false;
        return;
      }
      
      // Add the account to web3
      web3.eth.accounts.wallet.add(privateKey);
      
      // Update loginType to behave like password login
      loginType = 2;
      earnState.isPasswordLogin = true;
      
      await Swal.fire({
        icon: 'success',
        title: translateThis('Wallet Unlocked'),
        text: translateThis('Your wallet has been unlocked for staking. You can now enable automated staking.'),
        timer: 3000
      });
      
    } catch (error) {
      console.error('Error verifying private key:', error);
      await Swal.fire(translateThis('Error'), translateThis('Failed to verify private key. Please check that it is correct.'), 'error');
      checkbox.checked = false;
      earnState.stakingEnabled = false;
      return;
    }
  }
  
  earnState.stakingEnabled = checkbox.checked;
  
  localStorage.setItem(myaccounts+'earnStakingEnabled', earnState.stakingEnabled ? 'true' : 'false');
  
  if (earnState.stakingEnabled) {
    startStakingAutomation();
    document.getElementById('stakingAutomationInfo').classList.remove('hidden');
  } else {
    stopStakingAutomation();
    document.getElementById('stakingAutomationInfo').classList.add('hidden');
  }
}

function startStakingAutomation() {
  if (earnState.stakingInterval) {
    clearInterval(earnState.stakingInterval);
  }
  
  // Generate random delay (0-3 minutes)
  earnState.randomDelaySeconds = Math.floor(Math.random() * 180);
  
  console.log('Starting staking automation with random delay:', earnState.randomDelaySeconds, 'seconds');
  
  // Check staking conditions
  earnState.stakingInterval = setInterval(checkStakingConditions, 180000 + (earnState.randomDelaySeconds * 1000));
  
  // Do initial check
  checkStakingConditions();
}

function stopStakingAutomation() {
  if (earnState.stakingInterval) {
    clearInterval(earnState.stakingInterval);
    earnState.stakingInterval = null;
  }
  
  console.log('Staking automation stopped');
}

async function checkStakingConditions() {
  if (!earnState.stakingEnabled || !earnState.isPasswordLogin || !myaccounts) {
    return;
  }
  
  console.log('Checking staking conditions...');
  
  try {
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    const userInfo = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.accessPool(myaccounts).call()))));
    
    // Check if user has any stake
    if (parseInt(userInfo.shares) === 0) {
      console.log('No stake, skipping automation');
      return;
    }
    
    // Check POL balance
    const polBalance = validation(DOMPurify.sanitize(await earnState.polWeb3.eth.getBalance(myaccounts)));
    const BN = BigNumber;
    const polBalanceEther = new BN(polBalance).dividedBy('1e18');
    
    if (polBalanceEther.lt(new BN('10'))) {
      console.log('POL balance too low, pausing staking');
      earnState.stakingEnabled = false;
      document.getElementById('stakingEnabledCheckbox').checked = false;
      localStorage.setItem(myaccounts+'earnStakingEnabled', 'false');
      Swal.fire(translateThis('Warning'), translateThis('Staking paused due to low POL balance (< 10)'), 'warning');
      return;
    }
    
    // Get refresh rate and check if user needs to refresh their vault
    const refreshRate = validation(DOMPurify.sanitize(await baylTreasury.methods.refreshRate().call()));
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const timeSinceRefresh = currentTimestamp - parseInt(userInfo.lastRefresh);
    const refreshThreshold = parseInt(refreshRate) * 0.85; // 85% of refresh period
    
    // Check if user is close to needing a refresh (85% into their refresh period)
    if (timeSinceRefresh >= refreshThreshold && parseInt(userInfo.shares) > 0) {
      console.log('User is close to refresh deadline, refreshing vault...');
      logToConsole('Refreshing vault before deadline...');
      const res = await sendTx(baylTreasury, "refreshVault", [myaccounts], 1500000, "0", false, false, false);
      logToConsole(res);
      return;
    }
    
    // Get current block and interval info
    const currentBlock = parseInt(validation(DOMPurify.sanitize(await earnState.polWeb3.eth.getBlockNumber())));
    const claimRate = validation(DOMPurify.sanitize(await baylTreasury.methods.claimRate().call()));
    const votePeriod = validation(DOMPurify.sanitize(await baylTreasury.methods.votePeriod().call()));
    const currentInterval = Math.floor(currentBlock / parseInt(claimRate));
    const blockInInterval = currentBlock % parseInt(claimRate);
    const registrationEndBlock = Math.floor(parseInt(claimRate) * (100 - parseInt(votePeriod)) / 100);
    const isInRegistrationPeriod = blockInInterval < registrationEndBlock;
    const isInVotePeriod = !isInRegistrationPeriod;

    // Check if user's interval is behind current interval (user needs to register for new interval)
    if (parseInt(userInfo.interval) < currentInterval) {
      // User needs to call updateShares to register for new interval
      // This should be done during registration period (first 75% of interval)
      if (isInRegistrationPeriod) {
        console.log('User interval is behind current, calling updateShares to register...');
        logToConsole('Registering for new staking interval...');
        const res = await sendTx(baylTreasury, "updateShares", [], 300000, "0", false, false, false);
        logToConsole(res);
        return;
      }
    }
    
    console.log('Time to execute staking tasks!');
    
    // Registration period tasks (first 75%): maintenance, calling profits, refresh
    // Each task has its own internal checks to prevent spamming (pending amounts, time limits, etc.)
    if (isInRegistrationPeriod) {
      // 1. Check if previous epoch vote needs execution
      await checkAndExecuteVote();
      
      // 2. Check Flow contract for pending ETH
      await checkAndDripFlow();
      
      // 3. Check Lido for yield to harvest
      await checkAndHarvestLido();
      
      // 4. Check StableVault position management
      await checkAndManageStableVault();
    }
    
    // Vote period tasks (last 25%): claim rewards and vote
    if (isInVotePeriod) {
      // Only claim rewards during vote period when user is participating
      if (parseInt(userInfo.interval) === currentInterval) {
        await claimStakingRewards();
      }
    }    
  } catch (error) {
    console.error('Error in staking automation:', error);
  }
}

async function checkAndExecuteVote() {
  try {
    const voteContract = new earnState.polWeb3.eth.Contract(stakingABI, TREASURY_ADDRESSES.VOTE_BAYL);
    const currentEpoch = parseInt(validation(DOMPurify.sanitize(await voteContract.methods.currentEpoch().call())));
    const prevEpoch = currentEpoch - 1;
    
    // Check if previous epoch needs execution
    if (prevEpoch >= 0) {
      const epochData = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await voteContract.methods.epochs(prevEpoch).call()))));
      
      if (!epochData.executed) {
        // Check if there is a winner
        const winner = validation(DOMPurify.sanitize(await voteContract.methods.winningHash(prevEpoch).call()));
        
        if (winner && winner !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          logToConsole(`Executing winning vote for epoch ${prevEpoch}...`);
          const tx = await sendTx(voteContract, "confirmVotes", [prevEpoch], 3000000, "0", false, false, false);
          logToConsole(`Vote execution successful for epoch ${prevEpoch}, tx: ${tx}`);
        }
      }
    }
  } catch (error) {
    console.error('Error checking/executing vote:', error);
    logToConsole(`Error with vote execution: Please check your browsers console to see the error message`);
  }
}

async function checkAndDripFlow() {
  try {
    const flowContract = new earnState.polWeb3.eth.Contract(flowABI, TREASURY_ADDRESSES.FLOW_BAYL);
    const wethContract = new earnState.polWeb3.eth.Contract(ERC20ABI, TREASURY_ADDRESSES.WETH);
    
    // Check WETH balance in flow contract
    const wethBalance = validation(DOMPurify.sanitize(await wethContract.methods.balanceOf(TREASURY_ADDRESSES.FLOW_BAYL).call()));
    if (!isGreaterThanZero(wethBalance)) {
      return; // No WETH to drip
    }
    
    // Get flow contract state to check if it's time to drip
    const startBlock = parseInt(validation(DOMPurify.sanitize(await flowContract.methods.startBlock().call())));
    const dripInterval = parseInt(validation(DOMPurify.sanitize(await flowContract.methods.dripInterval().call())));
    const totalIntervals = parseInt(validation(DOMPurify.sanitize(await flowContract.methods.totalIntervals().call())));
    const lastDripInterval = parseInt(validation(DOMPurify.sanitize(await flowContract.methods.lastDripInterval().call())));
    const currentBlock = parseInt(validation(DOMPurify.sanitize(await earnState.polWeb3.eth.getBlockNumber())));
    
    let shouldDrip = false;
    
    if (startBlock === 0) {
      // Fresh start - new cycle begins, drip will initialize
      shouldDrip = true;
      logToConsole(`Flow contract starting new drip cycle with ${displayETHAmount(wethBalance, 8)} WETH...`);
    } else {
      // Calculate current interval and check if intervals have passed
      const currentInterval = Math.min(Math.floor((currentBlock - startBlock) / dripInterval), totalIntervals);
      const intervalsPassed = currentInterval - lastDripInterval;
      
      if (intervalsPassed > 0) {
        shouldDrip = true;
        const pending = validation(DOMPurify.sanitize(await flowContract.methods.pendingDrip().call()));
        const pendingETH = displayETHAmount(pending, 8);
        logToConsole(`Flow contract has ${pendingETH} WETH pending (interval ${currentInterval}/${totalIntervals}), calling drip...`);
      }
    }
    
    if (shouldDrip) {
      const tx = await sendTx(flowContract, "drip", [], 200000, "0", false, false, false);
      logToConsole(`Flow drip successful, tx: ${tx}`);
    }
  } catch (error) {
    console.error('Error checking/dripping flow:', error);
    logToConsole(`Error with flow/drip: Please check your browsers console to see the error message`);
  }
}

async function checkAndHarvestLido() {
  try {
    if (!earnState.ethWeb3) return;
    
    const lidoContract = new earnState.ethWeb3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
    const availableYield = validation(DOMPurify.sanitize(await lidoContract.methods.availableYield().call()));
    const BN = earnState.ethWeb3.utils.BN;
    
    // Check if yield exceeds 0.005 ETH
    if (new BN(availableYield).gt(new BN(earnState.minLido))) {
      // Check ETH balance for gas
      const ethBalance = validation(DOMPurify.sanitize(await earnState.ethWeb3.eth.getBalance(myaccounts)));
      const BN2 = BigNumber;
      const ethBalanceETH = new BN2(ethBalance).dividedBy('1e18');
      
      if (ethBalanceETH.lt(new BN2('0.0025'))) {
        logToConsole('Not enough ETH gas to harvest Lido yield');
        document.getElementById('stakingEthGasWarning').classList.remove('hidden');
        return;
      }
      
      // Estimate gas cost
      const ethGasPrice = validation(DOMPurify.sanitize(await earnState.ethWeb3.eth.getGasPrice()));
      const estimatedGas = 700000;
      const gasCostWei = new BN(ethGasPrice).mul(new BN(estimatedGas));
      
      // Check if gas cost is less than 25% of available yield
      if (gasCostWei.mul(new BN('4')).lt(new BN(availableYield))) {
        // Check time since last collection based on balance
        const totalPrincipal = validation(DOMPurify.sanitize(await lidoContract.methods.totalPrincipal().call()));
        const principalETH = new BN2(totalPrincipal).dividedBy('1e18');
        const minimumTime = principalETH.gt(new BN2('5')) ? 4 * 24 * 60 * 60 : 14 * 24 * 60 * 60;
        
        const lastCollection = parseInt(localStorage.getItem(myaccounts+'lidoLastCollection') || '0');
        const now = Math.floor(Date.now() / 1000);
        
        if (now - lastCollection > minimumTime) {
          const yieldETH = stripZeros(new BN2(availableYield).dividedBy('1e18').toFixed(8, BN.ROUND_DOWN));
          logToConsole(`Harvesting ${yieldETH} ETH from Lido vault...`);
          
          const tx = await sendTx(lidoContract, "harvestAndSwapToETH", [100, 0], estimatedGas, "0", false, true, false);
          
          localStorage.setItem(myaccounts+'lidoLastCollection', now.toString());
          logToConsole(`Lido harvest successful, tx: ${tx}`);
        }
      }
    }
  } catch (error) {
    console.error('Error checking/harvesting Lido:', error);
    logToConsole(`Error with Lido Harvest: Please check your browsers console to see the error message`);
  }
}

async function checkAndManageStableVault() {
  try {
    const stableContract = new earnState.polWeb3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);
    const feeVault = validation(DOMPurify.sanitize(await stableContract.methods.feeVault().call()));
    const feeVaultContract = new earnState.polWeb3.eth.Contract(stableVaultFeesABI, feeVault);
    const BN = BigNumber;
    // Part 1: Check if user is donating and has pending fees > $1
    const userShares = validation(DOMPurify.sanitize(await feeVaultContract.methods.shares(myaccounts).call()));
    var now;
    if (isGreaterThanZero(userShares)) {
      const sendTo = validation(DOMPurify.sanitize(await feeVaultContract.methods.sendTo(myaccounts).call()));
      const isDonating = sendTo !== '0x0000000000000000000000000000000000000000' && 
                        sendTo.toLowerCase() !== myaccounts.toLowerCase();
      
      if (isDonating) {
        const pendingFees = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await feeVaultContract.methods.pendingFees(myaccounts).call()))));
        const pendingDAI = new BN(pendingFees[0]).dividedBy('1e18');
        const pendingUSDC = new BN(pendingFees[1]).dividedBy('1e6');
        const totalPendingUSD = pendingDAI.plus(pendingUSDC);
        
        // Only collect if > $1
        if (totalPendingUSD.gt(new BN('1'))) {
          const lastFeeCollection = parseInt(localStorage.getItem(myaccounts+'stableFeeLastCollection') || '0');
          now = Math.floor(Date.now() / 1000);
          
          // Collect once per day
          if (now - lastFeeCollection > 86400) {
            logToConsole('Collecting personal fees from StableVault (donating user)');
            const tx = await sendTx(feeVaultContract, "claim", [], 500000, "0", false, false, false);            
            localStorage.setItem(myaccounts+'stableFeeLastCollection', now.toString());
            logToConsole(`Personal fees collected $${stripZeros(totalPendingUSD.toFixed(8, BN.ROUND_DOWN))}: ` + tx);
          }
        }
      }
    }
    
    // Part 2: Check global unclaimed fees for the pool position (collective check)
    const liquidity = validation(DOMPurify.sanitize(await stableContract.methods.liquidity().call()));
    
    if (isGreaterThanZero(liquidity)) {
      const unclaimedFees = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await stableContract.methods.getUnclaimedFees().call()))));
      // Token order depends on address comparison: USDC (0x3c...) < DAI (0x8f...)
      // So currency0 = USDC (6 decimals), currency1 = DAI (18 decimals)
      const daiIsToken0 = await stableContract.methods._daiIsToken0().call();
      let feeDAI, feeUSDC;
      if (daiIsToken0) {
        feeDAI = new BN(unclaimedFees.fee0).dividedBy('1e18');
        feeUSDC = new BN(unclaimedFees.fee1).dividedBy('1e6');
      } else {
        feeUSDC = new BN(unclaimedFees.fee0).dividedBy('1e6');
        feeDAI = new BN(unclaimedFees.fee1).dividedBy('1e18');
      }
      const totalUnclaimedUSD = feeDAI.plus(feeUSDC);
      
      const lastFeeCollection2 = parseInt(localStorage.getItem(myaccounts+'stableFeeLastCollection2') || '0');
      now = Math.floor(Date.now() / 1000);
      // Only proceed if > 1 dollar for the collective pool
      if (totalUnclaimedUSD.gt(new BN('1')) && (now - lastFeeCollection2 > 86400)) {
        localStorage.setItem(myaccounts+'stableFeeLastCollection2', now.toString());
        const deadline = now + 300;
        
        logToConsole(`StableVault unclaimed fees: $${stripZeros(totalUnclaimedUSD.toFixed(8, BN.ROUND_DOWN))}, collecting...`);        
        const tx = await sendTx(stableContract, "collectFees", [deadline], 500000, "0", false, false, false);        
        logToConsole('StableVault pool fees collected successfully: ' + tx);
      }
      
      // Check if position needs repositioning (if out of range)
      const isInRange = validation(DOMPurify.sanitize(await stableContract.methods.isInRange().call())) === true;
      
      if (!isInRange) {
        const lastReposition = parseInt(validation(DOMPurify.sanitize(await stableContract.methods.lastReposition().call())));
        const positionTimelock = parseInt(validation(DOMPurify.sanitize(await stableContract.methods.POSITION_TIMELOCK().call())));
        now = Math.floor(Date.now() / 1000);
        
        if (now - lastReposition > positionTimelock) {
          logToConsole('StableVault is out of range, repositioning...');
          const deadline = now + 300;          
          const tx = await sendTx(stableContract, "reposition", [deadline], 2000000, "0", false, false, false);          
          logToConsole('StableVault repositioned successfully: ' + tx);
        }
      }
      
      // Check if dust needs cleaning
      const lastDustClean = parseInt(validation(DOMPurify.sanitize(await stableContract.methods.lastDustClean().call())));
      const cleanTimelock = parseInt(validation(DOMPurify.sanitize(await stableContract.methods.CLEAN_TIMELOCK().call())));
      now = Math.floor(Date.now() / 1000);
      
      if (now - lastDustClean > cleanTimelock) {        
        const USDCToken = new earnState.polWeb3.eth.Contract(ERC20ABI, TREASURY_ADDRESSES.USDC);
        const USDCBalance = validation(DOMPurify.sanitize(await USDCToken.methods.balanceOf(TREASURY_ADDRESSES.STABLE_POOL).call()));
        if (new BN(USDCBalance).gt(new BN('1000000'))) {
          logToConsole('Cleaning StableVault dust...');
          const deadline = now + 300;
          const tx = await sendTx(stableContract, "cleanDust", [deadline], 1500000, "0", false, false, false);        
          logToConsole('StableVault dust cleaned successfully: ' + tx);
        }
      }
    }
    
  } catch (error) {
    console.error('Error managing stable vault:', error);
    logToConsole(`Error with managing stable vault: Please check your browsers console to see the error message`);
  }
}

async function loadStakingInfo() {
  if (!earnState.polWeb3 || !myaccounts) return;
  
  try {
    // Get user's vault address
    const vaultContract = new earnState.polWeb3.eth.Contract(vaultABI, TREASURY_ADDRESSES.VAULT);
    earnState.userVaultAddress = validation(DOMPurify.sanitize(await vaultContract.methods.getVaultAddress(myaccounts).call()));
    
    if (earnState.userVaultAddress) {
      document.getElementById('userVaultAddress').textContent = 
        earnState.userVaultAddress.substring(0, 10) + '...' + earnState.userVaultAddress.substring(38);
    }
    
    // Load BAYL treasury info
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    
    const totalTokens = validation(DOMPurify.sanitize(await baylTreasury.methods.totalTokens().call()));
    const totalShares = validation(DOMPurify.sanitize(await baylTreasury.methods.totalShares().call()));
    const refreshRate = validation(DOMPurify.sanitize(await baylTreasury.methods.refreshRate().call()));
    const claimRate = validation(DOMPurify.sanitize(await baylTreasury.methods.claimRate().call()));
    
    document.getElementById('baylTotalStaked').textContent = displayBAYAmount(totalTokens, 4);
    document.getElementById('baylTotalShares').textContent = totalShares;
    document.getElementById('baylRefreshRate').textContent = Math.floor(parseInt(refreshRate) / 86400) + ' days';
    const currentBlock = parseInt(validation(DOMPurify.sanitize(await earnState.polWeb3.eth.getBlockNumber())));

    const blocksRemaining = Math.floor(currentBlock % parseInt(claimRate));
    document.getElementById('baylClaimRate').textContent = claimRate + ' blocks (' + blocksRemaining + "/" + claimRate + ")";
    
    // Load user staking info
    const userInfo = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.accessPool(myaccounts).call()))));
    document.getElementById('userShares').textContent = displayBAYAmount(userInfo.shares, 4);
    
    if (userInfo.lastRefresh > 0 && parseInt(totalShares) > 0) {
      const lastRefreshDate = new Date(userInfo.lastRefresh * 1000);
      document.getElementById('userLastRefresh').textContent = lastRefreshDate.toLocaleString();
      
      // Check if user is close to needing a refresh
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const timeSinceRefresh = currentTimestamp - parseInt(userInfo.lastRefresh);
      const refreshThreshold = parseInt(refreshRate) * 0.85;
      
      if (timeSinceRefresh >= parseInt(refreshRate)) {
        document.getElementById('userLastRefresh').innerHTML += ' <span style="color: red;">(Refresh required)</span>';
      } else if (timeSinceRefresh >= refreshThreshold) {
        document.getElementById('userLastRefresh').innerHTML += ' <span style="color: orange;">(Refresh soon)</span>';
      }
    }
    
    // Get user's tracked coins
    const userCoins = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.getUserCoins(myaccounts).call()))));
    if (userCoins && userCoins.length > 0) {
      const coinNames = [];
      if (userCoins.includes(TREASURY_ADDRESSES.WETH)) coinNames.push('WETH');
      if (userCoins.includes(TREASURY_ADDRESSES.DAI)) coinNames.push('DAI');
      if (userCoins.includes(TREASURY_ADDRESSES.USDC)) coinNames.push('USDC');
      document.getElementById('userTrackingCoins').textContent =
        coinNames.join(', ') || 'None';
      
      // Only check pending rewards if user is participating in current interval
      const currentInterval = Math.floor(currentBlock / parseInt(claimRate));
      const userInterval = parseInt(userInfo.interval);
      
      if (userInterval === currentInterval && parseInt(userInfo.staked) > 0) {
        // User is participating in current interval, get pending rewards
        const pendingRewards = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.pendingReward(myaccounts).call()))));
        let rewardsHTML = '';
        for (let i = 0; i < userCoins.length; i++) {
          const coin = userCoins[i];
          const pending = pendingRewards[i];
          if (isGreaterThanZero(pending)) {
            let coinName = coin.substring(0, 10) + '...';
            let pendingDisplay = '';

            if (coin.toLowerCase() === TREASURY_ADDRESSES.WETH.toLowerCase()) {
              coinName = 'WETH';
              pendingDisplay = displayETHAmount(pending, 8);
            } else if (coin.toLowerCase() === TREASURY_ADDRESSES.DAI.toLowerCase()) {
              coinName = 'DAI';
              pendingDisplay = displayETHAmount(pending, 8);
            } else if (coin.toLowerCase() === TREASURY_ADDRESSES.USDC.toLowerCase()) {
              coinName = 'USDC';
              pendingDisplay = displayUSDCAmount(pending, 8);
            }

            rewardsHTML += `<div>${coinName}: ${pendingDisplay}</div>`;
          }
        }
        document.getElementById('userPendingRewards').innerHTML = rewardsHTML || translateThis('No pending rewards');
      } else {
        // User is not participating in current interval
        if(userInterval == currentInterval + 1) {
          document.getElementById('userPendingRewards').innerHTML = translateThis('Stake submitted, waiting for next interval');
        } else {
          document.getElementById('userPendingRewards').innerHTML = translateThis('Not participating in current interval');
        }
      }
    } else {
      document.getElementById('userPendingRewards').innerHTML = translateThis('No pending rewards');
      document.getElementById('userTrackingCoins').textContent = translateThis('None set');
    }
    
    // Display total rewards from localStorage
    let totalRewardsHTML = '';
    for (const [coin, amount] of Object.entries(earnState.userTotalRewards)) {
      totalRewardsHTML += `<div>${coin}: ${amount}</div>`;
    }
    document.getElementById('userTotalRewards').innerHTML = totalRewardsHTML || translateThis('No rewards collected yet');
    
    // Load BAYL and BAYR balances at vault
    if (earnState.userVaultAddress) {
      const baylContract = new earnState.polWeb3.eth.Contract(
        [{
          "constant": true,
          "inputs": [{"name": "account", "type": "address"}],
          "name": "balanceOf",
          "outputs": [{"name": "", "type": "uint256"}],
          "type": "function"
        }],
        validation(DOMPurify.sanitize(await vaultContract.methods.BAYL().call()))
      );
      
      const bayrContract = new earnState.polWeb3.eth.Contract(
        [{
          "constant": true,
          "inputs": [{"name": "account", "type": "address"}],
          "name": "balanceOf",
          "outputs": [{"name": "", "type": "uint256"}],
          "type": "function"
        }],
        validation(DOMPurify.sanitize(await vaultContract.methods.BAYR().call()))
      );
      
      const baylBalance = validation(DOMPurify.sanitize(await baylContract.methods.balanceOf(earnState.userVaultAddress).call()));
      const bayrBalance = validation(DOMPurify.sanitize(await bayrContract.methods.balanceOf(earnState.userVaultAddress).call()));
      
      document.getElementById('vaultBaylBalance').textContent = displayBAYAmount(baylBalance, 4);
      document.getElementById('vaultBayrBalance').textContent = displayBAYAmount(bayrBalance, 4);
      
      document.getElementById('vaultBalances').classList.remove('hidden');
    }
    
    document.getElementById('userStakingInfo').classList.remove('hidden');
    
    // Check POL balance for gas warning
    const polBalance = validation(DOMPurify.sanitize(await earnState.polWeb3.eth.getBalance(myaccounts)));
    const BN = BigNumber;
    const polBalanceEther = new BN(polBalance).dividedBy('1e18');
    
    if (polBalanceEther.lt(new BN('30'))) {
      document.getElementById('stakingPolBalance').textContent = stripZeros(polBalanceEther.toFixed(8, BN.ROUND_DOWN));
      document.getElementById('stakingGasWarning').classList.remove('hidden');
    }
    
  } catch (error) {
    console.error('Error loading staking info:', error);
  }
}

async function loadTopStakers() {
  if (!earnState.polWeb3) return;
  
  try {
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    const topStakers = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.getTopStakers().call()))));
    
    let html = '<ol style="list-style-position: inside; padding-left: 0; margin-bottom: 0;">';
    for (const staker of topStakers) {
      if (isGreaterThanZero(staker[1])) {
        html += `<li>${staker[0].substring(0, 10)}...:&nbsp&nbsp&nbsp&nbsp${displayBAYAmount(staker[1], 2)} BAYL</li>`;
      }
    }
    html += '</ol>';
    
    document.getElementById('topStakersList').innerHTML = html || '<p>No stakers yet</p>';
    
  } catch (error) {
    console.error('Error loading top stakers:', error);
  }
}

async function depositStake() {
  if (!earnState.polWeb3 || !myaccounts || loginType !== 2) {
    await Swal.fire(translateThis('Error'), translateThis('Please login with password to stake'), 'error');
    return;
  }
  const result = await Swal.fire({
    title: translateThis('Staking Disclaimer'),
    html: `
      <p>`+translateThis("Rewards are not guaranteed and are based on users who opt-in. This system is not a security because users volunteer, there is no common enterprise and stakers do tasks for the rewards. In exchange for protocol fees, you are doing work by securing the blockchain, managing the stablecoin position, and voting on important protocol decisions. Additionally, your node will be tasked with occasionally covering gas fees in order to manage these positions and redeem rewards. Please make sure that you monitor your account and understand the source code.")+`</p>
      <p><a href="https://bitbay.market/downloads/whitepapers/Protocol-owned-assets.pdf" target="_blank"> `+translateThis("Click here to learn more about BitBay staking.")+`</a></p>
    `,
    icon: 'info',
    showCancelButton: true,
    confirmButtonText: translateThis('I Understand, Continue'),
    cancelButtonText: translateThis('Cancel')
  });
  if (!result.isConfirmed) return;
  var amount = document.getElementById('stakingDepositAmount').value;
  const BN = BigNumber;
  if (!amount || new BN(amount).lte(new BN('0'))) {
    await Swal.fire(translateThis('Error'), translateThis('Please enter a valid amount'), 'error');
    return;
  }
  try {
    showSpinner();
    amount = new BN(amount).times('1e8').toString();
    const vaultContract = new earnState.polWeb3.eth.Contract(vaultABI, TREASURY_ADDRESSES.VAULT);
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    // Check if this is first deposit - if so, set coins first
    const userCoins = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.getUserCoins(myaccounts).call()))));
    if (!userCoins || userCoins.length === 0) {
      // Set default coins: WETH, DAI, USDC
      const coins = [
        TREASURY_ADDRESSES.WETH, // WETH on Polygon
        TREASURY_ADDRESSES.DAI, // DAI on Polygon
        TREASURY_ADDRESSES.USDC
      ];
      Swal.fire(translateThis("Transaction Processing..."), translateThis("Setting the coins to track when checking for rewards: WETH, DAI, USDC"));
      await delay(500);
      await sendTx(baylTreasury, "setCoins", [coins], 700000, "0", false, false);
    }
    // Get BAYL address
    const baylAddress = validation(DOMPurify.sanitize(await vaultContract.methods.BAYL().call()));
    const baylAbi = [
      {
        "constant": true,
        "inputs": [
          { "name": "owner", "type": "address" },
          { "name": "spender", "type": "address" }
        ],
        "name": "allowance",
        "outputs": [{ "name": "", "type": "uint256" }],
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          { "name": "spender", "type": "address" },
          { "name": "amount", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [{ "name": "", "type": "bool" }],
        "type": "function"
      }
    ];
    const baylContract = new earnState.polWeb3.eth.Contract(baylAbi, baylAddress);
    const allowance = validation(DOMPurify.sanitize(await baylContract.methods.allowance(myaccounts, TREASURY_ADDRESSES.VAULT).call()));
    if(new BN(allowance).lt(new BN(amount))) {
      // Approve BAYL to vault
      Swal.fire({
        icon: 'info',
        title: translateThis('Allowance'),
        text: translateThis('Authorizing BAYL allowance...'),
        showConfirmButton: false
      });
      await sendTx(baylContract, "approve", [TREASURY_ADDRESSES.VAULT, amount], 100000, "0", false, false);
    }
    // Deposit to vault (which will stake to treasury)
    await sendTx(vaultContract, "depositLiquid", [amount], 3000000, "0", true, false);
    hideSpinner();
    await Swal.fire(translateThis('Success'), translateThis('BAYL staked successfully!'), 'success');
    await refreshStakingInfo();
  } catch (error) {
    hideSpinner();
    console.log(error);
    const message = translateThis("Please check your browsers console for the full error message");
    await showScrollableError(translateThis('Transaction failed'), message);
  }
}

async function unstakeBAYL() {
  if (!earnState.polWeb3 || !myaccounts) {
    await Swal.fire(translateThis('Error'), translateThis('Please login to withdraw'), 'error');
    return;
  }
  const tokenChoice = await Swal.fire({
    title: translateThis('Unstake'),
    text: translateThis('Which token would you like to unstake?'),
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: 'BAYL',
    denyButtonText: 'BAYR',
  });
  if (tokenChoice.isDismissed) return;
  const isBAYL = tokenChoice.isConfirmed;
  const tokenSymbol = isBAYL ? 'BAYL' : 'BAYR';
  const BN = BigNumber;
  const vaultContract = new earnState.polWeb3.eth.Contract(vaultABI, TREASURY_ADDRESSES.VAULT);
  if (isBAYL) {
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    // Check if user is currently in a staking interval
    const userInfo = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.accessPool(myaccounts).call()))));
    const claimRate = parseInt(validation(DOMPurify.sanitize(await baylTreasury.methods.claimRate().call())));
    const currentBlock = parseInt(validation(DOMPurify.sanitize(await earnState.polWeb3.eth.getBlockNumber())));
    const currentInterval = Math.floor(currentBlock / claimRate);
    const userInterval = parseInt(userInfo.interval);
    if (userInterval >= currentInterval) {
      // User is in current staking interval, calculate when they can withdraw
      const intervalEndBlock = (userInterval + 1) * claimRate;
      const blocksRemaining = Math.max(0, intervalEndBlock - currentBlock);
      await Swal.fire(
        translateThis('Cannot Unstake'),
        translateThis('You are currently staking at interval') + ' ' + userInterval + '. ' +
        translateThis('Please wait') + ' ' + blocksRemaining + ' ' + translateThis('blocks until the interval ends to withdraw.'),
        'warning'
      );
      return;
    }
  }
  // Check vault address
  const userVaultAddress = earnState.userVaultAddress || validation(DOMPurify.sanitize(await vaultContract.methods.vaultOf(myaccounts).call()));
  if (!userVaultAddress || userVaultAddress === '0x0000000000000000000000000000000000000000') {
    await Swal.fire(translateThis('Error'), translateThis('No vault found for your account'), 'error');
    return;
  }
  // Check token balance in user's vault
  const tokenAddress = isBAYL
    ? validation(DOMPurify.sanitize(await vaultContract.methods.BAYL().call()))
    : validation(DOMPurify.sanitize(await vaultContract.methods.BAYR().call()));
  const tokenContract = new earnState.polWeb3.eth.Contract(ERC20ABI, tokenAddress);
  const vaultTokenBalance = validation(DOMPurify.sanitize(await tokenContract.methods.balanceOf(userVaultAddress).call()));
  const vaultTokenBalanceFormatted = displayBAYAmount(vaultTokenBalance, 8);
  if (!isGreaterThanZero(vaultTokenBalance)) {
    await Swal.fire(translateThis('Error'), translateThis('No coins available in your vault to unstake'), 'error');
    return;
  }
  const result = await Swal.fire({
    title: translateThis('Unstake ' + tokenSymbol),
    input: 'number',
    inputLabel: translateThis('Amount to unstake') + ' (' + translateThis('Available') + ': ' + vaultTokenBalanceFormatted + ' ' + tokenSymbol + ')',
    inputPlaceholder: '0.0',
    showCancelButton: true,
    inputValidator: (value) => {
      if (!value || new BN(value).lte(new BN('0'))) {
        return translateThis('Please enter a valid amount');
      }
      const amountWei = BN(value).times('1e8').toString();
      if (new BN(amountWei).gt(new BN(vaultTokenBalance))) {
        return translateThis('Insufficient balance in vault. Maximum available') + ': ' + vaultTokenBalanceFormatted;
      }
    }
  });
  if (!result.isConfirmed) return;
  try {
    showSpinner();
    const amount = BN(result.value).times('1e8').toString();
    if (isBAYL) {
      await sendTx(vaultContract, "withdrawLiquid", [amount], 1500000, "0", true, false);
    } else {
      await sendTx(vaultContract, "withdrawReserve", [amount], 1500000, "0", true, false);
    }
    hideSpinner();
    await Swal.fire(translateThis('Success'), translateThis('Coins unstaked successfully!'), 'success');
    await refreshStakingInfo();
  } catch (error) {
    hideSpinner();
    console.log(error);
    const message = translateThis("Please check your browsers console for the full error message");
    await showScrollableError(translateThis('Transaction failed'), message);
  }
}

async function claimStakingRewards(showSwal = false) {
  if (!earnState.polWeb3 || !myaccounts || loginType !== 2) {
    if(showSwal) {
      await Swal.fire(translateThis('Error'), translateThis('Please login with password to claim rewards'), 'error');
    }
    return;
  }
  try {
    if(showSwal) {
      showSpinner();
    }
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);    
    // Get user's saved votes
    const savedVotes = JSON.parse(localStorage.getItem(myaccounts+'earnUserVotes') || '[]');
    const votesToCast = [];
    
    // Process votes in the order they are stored
    // Each vote can be cast multiple times if user specified (via repeat field)
    for (const vote of savedVotes) {
      const maxCasts = vote.repeat || 1;
      if (vote.timesCast < maxCasts) {
        // Build the vote payload array per StakingVote.sol spec
        // For each action, payload must contain 3 items:
        // 1. Encoded string (Function Signature)
        // 2. Encoded address (Target Contract)
        // 3. Encoded bytes (Arguments Blob)
        for (const action of vote.actions) {
          try {
            const payload = [];
            
            // Build function signature from function name and argument types
            const argTypes = action.arguments.map(arg => arg.type);
            const functionSignature = `${action.functionName}(${argTypes.join(',')})`;
            
            // Element 1: function signature as encoded string
            payload.push(earnState.polWeb3.eth.abi.encodeParameter('string', functionSignature));
            
            // Element 2: target contract address as encoded address
            payload.push(earnState.polWeb3.eth.abi.encodeParameter('address', action.target));
            
            // Element 3: arguments blob as encoded bytes
            // Encode all arguments together using encodeParameters
            let argsBlob = '0x';
            if (action.arguments.length > 0 && argTypes.length > 0) {
              const argValues = action.arguments.map(arg => arg.value);
              argsBlob = earnState.polWeb3.eth.abi.encodeParameters(argTypes, argValues);
            }
            payload.push(earnState.polWeb3.eth.abi.encodeParameter('bytes', argsBlob));
            
            votesToCast.push(payload);
          } catch (e) {
            console.error('Error encoding vote action:', e);
          }
        }
        // Increment times cast
        vote.timesCast++;
      }
    }
    // Save updated vote counts
    const userCoins = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.getUserCoins(myaccounts).call()))));
    const pendingRewards = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await baylTreasury.methods.pendingReward(myaccounts).call()))));
    var foundRewards = false;
    for (let i = 0; i < userCoins.length; i++) {
      const coin = userCoins[i];
      const pending = pendingRewards[i];
      let coinName = coin;
      if (coin.toLowerCase() === TREASURY_ADDRESSES.WETH.toLowerCase()) coinName = 'WETH';
      if (coin.toLowerCase() === TREASURY_ADDRESSES.DAI.toLowerCase()) coinName = 'DAI';
      if (coin.toLowerCase() === TREASURY_ADDRESSES.USDC.toLowerCase()) coinName = 'USDC';
      if (parseInt(pending) > 0) {
        foundRewards = true;
        const BN = BigNumber;
        let amount;
        if (coinName === 'USDC') {
          amount = new BN(pending).dividedBy('1e6');
        } else {
          amount = new BN(pending).dividedBy('1e18');
        }
        earnState.userTotalRewards[coinName] = new BN(earnState.userTotalRewards[coinName] || 0).plus(amount).toString();
      }
    }
    var tx;
    if(foundRewards || !showSwal) {
      const voteContractAddress = votesToCast.length > 0 ? TREASURY_ADDRESSES.VOTE_BAYL : '0x0000000000000000000000000000000000000000';
      tx = await sendTx(baylTreasury, "claimRewards", [voteContractAddress, votesToCast], 1500000, "0", showSwal, false, showSwal);
    } else {
      if(showSwal) {
        await Swal.fire(translateThis("Transaction not sent"), translateThis("No rewards found."));
        hideSpinner();
      }
      console.log("No rewards found");
      return;
    }
    localStorage.setItem(myaccounts+'earnUserVotes', JSON.stringify(savedVotes));
    localStorage.setItem(myaccounts+'earnTotalRewards', JSON.stringify(earnState.userTotalRewards));
    if(showSwal) {
      hideSpinner();
    }
    let message = 'Stake claimed successfully';
    if (votesToCast.length > 0) {
      message += ` -- ${votesToCast.length} vote(s) cast.`;
    }
    if(!showSwal) {
      logToConsole(message+` -- tx: ${tx}`);
    }
    if(showSwal) {
      await Swal.fire(translateThis('Success'), message, 'success');
    }
    await refreshStakingInfo();
  } catch (error) {
    hideSpinner();
    console.error('Error claiming rewards:', error);
    if(showSwal) {
      const message = translateThis("Please check your browsers console for the full error message");
      await showScrollableError(translateThis('Transaction failed'), message);
    }
  }
}

// ============================================================================
// VOTING FUNCTIONS
// ============================================================================

async function loadVotingInfo() {
  if (!earnState.polWeb3) return;
  
  try {
    const voteContract = new earnState.polWeb3.eth.Contract(stakingABI, TREASURY_ADDRESSES.VOTE_BAYL);
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    
    // Get current epoch
    const currentEpoch = parseInt(validation(DOMPurify.sanitize(await voteContract.methods.currentEpoch().call())));
    document.getElementById('currentVoteEpoch').textContent = currentEpoch;
    
    // Get epoch block info
    const epochBlocks = validation(DOMPurify.sanitize(await voteContract.methods.epochLength().call()));
    document.getElementById('voteEpochBlocks').textContent = epochBlocks;
    
    // Check if we're in the vote period (claimPeriod)
    const isInVotePeriod = validation(DOMPurify.sanitize(await baylTreasury.methods.claimPeriod().call())) === true;
    
    // Load previous and pending votes
    await loadVotes(voteContract, currentEpoch, isInVotePeriod);
    
  } catch (error) {
    console.error('Error loading voting info:', error);
  }
}

async function loadVotes(voteContract, currentEpoch, isInVotePeriod) {
  try {
    // For previous epoch: Always show winner and its votes (can always check prior votes)
    if (currentEpoch > 0) {
      const prevEpoch = currentEpoch - 1;
      const winningHash = validation(DOMPurify.sanitize(await voteContract.methods.winningHash(prevEpoch).call()));
      let prevHTML = '';
      
      if (winningHash && winningHash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        const weight = validation(DOMPurify.sanitize(await voteContract.methods.winningWeight(prevEpoch).call()));
        //const payload = DOMPurify.sanitize(JSON.stringify(await voteContract.methods.getProposalPayload(winningHash).call()));
        prevHTML += `<div><strong>Winner:</strong> <a href="#" onclick="showVotePayload('${winningHash}')">${winningHash.substring(0, 10)}...</a> (${weight} votes)</div>`;
      } else {
        prevHTML = 'No votes in last epoch';
      }
      document.getElementById('baylPreviousVotes').innerHTML = prevHTML;
    }
    
    // For current epoch: Only show pending votes during the vote period
    if (isInVotePeriod) {
      const topHashes = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await voteContract.methods.getEpochHashes(currentEpoch).call()))));
      let pendingHTML = '';
      
      for (const hash of topHashes) {
        if (hash && hash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          pendingHTML += `<div><a href="#" onclick="showVotePayload('${hash}')">${hash.substring(0, 10)}...</a></div>`;
        }
      }
      
      if (pendingHTML === '') {
        pendingHTML = 'No pending votes';
      }
      document.getElementById('baylPendingVotes').innerHTML = pendingHTML;
    } else {
      // Not in vote period - voting happens later
      document.getElementById('baylPendingVotes').innerHTML = translateThis('Registration period - voting starts later');
    }
    
  } catch (error) {
    console.error('Error loading votes:', error);
  }
}

async function showCreateVoteDialog() {
  // Load any saved votes from localStorage
  const savedVotes = JSON.parse(localStorage.getItem(myaccounts+'earnUserVotes') || '[]');
  
  await Swal.fire({
    title: 'Create New Vote',
    html: `
      <div style="text-align: left; font-size: 0.9em;">
        <p style="margin-bottom: 10px; font-size: 0.85em;">Create a vote with multiple actions to execute if it passes.</p>
        
        <div style="margin-bottom: 12px; padding: 8px; background: #f5f5f5; border-radius: 5px;">
          <label style="font-size: 0.85em;"><strong>Auto-cast Count:</strong></label>
          <input type="number" id="voteRepeatCount" class="swal2-input" style="padding: 5px; font-size: 0.85em; width: 80px;" value="1" min="1" max="100" />
          <span style="font-size: 0.8em; color: #777; margin-left: 5px;">Vote will be automatically cast this many times when claiming rewards</span>
        </div>
        
        <div id="voteActionsContainer" style="max-height: 50vh; overflow-y: auto; padding-right: 5px;">
          <div id="voteActions">
            <div class="vote-action-item" data-action-index="0" style="border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 5px;">
              <h4 style="margin: 0 0 10px 0; font-size: 0.9em;">Action 1</h4>
              
              <div style="margin-bottom: 8px;">
                <label style="font-size: 0.85em;"><strong>Target Contract:</strong></label>
                <input type="text" id="actionTarget0" class="swal2-input" style="padding: 5px; font-size: 0.85em;" placeholder="0x..." />
              </div>
              
              <div style="margin-bottom: 8px;">
                <label style="font-size: 0.85em;"><strong>Function Name:</strong></label>
                <input type="text" id="actionFuncName0" class="swal2-input" style="padding: 5px; font-size: 0.85em;" placeholder="e.g., setMinDays" />
              </div>
              
              <div id="actionArgs0" style="margin-bottom: 8px;">
                <label style="font-size: 0.85em;"><strong>Arguments:</strong></label>
              </div>
              
              <button onclick="addArgumentField(0)" class="swal2-confirm swal2-styled" style="margin-top: 5px; padding: 4px 8px; font-size: 0.8em;">+ Add Argument</button>
            </div>
          </div>
        </div>
        
        <button onclick="addVoteAction()" class="swal2-confirm swal2-styled" style="margin-top: 8px; padding: 5px 10px; font-size: 0.85em;">+ Add Action</button>
      </div>
    `,
    width: '500px',
    customClass: {
      popup: 'scrollable-swal-popup'
    },
    showCancelButton: true,
    confirmButtonText: 'Create Vote',
    cancelButtonText: 'Cancel',
    preConfirm: () => {
      return createVoteFromDialog();
    }
  });
}

function addVoteAction() {
  const container = document.getElementById('voteActions');
  const index = container.children.length;
  
  if (index >= 10) {
    Swal.showValidationMessage('Maximum 10 actions per vote');
    return;
  }
  
  const newAction = document.createElement('div');
  newAction.className = 'vote-action-item';
  newAction.setAttribute('data-action-index', index);
  newAction.style.border = '1px solid #ddd';
  newAction.style.padding = '10px';
  newAction.style.marginBottom = '10px';
  newAction.style.borderRadius = '5px';
  newAction.innerHTML = `
    <h4 style="margin: 0 0 10px 0; font-size: 0.9em;">Action ${index + 1}</h4>
    
    <div style="margin-bottom: 8px;">
      <label style="font-size: 0.85em;"><strong>Target Contract:</strong></label>
      <input type="text" id="actionTarget${index}" class="swal2-input" style="padding: 5px; font-size: 0.85em;" placeholder="0x..." />
    </div>
    
    <div style="margin-bottom: 8px;">
      <label style="font-size: 0.85em;"><strong>Function Name:</strong></label>
      <input type="text" id="actionFuncName${index}" class="swal2-input" style="padding: 5px; font-size: 0.85em;" placeholder="e.g., setMaxDays" />
    </div>
    
    <div id="actionArgs${index}" style="margin-bottom: 8px;">
      <label style="font-size: 0.85em;"><strong>Arguments:</strong></label>
    </div>
    
    <button onclick="addArgumentField(${index})" class="swal2-confirm swal2-styled" style="margin-top: 5px; padding: 4px 8px; font-size: 0.8em;">+ Add Argument</button>
  `;
  
  container.appendChild(newAction);
}

function addArgumentField(actionIndex) {
  const argsContainer = document.getElementById(`actionArgs${actionIndex}`);
  const argIndex = argsContainer.querySelectorAll('.argument-item').length;
  
  if (argIndex >= 20) {
    Swal.showValidationMessage('Maximum 20 arguments per action');
    return;
  }
  
  const newArg = document.createElement('div');
  newArg.className = 'argument-item';
  newArg.style.marginTop = '8px';
  newArg.style.paddingLeft = '10px';
  newArg.style.borderLeft = '2px solid #ccc';
  newArg.innerHTML = `
    <label style="font-size: 0.8em;">Arg ${argIndex + 1} Type:</label>
    <select id="argType${actionIndex}_${argIndex}" class="swal2-select" style="padding: 4px; font-size: 0.8em; width: 100%; margin-bottom: 5px;">
      <option value="address">address</option>
      <option value="string">string</option>
      <option value="bool">bool</option>
      <option value="uint256">uint256</option>
      <option value="uint128">uint128</option>
      <option value="uint64">uint64</option>
      <option value="uint32">uint32</option>
      <option value="uint16">uint16</option>
      <option value="uint8">uint8</option>
      <option value="int256">int256</option>
      <option value="int128">int128</option>
      <option value="bytes">bytes</option>
      <option value="bytes32">bytes32</option>
      <option value="bytes16">bytes16</option>
      <option value="bytes8">bytes8</option>
      <option value="bytes4">bytes4</option>
    </select>
    
    <label style="font-size: 0.8em;">Arg ${argIndex + 1} Value:</label>
    <input type="text" id="argValue${actionIndex}_${argIndex}" class="swal2-input" style="padding: 4px; font-size: 0.8em; width: 100%;" placeholder="Enter value" />
  `;
  
  argsContainer.appendChild(newArg);
}

async function createVoteFromDialog() {
  const actionsContainer = document.getElementById('voteActions');
  const numActions = actionsContainer.children.length;
  
  if (numActions === 0) {
    Swal.showValidationMessage('Please add at least one action');
    return false;
  }
  
  const actions = [];
  
  for (let i = 0; i < numActions; i++) {
    const target = document.getElementById(`actionTarget${i}`).value;
    const funcName = document.getElementById(`actionFuncName${i}`).value;
    
    if (!target || !target.match(/^0x[a-fA-F0-9]{40}$/)) {
      Swal.showValidationMessage(`Action ${i + 1}: Please enter a valid target contract address`);
      return false;
    }
    
    if (!funcName || !funcName.trim()) {
      Swal.showValidationMessage(`Action ${i + 1}: Please enter a function name`);
      return false;
    }
    
    // Collect arguments for this action
    const argsContainer = document.getElementById(`actionArgs${i}`);
    const argItems = argsContainer.querySelectorAll('.argument-item');
    const args = [];
    
    for (let j = 0; j < argItems.length; j++) {
      const argType = document.getElementById(`argType${i}_${j}`).value;
      const argValue = document.getElementById(`argValue${i}_${j}`).value;
      
      // Allow '0' and 'false' as valid values, but not empty strings
      if (argValue === '' || (argValue !== '0' && argValue !== 'false' && !argValue.trim())) {
        Swal.showValidationMessage(`Action ${i + 1}, Argument ${j + 1}: Please enter a value`);
        return false;
      }
      
      args.push({ type: argType, value: argValue });
    }
    
    actions.push({
      target: target,
      functionName: funcName,
      arguments: args
    });
  }
  
  // Get repeat count from input
  const repeatInput = document.getElementById('voteRepeatCount');
  let repeatCount = 1;
  if (repeatInput && repeatInput.value) {
    repeatCount = Math.max(1, Math.min(100, parseInt(repeatInput.value) || 1));
  }
  
  // Save to localStorage
  const savedVotes = JSON.parse(localStorage.getItem(myaccounts+'earnUserVotes') || '[]');
  const newVote = {
    id: Date.now(),
    actions: actions,
    timesCast: 0,
    repeat: repeatCount
  };
  savedVotes.push(newVote);
  localStorage.setItem(myaccounts+'earnUserVotes', JSON.stringify(savedVotes));
  
  await Swal.fire(translateThis('Success'), translateThis('Vote created! It will be cast during your next reward claim.'), 'success');
  return true;
}

async function showVoteDetailsDialog() {
  const savedVotes = JSON.parse(localStorage.getItem(myaccounts+'earnUserVotes') || '[]');

  const masterContainer = document.createElement('div');
  masterContainer.style.cssText = 'text-align:left;max-height:50vh;overflow-y:auto;padding-right:5px;';

  if (savedVotes.length === 0) {
    const p = document.createElement('p');
    p.textContent = translateThis('You have not created any votes yet.');
    masterContainer.appendChild(p);
  } else {
    const heading = document.createElement('p');
    heading.innerHTML = '<strong>Your Created Votes:</strong>';
    masterContainer.appendChild(heading);

    savedVotes.forEach((vote, index) => {
      const maxCasts = vote.repeat || 1;

      // Build the displayable content for this vote as HTML
      let voteHtml = `<p><strong>Vote ${index + 1}</strong> (Cast ${vote.timesCast}/${maxCasts} time(s))</p>`;
      voteHtml += '<ul>';
      vote.actions.forEach((action, actionIndex) => {
        voteHtml += `<li style="margin-bottom:10px;">`;
        voteHtml += `<strong>Action ${actionIndex + 1}:</strong><br>`;
        voteHtml += `<strong>Target:</strong> ${DOMPurify.sanitize(action.target)}<br>`;
        voteHtml += `<strong>Function:</strong> ${DOMPurify.sanitize(action.functionName)}(`;
        voteHtml += action.arguments.map(arg => DOMPurify.sanitize(arg.type)).join(', ');
        voteHtml += `)<br>`;
        if (action.arguments.length > 0) {
          voteHtml += `<strong>Arguments:</strong><ul style="margin-left:20px;">`;
          action.arguments.forEach((arg) => {
            voteHtml += `<li>${DOMPurify.sanitize(arg.type)}: ${DOMPurify.sanitize(String(arg.value))}</li>`;
          });
          voteHtml += `</ul>`;
        }
        voteHtml += `</li>`;
      });
      voteHtml += '</ul>';

      // Estimate height: base + per-action + per-argument
      const argCount = vote.actions.reduce((sum, a) => sum + a.arguments.length, 0);
      const estHeight = 60 + (vote.actions.length * 70) + (argCount * 25);

      // Wrapper div for this vote (border, spacing — same as your original)
      const voteWrapper = document.createElement('div');
      voteWrapper.style.cssText = 'margin-bottom:20px;padding:10px;border:1px solid #ddd;border-radius:5px;';

      // SafeDiv for the content — pass overflow so it doesn't clip
      const safeDivEl = SafeDiv(voteHtml, `overflow-y:auto;max-height:300px;`, 460);
      safeDivEl.style.height = estHeight + 'px';
      safeDivEl.style.maxHeight = '300px';
      voteWrapper.appendChild(safeDivEl);

      // Delete button — real DOM, outside the iframe, uses your existing function
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'swal2-cancel swal2-styled';
      deleteBtn.addEventListener('click', () => deleteVote(vote.id));
      voteWrapper.appendChild(deleteBtn);

      masterContainer.appendChild(voteWrapper);
    });
  }

  await Swal.fire({
    title: 'Your Votes',
    html: masterContainer,
    width: '500px',
    customClass: { popup: 'scrollable-swal-popup' },
    confirmButtonText: 'Close'
  });
}

function deleteVote(voteId) {
  const savedVotes = JSON.parse(localStorage.getItem(myaccounts+'earnUserVotes') || '[]');
  const filtered = savedVotes.filter(v => v.id !== voteId);
  localStorage.setItem(myaccounts+'earnUserVotes', JSON.stringify(filtered));
  Swal.close();
  showVoteDetailsDialog();
}

// ============================================================================
// ROI CALCULATION
// ============================================================================

async function calculateAndDisplayROI() {
  if (!earnState.polWeb3) return;
  
  try {
    // Try to use cached data first if it's recent (< 60 minutes old)
    const cachedData = localStorage.getItem('cachedROIData');
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      if (Date.now() - parsed.timestamp < 60 * 60 * 1000) {
        const roiText = `📈 ${translateThis('Yearly Staking ROI')}: ${stripZeros(parsed.yearlyROI.toFixed(2))}%`;
        document.getElementById('earnRoiText').textContent = roiText;
        document.getElementById('earnRoiDisplay').classList.remove('hidden');
        return;
      }
    }
    
    const baylTreasury = new earnState.polWeb3.eth.Contract(treasuryABI, TREASURY_ADDRESSES.BAYL_TREASURY);
    const totalTokens = validation(DOMPurify.sanitize(await baylTreasury.methods.totalTokens().call()));
    
    // Get current week
    const priorWeek = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) - 1;
    
    // Get prices
    const wethPriceRaw = await getWETHPrice();
    if (wethPriceRaw == "error") {
      throw new Error("Error getting WETH price");
    }
    const bayPriceRaw = await getBAYPrice();
    if (bayPriceRaw == "error") { 
      throw new Error("Error getting BAYL price");
    }
    var wethPrice = parseInt(wethPriceRaw) / 1e8;
    var bayPrice = parseInt(bayPriceRaw) / 1e8;
    
    const daiPrice = 1;
    const usdcPrice = 1;
    
    // Get weekly rewards for each coin
    const wethAddress = TREASURY_ADDRESSES.WETH;
    const daiAddress = TREASURY_ADDRESSES.DAI;
    const usdcAddress = TREASURY_ADDRESSES.USDC;
    
    const wethRewards = validation(DOMPurify.sanitize(await baylTreasury.methods.weeklyRewards(priorWeek, wethAddress).call()));
    const daiRewards = validation(DOMPurify.sanitize(await baylTreasury.methods.weeklyRewards(priorWeek, daiAddress).call()));
    const usdcRewards = validation(DOMPurify.sanitize(await baylTreasury.methods.weeklyRewards(priorWeek, usdcAddress).call()));
    
    const BN = BigNumber;
    const wethRewardsEther = new BN(wethRewards).dividedBy('1e18').toNumber();
    const daiRewardsEther = new BN(daiRewards).dividedBy('1e18').toNumber();
    const usdcRewardsFormatted = new BN(usdcRewards).dividedBy('1e6').toNumber();
    
    const weeklyRewardsUSD = (wethRewardsEther * wethPrice) + (daiRewardsEther * daiPrice) + (usdcRewardsFormatted * usdcPrice);
    const yearlyRewardsUSD = weeklyRewardsUSD * 52;
    
    const totalStakedBAY = new BN(totalTokens).dividedBy('1e8').toNumber();
    const totalStakedUSD = totalStakedBAY * bayPrice;
    let yearlyROI = 0;
    if (totalStakedUSD > 0) {
      yearlyROI = (yearlyRewardsUSD / totalStakedUSD) * 100;
    }
    const roiText = `📈 ${translateThis('Yearly Staking ROI')}: ${stripZeros(yearlyROI.toFixed(2))}%`;
    document.getElementById('earnRoiText').textContent = roiText;
    document.getElementById('earnRoiDisplay').classList.remove('hidden');
    const roiText2 = `📈 ${translateThis('Yearly Staking ROI')}: ${stripZeros(yearlyROI.toFixed(2))}% (${translateThis('Based on weekly rewards')})`;
    const homeRoiNotification = document.getElementById('homeRoiNotification');
    if (homeRoiNotification) {
      homeRoiNotification.textContent = roiText2;
      homeRoiNotification.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error calculating ROI:', error);
  }
}

// ============================================================================
// REFRESH FUNCTIONS
// ============================================================================

async function loadTokenBalances() {
  if (!earnState.polWeb3 || !myaccounts) return;
  
  try {
    const BN = BigNumber;
    const balances = {}; // Store all balances for notification
    
    // Load DAI balance
    const daiContract = new earnState.polWeb3.eth.Contract(
      [{
        "constant": true,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
      }],
      TREASURY_ADDRESSES.DAI // DAI on Polygon
    );
    
    const daiBalance = validation(DOMPurify.sanitize(await daiContract.methods.balanceOf(myaccounts).call()));
    const daiBalanceEther = new BN(daiBalance).dividedBy('1e18');
    
    if (daiBalanceEther.gt(new BN('0'))) {
      document.getElementById('daiBalanceAmount').textContent = stripZeros(daiBalanceEther.toFixed(8, BN.ROUND_DOWN));
      document.getElementById('daiBalance').classList.remove('hidden');
      //balances.DAI = stripZeros(daiBalanceEther.toFixed(2));
    }
    
    // Load USDC balance
    const usdcContract = new earnState.polWeb3.eth.Contract(
      [{
        "constant": true,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
      }],
      TREASURY_ADDRESSES.USDC
    );
    
    const usdcBalance = validation(DOMPurify.sanitize(await usdcContract.methods.balanceOf(myaccounts).call()));
    const usdcBalanceFormatted = new BN(usdcBalance).dividedBy('1e6');
    
    if (usdcBalanceFormatted.gt(new BN('0'))) {
      document.getElementById('usdcBalanceAmount').textContent = stripZeros(usdcBalanceFormatted.toFixed());
      document.getElementById('usdcBalance').classList.remove('hidden');
      balances.USDC = stripZeros(usdcBalanceFormatted.toFixed());
    }
    
    // Load WETH balance
    const wethContract = new earnState.polWeb3.eth.Contract(
      [{
        "constant": true,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
      }],
      TREASURY_ADDRESSES.WETH
    );
    
    const wethBalance = validation(DOMPurify.sanitize(await wethContract.methods.balanceOf(myaccounts).call()));
    const wethBalanceFormatted = new BN(wethBalance).dividedBy('1e18');
    
    if (wethBalanceFormatted.gt(new BN('0'))) {
      document.getElementById('wethBalanceAmount').textContent = stripZeros(wethBalanceFormatted.toFixed(8, BN.ROUND_DOWN));
      document.getElementById('wethBalance').classList.remove('hidden');
      balances.WETH = stripZeros(wethBalanceFormatted.toFixed(8));
    }
    
    // Load POL balance
    const polBalance = validation(DOMPurify.sanitize(await earnState.polWeb3.eth.getBalance(myaccounts)));
    const polBalanceFormatted = new BN(polBalance).dividedBy('1e18');
    
    if (polBalanceFormatted.gt(new BN('0'))) {
      document.getElementById('polBalanceAmount').textContent = stripZeros(polBalanceFormatted.toFixed(8, BN.ROUND_DOWN));
      document.getElementById('polBalance').classList.remove('hidden');
      //balances.POL = stripZeros(polBalanceFormatted.toFixed(2));
    }
    
    // Store balances for potential notification in main page
    if (Object.keys(balances).length > 0) {
      localStorage.setItem(myaccounts+'earnTabBalances', JSON.stringify(balances));
      showBalanceNotification();
      // Show withdraw button if any balances exist
      document.getElementById('withdrawCoinsSection').classList.remove('hidden');
    }
    
  } catch (error) {
    console.error('Error loading token balances:', error);
  }
}

async function showBalanceNotification() {
  var earnBalances = JSON.parse(localStorage.getItem(myaccounts+'earnTabBalances') || '{}');
  const earnBalances2= JSON.parse(localStorage.getItem(myaccounts+'earnTabBalances2') || '{}');
  Object.assign(earnBalances, earnBalances2);
  if (Object.keys(earnBalances).length > 0) {
    const balancesList = Object.keys(earnBalances).map(coin => `${coin} (${earnBalances[coin]})`).join(', ');
    document.getElementById('earn_balances_list').textContent = balancesList;
    const notification = document.getElementById('earn_balances_notification');
    notification.classList.remove('hidden');
    notification.style.display = 'block';
  }
}

// ============================================================================
// DEPOSIT ADDRESS AND WITHDRAWAL FUNCTIONS
// ============================================================================

async function copyDepositAddress(coinType) {
  if (!myaccounts) {
    await Swal.fire(translateThis('Error'), translateThis('Please connect your wallet first'), 'error');
    return;
  }
  
  const address = myaccounts;
  
  // Copy to clipboard
  navigator.clipboard.writeText(address).then(async() => {
    await Swal.fire({
      title: `${coinType} ` + translateThis('Deposit Address'),
      html: `
        <p>${translateThis('Address copied to clipboard!')}</p>
        <p style="word-break: break-all; font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 5px;">
          ${address}
        </p>
        <p style="margin-top: 10px; font-size: 0.9em; color: #777;">
          ${coinType === 'ETH' || coinType === 'Lido' ? translateThis('Network: Ethereum Mainnet') : translateThis('Network: Polygon')}
        </p>
      `,
      icon: 'success',
      confirmButtonText: translateThis('OK')
    });
  }).catch(async() => {
    await Swal.fire({
      title: `${coinType} ` + translateThis('Deposit Address'),
      html: `
        <p style="word-break: break-all; font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 5px;">
          ${address}
        </p>
        <p style="margin-top: 10px; font-size: 0.9em; color: #777;">
          ${coinType === 'ETH' || coinType === 'Lido' ? translateThis('Network: Ethereum Mainnet') : translateThis('Network: Polygon')}
        </p>
      `,
      icon: 'info',
      confirmButtonText: translateThis('OK')
    });
  });
}

async function showWithdrawDialog() {
  if (!earnState.polWeb3 || !myaccounts) {
    await Swal.fire(translateThis('Error'), translateThis('Please connect your wallet first'), 'error');
    return;
  }
  
  // Get available balances
  const balances = [];
  
  try {
    const BN = BigNumber;
    
    // Check POL balance
    const polBalance = validation(DOMPurify.sanitize(await earnState.polWeb3.eth.getBalance(myaccounts)));
    const polBalanceFormatted = new BN(polBalance).dividedBy('1e18');
    if (polBalanceFormatted.gt(new BN('0'))) {
      balances.push({ coin: 'POL', balance: stripZeros(polBalanceFormatted.toFixed(8, BN.ROUND_DOWN)), network: 'Polygon' });
    }
    
    // Check USDC balance
    const usdcContract = new earnState.polWeb3.eth.Contract(
      [{"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
      TREASURY_ADDRESSES.USDC
    );
    const usdcBalance = validation(DOMPurify.sanitize(await usdcContract.methods.balanceOf(myaccounts).call()));
    const usdcBalanceFormatted = new BN(usdcBalance).dividedBy('1e6');
    if (usdcBalanceFormatted.gt(new BN('0'))) {
      balances.push({ coin: 'USDC', balance: stripZeros(usdcBalanceFormatted.toFixed()), network: 'Polygon' });
    }
    
    // Check DAI balance
    const daiContract = new earnState.polWeb3.eth.Contract(
      [{"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
      TREASURY_ADDRESSES.DAI
    );
    const daiBalance = validation(DOMPurify.sanitize(await daiContract.methods.balanceOf(myaccounts).call()));
    const daiBalanceFormatted = new BN(daiBalance).dividedBy('1e18');
    if (daiBalanceFormatted.gt(new BN('0'))) {
      balances.push({ coin: 'DAI', balance: stripZeros(daiBalanceFormatted.toFixed(8, BN.ROUND_DOWN)), network: 'Polygon' });
    }
    
    // Check WETH balance
    const wethContract = new earnState.polWeb3.eth.Contract(
      [{"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
      TREASURY_ADDRESSES.WETH
    );
    const wethBalance = validation(DOMPurify.sanitize(await wethContract.methods.balanceOf(myaccounts).call()));
    const wethBalanceFormatted = new BN(wethBalance).dividedBy('1e18');
    if (wethBalanceFormatted.gt(new BN('0'))) {
      balances.push({ coin: 'WETH', balance: stripZeros(wethBalanceFormatted.toFixed(8, BN.ROUND_DOWN)), network: 'Polygon' });
    }
    
    // Check Ethereum balances if available
    if (earnState.ethWeb3) {
      const ethBalance = validation(DOMPurify.sanitize(await earnState.ethWeb3.eth.getBalance(myaccounts)));
      const ethBalanceFormatted = new BN(ethBalance).dividedBy('1e18');
      if (ethBalanceFormatted.gt(new BN('0'))) {
        balances.push({ coin: 'ETH', balance: stripZeros(ethBalanceFormatted.toFixed(8, BN.ROUND_DOWN)), network: 'Ethereum' });
      }
      
      // Check Lido stETH balance
      const stETHContract = new earnState.ethWeb3.eth.Contract(
        [{"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
        TREASURY_ADDRESSES.LIDO_STETH
      );
      const stETHBalance = validation(DOMPurify.sanitize(await stETHContract.methods.balanceOf(myaccounts).call()));
      const stETHBalanceFormatted = new BN(stETHBalance).dividedBy('1e18');
      if (stETHBalanceFormatted.gt(new BN('0'))) {
        balances.push({ coin: 'stETH (Lido)', balance: stripZeros(stETHBalanceFormatted.toFixed(8, BN.ROUND_DOWN)), network: 'Ethereum' });
      }
    }
    
    if (balances.length === 0) {
      await Swal.fire(translateThis('Info'), translateThis('No available balances to withdraw'), 'info');
      return;
    }
    
    // Build options HTML
    const optionsHTML = balances.map((b, idx) => 
      `<option value="${idx}">${b.coin} - ${b.balance} (${b.network})</option>`
    ).join('');
    
    const result = await Swal.fire({
      title: translateThis('Withdraw Coins'),
      html: `
        <div style="text-align: left;">
          <label style="display: block; margin-bottom: 5px;">${translateThis('Select coin to withdraw')}:</label>
          <select id="withdrawCoinSelect" class="swal2-select" style="width: 100%;">
            ${optionsHTML}
          </select>
          
          <label style="display: block; margin-top: 15px; margin-bottom: 5px;">${translateThis('Amount to withdraw')}:</label>
          <input type="number" id="withdrawAmount" class="swal2-input" placeholder="${translateThis('Enter amount')}" step="0.0001" style="width: 100%;" />
          
          <label style="display: block; margin-top: 15px; margin-bottom: 5px;">${translateThis('Recipient address')}:</label>
          <input type="text" id="withdrawAddress" class="swal2-input" placeholder="0x..." style="width: 100%;" />
          
          <div style="margin-top: 10px; font-size: 0.9em; color: #777;">
            ${translateThis('Leave amount empty to withdraw full balance')}
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: translateThis('Withdraw'),
      cancelButtonText: translateThis('Cancel'),
      preConfirm: () => {
        const coinIdx = parseInt(document.getElementById('withdrawCoinSelect').value);
        const amount = document.getElementById('withdrawAmount').value;
        const address = document.getElementById('withdrawAddress').value;
        
        if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
          Swal.showValidationMessage(translateThis('Please enter a valid Ethereum address'));
          return false;
        }
        
        return { coin: balances[coinIdx], amount, address };
      }
    });
    
    if (result.isConfirmed) {
      await executeWithdrawal(result.value);
    }
    
  } catch (error) {
    console.log(error);
    const message = translateThis('Transaction failed:') + ' ' + translateThis("Please check your browsers console for the full error message");
    await showScrollableError(translateThis('Transaction failed'), message);
  }
}

async function executeWithdrawal(withdrawData) {
  const { coin, amount, address } = withdrawData;
  showSpinner();
  try {
    const BN = BigNumber;
    if (coin.coin === 'POL') {
      // Withdraw POL
      let amountWei;
      if (amount) {
        amountWei = earnState.polWeb3.utils.toWei(amount, 'ether');
      } else {
        // Reserve gas for transaction when withdrawing full balance
        const balance = validation(DOMPurify.sanitize(await earnState.polWeb3.eth.getBalance(myaccounts)));
        const gasPrice2 = validation(DOMPurify.sanitize(await earnState.polWeb3.eth.getGasPrice()));
        const gasCost = (new BN(gasPrice2).times(150000)).times(1.5);
        amountWei = new BN(balance).minus(gasCost).toFixed(0, BN.ROUND_DOWN);
        if (new BN(amountWei).lte(new BN('0'))) {
          throw new Error('Insufficient balance to cover gas fees');
        }
      }
      await sendTx("ETH",amountWei.toString(),[address],150000,"0",true);
    } else if (coin.coin === 'ETH') {
      // Withdraw ETH
      let amountWei;
      if (amount) {
        amountWei = earnState.ethWeb3.utils.toWei(amount, 'ether');
      } else {
        // Reserve gas for transaction when withdrawing full balance
        const balance = validation(DOMPurify.sanitize(await earnState.ethWeb3.eth.getBalance(myaccounts)));
        const ethGasPrice = validation(DOMPurify.sanitize(await earnState.ethWeb3.eth.getGasPrice()));
        const gasCost = (new BN(ethGasPrice).times(150000)).times(1.5);
        amountWei = new BN(balance).minus(gasCost).toFixed(0, BN.ROUND_DOWN);
        if (new BN(amountWei).lte(new BN('0'))) {
          throw new Error('Insufficient balance to cover gas fees');
        }
      }
      await sendTx("ETH",amountWei.toString(),[address],150000,"0",true,true);
    } else {
      // Withdraw ERC20 token
      let tokenAddress, decimals, web3Instance;
      if (coin.coin === 'USDC') {
        tokenAddress = TREASURY_ADDRESSES.USDC;
        decimals = '1e6';
        web3Instance = earnState.polWeb3;
      } else if (coin.coin === 'DAI') {
        tokenAddress = TREASURY_ADDRESSES.DAI;
        decimals = '1e18';
        web3Instance = earnState.polWeb3;
      } else if (coin.coin === 'WETH') {
        tokenAddress = TREASURY_ADDRESSES.WETH;
        decimals = '1e18';
        web3Instance = earnState.polWeb3;
      } else if (coin.coin === 'stETH (Lido)') {
        tokenAddress = TREASURY_ADDRESSES.LIDO_STETH;
        decimals = '1e18';
        web3Instance = earnState.ethWeb3;
      }
      const tokenContract = new web3Instance.eth.Contract(
        [{"constant": false, "inputs": [{"name": "recipient", "type": "address"}, {"name": "amount", "type": "uint256"}], "name": "transfer", "outputs": [{"name": "", "type": "bool"}], "type": "function"},
         {"constant": true, "inputs": [{"name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"}],
        tokenAddress
      );
      const balance = validation(DOMPurify.sanitize(await tokenContract.methods.balanceOf(myaccounts).call()));
      const amountWei = amount ? new BN(amount).times(decimals).toFixed(0, BN.ROUND_DOWN) : balance;
      if(coin.coin === 'stETH (Lido)') {
        await sendTx(tokenContract, "transfer", [address, amountWei], 150000, "0", true, false, true);
      } else {
        await sendTx(tokenContract, "transfer", [address, amountWei], 150000, "0", true, false);
      }
    }
    hideSpinner();
    await Swal.fire(translateThis('Success'), `${coin.coin} ` + translateThis('withdrawn successfully!'), 'success');
    await refreshStakingInfo();
  } catch (error) {
    hideSpinner();
    console.log(error);
    const message = translateThis('Transaction failed:') + ' ' + translateThis("Please check your browsers console for the full error message");
    await showScrollableError(translateThis('Transaction failed'), message);
  }
}

// Refresh only StableVault-related info after user deposit/withdraw
async function refreshStableVaultInfo() {
  if (!earnState.polWeb3 || !myaccounts) return;
  await loadStableVaultInfo();
  await loadTokenBalances();
}

// Refresh only Lido-related info after user deposit/withdraw
async function refreshLidoInfo() {
  if (!earnState.ethWeb3 || !myaccounts) return;
  await loadLidoVaultInfo();
  await loadUserLidoPosition();
  await loadETHBalances();
}

// Refresh only staking-related info after user stake/unstake
async function refreshStakingInfo() {
  if (!earnState.polWeb3 || !myaccounts) return;
  await loadStakingInfo();
  await loadTokenBalances();
}

// Refresh only voting-related info
async function refreshVotingInfo() {
  if (!earnState.polWeb3) return;
  await loadVotingInfo();
}

// ============================================================================
// REFRESH AND INITIALIZATION
// ============================================================================

async function refreshEarnTab() {
  // Don't refresh if user is not logged in
  if (!myaccounts || loginType === 0) {
    console.log('User not logged in, skipping Earn tab refresh');
    return;
  }
  
  const now = Date.now();
  
  // Refresh Ethereum data
  if (now - earnState.lastEthCheck > 300000) {
    earnState.lastEthCheck = now;
    await loadLidoVaultInfo();
    await loadUserLidoPosition();
    await loadETHBalances();
  }
  
  // Refresh Polygon data
  if (now - earnState.lastPolCheck > 180000) {    
    earnState.lastPolCheck = now;
    await calculateAndDisplayROI();
    await loadTokenBalances();
    await delay(15000);
    await loadStableVaultInfo();
    await delay(15000);
    await loadStakingInfo();
    await delay(15000);
    await loadTopStakers();
    await loadVotingInfo();
  }
}

// ============================================================================
// INITIALIZATION ON PAGE LOAD
// ============================================================================

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    initializeEarnTab();
    // Set up periodic refresh
    setInterval(refreshEarnTab, 300000); // Every five minutes
  });
}
