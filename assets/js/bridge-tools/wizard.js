// Automation Wizard for BitBay Bridge

var wizardState = {
  polPrice: 0,
  ethPrice: 0,
  bayPrice: 0,
  bayrPrice: 0,
  polBalance: 0,
  ethBalance: 0
};

var ETH_GAS_LIDO = 500000;
var ETH_GAS_SWAP = 500000;
var ETH_GAS_SEND = 150000;
var MIN_ALLOC_USD = 0.50;

function getWizardStorageKey() {
  return myaccounts + '_automationWizard';
}

function getWizardData() {
  try {
    var data = localStorage.getItem(getWizardStorageKey());
    return data ? JSON.parse(data) : null;
  } catch(e) {
    return null;
  }
}

function setWizardData(data) {
  localStorage.setItem(getWizardStorageKey(), JSON.stringify(data));
}

function clearWizardData() {
  localStorage.removeItem(getWizardStorageKey());
}

function getNewUserKey() {
  return myaccounts + '_wizardDeclined';
}

async function fetchPrices() {
  var polRaw = await getPOLPrice();
  var ethRaw = await getWETHPrice();
  var bayRaw = await getBAYPrice();
  var bayrRaw = await getBAYRPrice();

  wizardState.polPrice = polRaw !== "error" ? parseInt(polRaw) / 1e8 : 0;
  wizardState.ethPrice = ethRaw !== "error" ? parseInt(ethRaw) / 1e8 : 0;
  wizardState.bayPrice = bayRaw !== "error" ? parseInt(bayRaw) / 1e8 : 0;
  wizardState.bayrPrice = bayrRaw !== "error" ? parseInt(bayrRaw) / 1e8 : 0;
}

async function fetchBalances() {
  try {
    var polBal = validation(DOMPurify.sanitize(await web3.eth.getBalance(myaccounts)));
    wizardState.polBalance = parseFloat(new BigNumber(polBal).dividedBy('1e18').toFixed(8));
  } catch(e) {
    wizardState.polBalance = 0;
  }
  try {
    var ethRpc = typeof getEthereumRpc === 'function' ? getEthereumRpc() : 'https://eth.drpc.org/';
    var ethWeb3 = new Web3(ethRpc);
    var ethBal = validation(DOMPurify.sanitize(await ethWeb3.eth.getBalance(myaccounts)));
    wizardState.ethBalance = parseFloat(new BigNumber(ethBal).dividedBy('1e18').toFixed(8));
  } catch(e) {
    wizardState.ethBalance = 0;
  }
}

async function estimateEthGasPrice() {
  try {
    var ethRpc = typeof getEthereumRpc === 'function' ? getEthereumRpc() : 'https://eth.drpc.org/';
    var ethWeb3 = new Web3(ethRpc);
    var gp = validation(DOMPurify.sanitize(await ethWeb3.eth.getGasPrice()));
    var gpBN = new BigNumber(gp).times(1.5);
    if (gpBN.gt('500000000000')) gpBN = new BigNumber('500000000000');
    if (gpBN.lt('100000000')) gpBN = new BigNumber('100000000');
    return gpBN;
  } catch(e) {
    return false;
  }
}

async function ensureWalletUnlocked() {
  if (loginType === 1) {
    var result = await Swal.fire({
      title: translateThis('Wallet Unlock Required'),
      html: '<div style="text-align:left;max-height:400px;overflow-y:auto;">' +
        '<p>' + translateThis('The automation wizard requires the ability to sign transactions on your behalf. For your security, Metamask does not reveal the private key for your connected account.') + '</p><br>' +
        '<p>' + translateThis('It is recommended that you connect to this site using a password instead of Metamask. However if you wish to use the wizard with Metamask you may unlock your wallet directly using your private key.') + '</p><br>' +
        '<p><strong>' + translateThis('Security Notice') + ':</strong> ' + translateThis('We only recommend this option if you trust the source code of this site. You may also wish to run the code locally. You are responsible for the risks of direct key handling.') + '</p><br>' +
        '<p>' + translateThis('If you agree, you may continue and unlock your wallet using your private key.') + '</p>' +
        '</div>',
      showCancelButton: true,
      confirmButtonText: translateThis('Unlock with Private Key'),
      cancelButtonText: translateThis('Cancel'),
      width: 550
    });
    if (!result.isConfirmed) return false;

    var pkResult = await Swal.fire({
      title: translateThis('Enter Private Key'),
      html: '<div style="text-align:left;">' +
        '<p>' + translateThis('Enter the private key for your connected wallet') + ':</p>' +
        '<p style="font-size:0.9em;color:#777;">' + translateThis('Address') + ': ' + myaccounts + '</p>' +
        '<input type="password" id="wizardPKInput" class="swal2-input" placeholder="' + translateThis('Private Key (with or without 0x)') + '" style="width:100%;">' +
        '</div>',
      showCancelButton: true,
      confirmButtonText: translateThis('Unlock'),
      cancelButtonText: translateThis('Cancel'),
      preConfirm: function() {
        var pk = document.getElementById('wizardPKInput').value.trim();
        if (!pk) {
          Swal.showValidationMessage(translateThis('Please enter a private key'));
          return false;
        }
        if (!pk.startsWith('0x')) pk = '0x' + pk;
        if (pk.length !== 66 || !/^0x[a-fA-F0-9]{64}$/.test(pk)) {
          Swal.showValidationMessage(translateThis('Invalid private key format'));
          return false;
        }
        return pk;
      }
    });
    if (!pkResult.isConfirmed) return false;

    try {
      var account = web3.eth.accounts.privateKeyToAccount(pkResult.value);
      if (account.address.toLowerCase() !== myaccounts.toLowerCase()) {
        await Swal.fire(translateThis('Error'), translateThis('The private key does not match your connected wallet address.'), 'error');
        return false;
      }
      web3.eth.accounts.wallet.add(pkResult.value);
      loginType = 2;
      earnState.isPasswordLogin = true;
      await Swal.fire({
        icon: 'success',
        title: translateThis('Wallet Unlocked'),
        text: translateThis('Your wallet has been unlocked for automation.'),
        timer: 2000,
        showConfirmButton: false
      });
      return true;
    } catch(e) {
      await Swal.fire(translateThis('Error'), translateThis('Failed to verify private key. Please check that it is correct.'), 'error');
      return false;
    }
  }
  return true;
}

function toggleAccordionPanel(headerEl) {
  var panel = headerEl.nextElementSibling;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function buildAccordionItem(id, emoji, title, description, checked, extraHTML) {
  return '<div style="border:1px solid #ccc;border-radius:6px;margin-bottom:8px;overflow:hidden;">' +
    '<div class="wizAccordionHeader" style="display:flex;align-items:center;padding:10px 12px;cursor:pointer;background:#f7f7f7;">' +
      '<input type="checkbox" id="wiz_' + id + '" ' + (checked ? 'checked' : '') +
        ' style="all:unset;display:inline-block;cursor:pointer;appearance:auto;-webkit-appearance:checkbox;-moz-appearance:checkbox;margin-right:8px;flex-shrink:0;" onclick="event.stopPropagation()">' +
      '<span style="font-size:1.1em;">' + emoji + ' ' + title + '</span>' +
      '<span style="margin-left:auto;font-size:0.8em;color:#999;">▼</span>' +
    '</div>' +
    '<div style="display:none;padding:10px 12px;font-size:0.9em;text-align:left;">' +
      '<p>' + description + '</p>' +
      (extraHTML || '') +
    '</div>' +
  '</div>';
}

function adjustAllocations(sliders, changedId) {
  var priority = ['lido', 'stable', 'bay', 'bayr'];
  var total = 0;
  for (var i = 0; i < priority.length; i++) total += parseInt(sliders[priority[i]].value) || 0;
  if (total <= 100) {
    updateAllocationDisplay(sliders);
    return;
  }
  var excess = total - 100;
  var reducePriority = ['bayr', 'bay', 'stable', 'lido'];
  var idx = reducePriority.indexOf(changedId);
  if (idx !== -1) reducePriority.splice(idx, 1);
  for (var j = 0; j < reducePriority.length && excess > 0; j++) {
    var key = reducePriority[j];
    var val = parseInt(sliders[key].value) || 0;
    var reduction = Math.min(val, excess);
    sliders[key].value = val - reduction;
    excess -= reduction;
  }
  updateAllocationDisplay(sliders);
}

function updateAllocationDisplay(sliders) {
  var priority = ['lido', 'stable', 'bay', 'bayr'];
  for (var i = 0; i < priority.length; i++) {
    var disp = document.getElementById('wizAlloc_' + priority[i]);
    if (disp) disp.textContent = sliders[priority[i]].value + '%';
  }
  var total = 0;
  for (var k = 0; k < priority.length; k++) total += parseInt(sliders[priority[k]].value) || 0;
  var totalDisp = document.getElementById('wizAllocTotal');
  if (totalDisp) {
    totalDisp.textContent = translateThis('Total') + ': ' + total + '%';
    totalDisp.style.color = total > 100 ? 'red' : '#333';
  }
}

function sliderHTML(id, label) {
  return '<div style="margin-top:8px;">' +
    '<label style="font-size:0.85em;">' + label + ': <span id="wizAlloc_' + id + '">25%</span></label>' +
    '<input type="range" id="wizSlider_' + id + '" min="0" max="100" value="25" style="width:100%;">' +
    '</div>';
}

window.launchAutomationWizard = async function() {
  if (!myaccounts || loginType === 0) {
    await Swal.fire(translateThis('Error'), translateThis('Please connect your wallet first'), 'error');
    return;
  }

  // If an automation is already in progress, defer to the status panel rather
  // than starting a new wizard. Completed/failed runs fall through to a fresh
  // wizard so the user can clear and start again from the same button.
  var existing = getWizardData();
  if (existing && existing.status !== 'complete' && existing.status !== 'failed') {
    showAutomationBanner();
    await openAutomationStatusDialog();
    return;
  }

  var unlocked = await ensureWalletUnlocked();
  if (!unlocked) return;

  showSpinner();
  var lidoMinDays = 1;
  var lidoMaxDays = 180;
  try {
    await fetchPrices();
    await fetchBalances();
    try {
      var ethRpcW = typeof getEthereumRpc === 'function' ? getEthereumRpc() : 'https://eth.drpc.org/';
      var ethW3W = new Web3(ethRpcW);
      var lidoCtr = new ethW3W.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);
      var minRaw = parseInt(validation(DOMPurify.sanitize(await lidoCtr.methods.mindays().call())));
      var maxRaw = parseInt(validation(DOMPurify.sanitize(await lidoCtr.methods.maxdays().call())));
      if (!isNaN(minRaw) && minRaw > 0) lidoMinDays = minRaw;
      if (!isNaN(maxRaw) && maxRaw > 0) lidoMaxDays = maxRaw;
    } catch(le) {
      console.log('Wizard lido bounds fetch error:', le);
    }
  } catch(e) {
    console.log('Wizard price/balance fetch error:', e);
  }
  hideSpinner();

  if (wizardState.ethPrice <= 0) {
    await Swal.fire(translateThis('Error'), translateThis('Unable to fetch current prices. Please try again later.'), 'error');
    return;
  }

  var polNeedGas = wizardState.polBalance < 5 || (wizardState.polBalance * wizardState.polPrice) < 2;
  var polChecked = polNeedGas;
  var polRec = polNeedGas
    ? translateThis('Recommended: Your POL balance is low.')
    : translateThis('Your POL balance appears sufficient.');

  var polPriceDisplay = wizardState.polPrice > 0 ? '$' + wizardState.polPrice.toFixed(4) : 'N/A';
  var ethPriceDisplay = wizardState.ethPrice > 0 ? '$' + wizardState.ethPrice.toFixed(2) : 'N/A';

  var accordionHTML =
    buildAccordionItem('pol', '⛽', translateThis('Get Polygon for Gas'),
      polRec + ' ' + translateThis('Current POL price') + ': ' + polPriceDisplay +
      '. ' + translateThis('This will acquire POL for gas fees with ±10% slippage based on market rate.'),
      polChecked, '') +

    buildAccordionItem('lido', '🏦', translateThis('Hold ETH Long Term (Lido)'),
      translateThis('Hold your ETH long term to avoid spending it so your investment can grow similar to a trust account while simultaneously supporting the ecosystem in a completely safe and decentralized way.'),
      true,
      sliderHTML('lido', translateThis('Allocation')) +
      '<div style="margin-top:6px;">' +
        '<label style="font-size:0.85em;">' + translateThis('Lock Period (days)') + ':</label>' +
        '<input type="number" id="wizLidoDays" value="180" min="'+lidoMinDays+'" max="'+lidoMaxDays+'" class="swal2-input" style="width:100px;height:30px;font-size:0.9em;padding:4px;">' +
        '<span style="font-size:0.8em;color:#777;margin-left:6px;">' + translateThis('Default: 180 days (≈6 months)') + '</span>' +
      '</div>') +

    buildAccordionItem('stable', '💱', translateThis('Earn Yield at Uniswap (StableVault)'),
      translateThis('Earn a decentralized and reliable profit from stablecoin pair trading fees where the position is automatically managed to maximize profits while supporting the ecosystem. Includes ±7% slippage for the trade to get DAI.'),
      true,
      sliderHTML('stable', translateThis('Allocation'))) +

    buildAccordionItem('bay', '🪙', translateThis('Buy BitBay'),
      translateThis('Purchase BitBay (BAY) liquid tokens. Slippage: ±10%.'),
      true,
      sliderHTML('bay', translateThis('Allocation'))) +

    buildAccordionItem('bayr', '🏛️', translateThis('Buy BitBay Reserve'),
      translateThis('Purchase BitBay Reserve (BAYR) tokens. Slippage: ±10%.'),
      true,
      sliderHTML('bayr', translateThis('Allocation')));

  var wizResult = await Swal.fire({
    title: '🧙 ' + translateThis('Automation Wizard'),
    html: '<div style="max-height:60vh;overflow-y:auto;overflow-x:hidden;text-align:left;padding-right:4px;">' +
      '<p style="margin-bottom:12px;">' + translateThis('This tool will help you get started with the most popular features to start earning so you may become a part of the BitBay ecosystem.') + '</p>' +
      accordionHTML +
      '<div id="wizAllocTotal" style="text-align:right;font-weight:bold;margin-top:4px;">' + translateThis('Total') + ': 100%</div>' +
      '</div>',
    width: '500px',
    showCancelButton: true,
    confirmButtonText: translateThis('Continue'),
    cancelButtonText: translateThis('Cancel'),
    didOpen: function() {
      var headers = document.querySelectorAll('.wizAccordionHeader');
      for (var h = 0; h < headers.length; h++) {
        headers[h].addEventListener('click', function() { toggleAccordionPanel(this); });
      }
      var sliders = {
        lido: document.getElementById('wizSlider_lido'),
        stable: document.getElementById('wizSlider_stable'),
        bay: document.getElementById('wizSlider_bay'),
        bayr: document.getElementById('wizSlider_bayr')
      };
      var ids = ['lido', 'stable', 'bay', 'bayr'];
      for (var i = 0; i < ids.length; i++) {
        (function(id) {
          if (sliders[id]) {
            sliders[id].addEventListener('input', function() {
              adjustAllocations(sliders, id);
            });
          }
        })(ids[i]);
      }
      for (var c = 0; c < ids.length; c++) {
        (function(id) {
          var cb = document.getElementById('wiz_' + id);
          if (cb && sliders[id]) {
            cb.addEventListener('change', function() {
              if (!cb.checked) {
                sliders[id].value = 0;
              } else if (parseInt(sliders[id].value) === 0) {
                sliders[id].value = 25;
              }
              adjustAllocations(sliders, id);
            });
          }
        })(ids[c]);
      }
      updateAllocationDisplay(sliders);
    },
    preConfirm: function() {
      var lidoDaysParsed = parseInt(document.getElementById('wizLidoDays').value);
      var choices = {
        pol: document.getElementById('wiz_pol').checked,
        lido: document.getElementById('wiz_lido').checked,
        stable: document.getElementById('wiz_stable').checked,
        bay: document.getElementById('wiz_bay').checked,
        bayr: document.getElementById('wiz_bayr').checked,
        allocLido: parseInt(document.getElementById('wizSlider_lido').value) || 0,
        allocStable: parseInt(document.getElementById('wizSlider_stable').value) || 0,
        allocBay: parseInt(document.getElementById('wizSlider_bay').value) || 0,
        allocBayr: parseInt(document.getElementById('wizSlider_bayr').value) || 0,
        lidoDays: lidoDaysParsed
      };
      if (!choices.pol && !choices.lido && !choices.stable && !choices.bay && !choices.bayr) {
        Swal.close();
        Swal.fire(translateThis('Nothing Selected'), translateThis('No options were selected. The wizard has been closed.'), 'info');
        return false;
      }
      if (choices.lido) {
        if (isNaN(lidoDaysParsed) || lidoDaysParsed < lidoMinDays || lidoDaysParsed > lidoMaxDays) {
          Swal.showValidationMessage(translateThis('Lock period must be between') + ' ' + lidoMinDays + ' ' + translateThis('and') + ' ' + lidoMaxDays + ' ' + translateThis('days'));
          return false;
        }
      }
      console.log(choices)
      return choices;
    }
  });

  if (!wizResult.isConfirmed || !wizResult.value) return;
  var choices = wizResult.value;

  if(wizardState.polBalance == 0 && !choices.pol && (choices.bay || choices.bayr || choices.stable)) {
    await Swal.fire({
      title:translateThis("Polygon gas required"),
      text:translateThis("In order to automate transactions it is required to allocate some funds to handle any gas/network costs. Please try again.")
    });
    return;
  }

  var disclaimers = [];
  disclaimers.push('<li>' + translateThis('This website is not an exchange and does not take custody of user funds or charge any fees. It is designed to maximize your security by keeping all actions client-side. Although Uniswap/Curve/etc are generally considered safe, we recommend reviewing the source code of any DEX and understanding the associated risks. This website is open source and has been audited, but for maximum security we encourage users to download the code from GitHub and run it locally.') + '</li>');

  if (choices.pol) {
    disclaimers.push('<li><strong>' + translateThis('Polygon Gas') + ':</strong> ' + translateThis('A portion of your ETH will be used to acquire POL for gas. The final amount may vary ±10% due to slippage.') + '</li>');
  }
  if (choices.lido) {
    disclaimers.push('<li><strong>' + translateThis('Lido HODL') + ':</strong> ' + translateThis('By proceeding, you acknowledge that the desired ETH will be traded into Lido Staked ETH through the decentralized exchange Curve. 100% of staking yields go to BAY stakers. Your principal is locked until unlock date. Lido is well-audited although you should be aware of third party contract risks.') + '</li>');
  }
  if (choices.stable) {
    disclaimers.push('<li><strong>' + translateThis('StableVault') + ':</strong> ' + translateThis('Stablecoin pairs are very low risk but you should always audit the source code. BitBay is a community-driven project and not responsible for bugs, errors, or omissions. The stablecoin position is managed by stakers within very tight ranges for security and to get the best yield. Impermanent loss is very unlikely due to these hard coded protections. DAI and USDC are bridged tokens so you should understand their risks. UniSwap V4 risks also apply so please do your due diligence.') + '</li>');
  }
  if (choices.bay || choices.bayr) {
    disclaimers.push('<li><strong>' + translateThis('BAY/BAYR Purchase') + ':</strong> ' + translateThis('The exact amount of tokens you receive may vary due to fees and price fluctuations. Trades are designed to stay within ±10% of the spot price. Any unallocated funds will be returned as change.') + '</li>');
  }

  var disclaimerResult = await Swal.fire({
    title: translateThis('Important Disclaimers'),
    html: '<div style="max-height:50vh;overflow-y:auto;text-align:left;padding-right:4px;">' +
      '<ul style="padding-left:18px;">' + disclaimers.join('') + '</ul>' +
      '</div>',
    icon: 'warning',
    width: '520px',
    showCancelButton: true,
    confirmButtonText: translateThis('I Understand & Continue'),
    cancelButtonText: translateThis('Cancel')
  });
  if (!disclaimerResult.isConfirmed) return;

  var ethResult = await Swal.fire({
    title: translateThis('ETH Deposit Amount'),
    html: '<div style="text-align:left;">' +
      '<p>' + translateThis('How much ETH on the Ethereum network do you intend to deposit?') + '</p>' +
      '<p style="color:#777;">' + translateThis('Current ETH price') + ': ' + ethPriceDisplay + '</p>' +
      '<input type="number" id="wizEthAmount" class="swal2-input" placeholder="0.0" step="0.001" style="width:100%;">' +
      '</div>',
    showCancelButton: true,
    confirmButtonText: translateThis('Continue'),
    cancelButtonText: translateThis('Cancel'),
    preConfirm: function() {
      var val = parseFloat(document.getElementById('wizEthAmount').value);
      if (!val || val <= 0) {
        Swal.showValidationMessage(translateThis('Please enter a valid ETH amount'));
        return false;
      }
      return val;
    }
  });
  if (!ethResult.isConfirmed) return;
  var ethAmount = ethResult.value;

  var ethGasPrice = await estimateEthGasPrice();
  if(!ethGasPrice) {
    await Swal.fire(translateThis("Error fetching gas price."));
    return;
  }
  var lidoGasCostETH = 0;
  var bridgeSendCostETH = 0;
  var swapCostETH = 0;
  if (choices.lido) {
    lidoGasCostETH = parseFloat(ethGasPrice.times(ETH_GAS_LIDO).dividedBy('1e18').toFixed(8));
  }
  var needsBridge = choices.stable || choices.bay || choices.bayr || choices.pol;
  if (needsBridge) {
    bridgeSendCostETH = parseFloat(ethGasPrice.times(ETH_GAS_SEND).dividedBy('1e18').toFixed(8));
  }
  if (choices.pol) {
    swapCostETH = parseFloat(ethGasPrice.times(ETH_GAS_SWAP).dividedBy('1e18').toFixed(8));
  }
  var totalGasCostETH = lidoGasCostETH + bridgeSendCostETH + swapCostETH;

  var ethUSD = ethAmount * wizardState.ethPrice;
  var polCostETH = 0;
  var polCostUSD = 0;
  if (choices.pol && wizardState.polPrice > 0) {
    var polTargetUSD = 10 * wizardState.polPrice;
    if (polTargetUSD < 5) polTargetUSD = 5;
    if (polTargetUSD > 10) polTargetUSD = 10;
    polCostUSD = polTargetUSD * 1.05;
    polCostETH = polCostUSD / wizardState.ethPrice;
  }

  var remainingETH = ethAmount - polCostETH - totalGasCostETH;
  if (remainingETH < 0) {
    await Swal.fire({
      title: translateThis('Insufficient ETH'),
      html: '<p>' + translateThis('The ETH amount specified is not enough to cover the gas and transaction costs.') + '</p>' +
        (polCostETH > 0 ? '<p>' + translateThis('POL cost') + ': ~' + polCostETH.toFixed(6) + ' ETH ($' + polCostUSD.toFixed(2) + ')</p>' : '') +
        '<p>' + translateThis('Estimated ETH gas') + ': ~' + totalGasCostETH.toFixed(6) + ' ETH</p>' +
        '<p>' + translateThis('You specified') + ': ' + ethAmount.toFixed(6) + ' ETH ($' + ethUSD.toFixed(2) + ')</p>',
      icon: 'error'
    });
    return;
  }

  var totalAlloc = (choices.lido ? choices.allocLido : 0) +
                   (choices.stable ? choices.allocStable : 0) +
                   (choices.bay ? choices.allocBay : 0) +
                   (choices.bayr ? choices.allocBayr : 0);
  if (totalAlloc === 0) totalAlloc = 1;

  var lidoETH = choices.lido ? remainingETH * (choices.allocLido / 100) : 0;
  var stableETH = choices.stable ? remainingETH * (choices.allocStable / 100) : 0;
  var bayETH = choices.bay ? remainingETH * (choices.allocBay / 100) : 0;
  var bayrETH = choices.bayr ? remainingETH * (choices.allocBayr / 100) : 0;

  var tooSmall = [];
  if (choices.lido && lidoETH * wizardState.ethPrice < MIN_ALLOC_USD) tooSmall.push('Lido HODL');
  if (choices.stable && stableETH * wizardState.ethPrice < MIN_ALLOC_USD) tooSmall.push('StableVault');
  if (choices.bay && bayETH * wizardState.ethPrice < MIN_ALLOC_USD) tooSmall.push('Buy BAY');
  if (choices.bayr && bayrETH * wizardState.ethPrice < MIN_ALLOC_USD) tooSmall.push('Buy BAYR');
  if (tooSmall.length > 0) {
    await Swal.fire({
      title: translateThis('Insufficient ETH'),
      html: '<p>' + translateThis('We recommend at least $0.50 per selected allocation to cover transaction costs. The following allocations are too small:') + '</p>' +
        '<p><strong>' + tooSmall.join(', ') + '</strong></p>' +
        '<p>' + translateThis('Please increase the total ETH amount or reduce the number of selected tasks.') + '</p>',
      icon: 'warning'
    });
    return;
  }

  var lidoUSD = lidoETH * wizardState.ethPrice;
  var stableUSD = stableETH * wizardState.ethPrice;
  var bayUSD = bayETH * wizardState.ethPrice;
  var bayrUSD = bayrETH * wizardState.ethPrice;
  var gasCostUSD = totalGasCostETH * wizardState.ethPrice;

  var summaryHTML = '<div style="text-align:left;font-size:0.9em;max-height:50vh;overflow-y:auto;padding-right:4px;">';
  summaryHTML += '<table style="width:100%;border-collapse:collapse;">';
  summaryHTML += '<tr style="border-bottom:1px solid #eee;"><th style="text-align:left;padding:4px;">' + translateThis('Task') + '</th><th style="text-align:right;padding:4px;">ETH</th><th style="text-align:right;padding:4px;">~USD</th></tr>';

  if (totalGasCostETH > 0) {
    var gasLabel = '⛏️ ' + translateThis('Est. ETH gas');
    if (choices.lido && needsBridge) gasLabel += ' (Lido + bridge)';
    else if (choices.lido) gasLabel += ' (Lido)';
    else gasLabel += ' (bridge send)';
    summaryHTML += '<tr style="border-bottom:1px solid #eee;color:#777;"><td style="padding:4px;">' + gasLabel + '</td><td style="text-align:right;padding:4px;">' + totalGasCostETH.toFixed(6) + '</td><td style="text-align:right;padding:4px;">$' + gasCostUSD.toFixed(2) + '</td></tr>';
  }
  if (choices.pol) {
    summaryHTML += '<tr style="border-bottom:1px solid #eee;"><td style="padding:4px;">⛽ ' + translateThis('Get POL') + ' (±10%)</td><td style="text-align:right;padding:4px;">' + polCostETH.toFixed(6) + '</td><td style="text-align:right;padding:4px;">$' + polCostUSD.toFixed(2) + '</td></tr>';
  }
  if (choices.lido) {
    summaryHTML += '<tr style="border-bottom:1px solid #eee;"><td style="padding:4px;">🏦 ' + translateThis('Lido HODL') + ' (' + choices.lidoDays + ' ' + translateThis('days') + ')</td><td style="text-align:right;padding:4px;">' + lidoETH.toFixed(6) + '</td><td style="text-align:right;padding:4px;">$' + lidoUSD.toFixed(2) + '</td></tr>';
  }
  if (choices.stable) {
    summaryHTML += '<tr style="border-bottom:1px solid #eee;"><td style="padding:4px;">💱 ' + translateThis('StableVault') + ' (±7%)</td><td style="text-align:right;padding:4px;">' + stableETH.toFixed(6) + '</td><td style="text-align:right;padding:4px;">$' + stableUSD.toFixed(2) + '</td></tr>';
  }
  if (choices.bay) {
    summaryHTML += '<tr style="border-bottom:1px solid #eee;"><td style="padding:4px;">🪙 ' + translateThis('Buy BAY') + ' (±10%)</td><td style="text-align:right;padding:4px;">' + bayETH.toFixed(6) + '</td><td style="text-align:right;padding:4px;">$' + bayUSD.toFixed(2) + '</td></tr>';
  }
  if (choices.bayr) {
    summaryHTML += '<tr style="border-bottom:1px solid #eee;"><td style="padding:4px;">🏛️ ' + translateThis('Buy BAYR') + ' (±10%)</td><td style="text-align:right;padding:4px;">' + bayrETH.toFixed(6) + '</td><td style="text-align:right;padding:4px;">$' + bayrUSD.toFixed(2) + '</td></tr>';
  }
  if(totalAlloc < 100) {
    var mychange = (remainingETH.toFixed(6) - bayrETH.toFixed(6) - bayETH.toFixed(6) - stableETH.toFixed(6) - lidoETH.toFixed(6)).toFixed(6);
    var mychange1 = (mychange * wizardState.ethPrice).toFixed(2);
    summaryHTML += '<tr style="border-bottom:1px solid #eee;"><td style="padding:4px;">💰 ' + translateThis('Change') + ' ~</td><td style="text-align:right;padding:4px;">' + mychange + '</td><td style="text-align:right;padding:4px;">$' + mychange1 + '</td></tr>';
  }

  summaryHTML += '<tr style="font-weight:bold;border-top:2px solid #333;"><td style="padding:4px;">' + translateThis('Total') + '</td><td style="text-align:right;padding:4px;">' + ethAmount.toFixed(6) + '</td><td style="text-align:right;padding:4px;">$' + ethUSD.toFixed(2) + '</td></tr>';
  summaryHTML += '</table>';
  summaryHTML += '<p style="margin-top:10px;color:#777;font-size:0.85em;">' + translateThis('Please check these rates to make sure they are accurate. The price of ETH may vary during the transaction and purchases will be made based on the percentage specified. Final amounts may vary slightly based on slippage.') + '</p>';
  summaryHTML += '</div>';

  var confirmResult = await Swal.fire({
    title: translateThis('Confirm Automation'),
    html: summaryHTML,
    width: '520px',
    showCancelButton: true,
    confirmButtonText: translateThis('Approve & Start'),
    cancelButtonText: translateThis('Cancel')
  });
  if (!confirmResult.isConfirmed) return;

  var depositAddress = myaccounts;
  var BN = BigNumber;
  var ethPxBN = new BN(wizardState.ethPrice);
  // Pre-compute per-task DAI targets in wei (DAI = 18 decimals, same as ETH),
  // so task budgeting stays in BigNumber wei from here on.
  var daiTargets = {
    stable: new BN(stableETH).times(ethPxBN).times('1e18').integerValue(BN.ROUND_DOWN).toFixed(0),
    bay:    new BN(bayETH).times(ethPxBN).times('1e18').integerValue(BN.ROUND_DOWN).toFixed(0),
    bayr:   new BN(bayrETH).times(ethPxBN).times('1e18').integerValue(BN.ROUND_DOWN).toFixed(0)
  };
  var savedData = {
    account: myaccounts,
    timestamp: Date.now(),
    ethAmount: ethAmount,
    choices: choices,
    prices: {
      pol: wizardState.polPrice,
      eth: wizardState.ethPrice,
      bay: wizardState.bayPrice,
      bayr: wizardState.bayrPrice
    },
    breakdown: {
      gasCostETH: totalGasCostETH,
      polETH: polCostETH,
      lidoETH: lidoETH,
      stableETH: stableETH,
      bayETH: bayETH,
      bayrETH: bayrETH
    },
    daiTargets: daiTargets,
    received: {},
    preArrival: null,
    status: 'pending'
  };
  setWizardData(savedData);
  showAutomationBanner();
  // Kick off the runner; it polls for ETH arrival then advances through tasks.
  runAutomation();

  await Swal.fire({
    title: translateThis('Send ETH to Begin'),
    html: '<div style="text-align:left;">' +
      '<p>' + translateThis('Please send exactly') + ' <strong>' + ethAmount.toFixed(6) + ' ETH</strong> ' + translateThis('to your main address on the Ethereum network') + ':</p>' +
      '<div style="word-break:break-all;font-family:monospace;background:#f5f5f5;padding:10px;border-radius:5px;margin:10px 0;display:flex;align-items:center;gap:8px;">' +
        '<span id="wizDepositAddr"></span>' +
        '<span id="wizCopyBtn" class="no-invert" style="cursor:pointer;font-size:1.2em;">📋</span>' +
      '</div>' +
      '<p style="color:#777;font-size:0.9em;">' + translateThis('Network') + ': Ethereum Mainnet</p>' +
      '<p style="margin-top:8px;"><strong>' + translateThis('Automation tasks have been set.') + '</strong> ' + translateThis('Please keep this tab open and in focus for it to complete. It will commence when the correct amount of ETH is detected.') + '</p>' +
      '</div>',
    icon: 'success',
    confirmButtonText: translateThis('OK'),
    width: '500px',
    didOpen: function() {
      document.getElementById('wizDepositAddr').textContent = depositAddress;
      document.getElementById('wizCopyBtn').addEventListener('click', function() {
        copyAddress(depositAddress);
      });
    }
  });
};

function showAutomationBanner() {
  var data = getWizardData();
  var existing = document.getElementById('wizardAutomationBanner');
  if (!data) {
    if (existing) existing.remove();
    return;
  }

  var meta = WIZARD_STATUS_META[data.status] || WIZARD_STATUS_META.pending;
  var bg = data.status === 'complete' ? '#1e7a3c' : (data.status === 'failed' ? '#8a1c1c' : '#1a3a5c');
  var btnLabel = (data.status === 'complete' || data.status === 'failed') ? 'Clear' : 'Show';
  var html = '<span>' + meta.emoji + ' ' + translateThis(meta.label) + '</span>' +
    '<button id="wizardShowBtn" style="background:#fff;color:' + bg + ';border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.9em;">' +
    translateThis(btnLabel) + '</button>';

  var banner = existing;
  if (banner) {
    banner.style.background = bg;
    banner.innerHTML = html;
  } else {
    banner = document.createElement('div');
    banner.id = 'wizardAutomationBanner';
    banner.style.cssText = 'background:' + bg + ';color:#fff;padding:10px 16px;margin:10px 0;border-radius:6px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;';
    banner.innerHTML = html;
    var target = document.getElementById('buyBitbaySwapField');
    if (target && target.parentNode) {
      target.parentNode.insertBefore(banner, target.nextSibling);
    }
  }

  var btn = document.getElementById('wizardShowBtn');
  if (btn) {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      await openAutomationStatusDialog();
    });
  }
}

async function openAutomationStatusDialog() {
  var d = getWizardData();
  if (!d) return;
  var plan = wizardPlan(d.choices);
  var curIdx = plan.indexOf(d.status);
  if (d.status === 'complete') curIdx = plan.length;

  var rows = plan.filter(function(s) { return s !== 'complete'; }).map(function(s, i) {
    var m = WIZARD_STATUS_META[s];
    var icon;
    if (d.status === 'failed' && s === d.failedAt) icon = '❌';
    else if (i < curIdx) icon = '✅';
    else if (i === curIdx) icon = (d.status === 'failed' ? '❌' : '⏳');
    else icon = '⬜';
    return '<li style="padding:3px 0;list-style:none;">' + icon + ' ' + translateThis(m.label) + '</li>';
  }).join('');
  if (d.status === 'complete') {
    rows += '<li style="padding:3px 0;list-style:none;">✅ ' + translateThis('Automation complete') + '</li>';
  }

  // All values injected into the dialog go through validation()/BN sanitization
  // (same pattern as earn.js / index.html) so nothing untrusted reaches the DOM.
  var BN = BigNumber;
  var safeAccount = stripSafe(DOMPurify.sanitize(validation(d.account)));
  var ethAmtStr   = new BN(Number(d.ethAmount) || 0).toFixed(6);
  var ethUsdStr   = new BN(Number(d.ethAmount) || 0).times(Number(d.prices && d.prices.eth) || 0).toFixed(2);
  var info = '<div style="text-align:left;font-size:0.9em;">';
  info += '<p><strong>' + translateThis('Amount') + ':</strong> ' + ethAmtStr + ' ETH (~$' + ethUsdStr + ')</p>';
  info += '<p><strong>' + translateThis('Address') + ':</strong> <span style="font-family:monospace;font-size:0.85em;word-break:break-all;">' + safeAccount + '</span></p>';
  if (d.received && d.received.pol) {
    var polStr = new BN(validation(d.received.pol) || '0').dividedBy('1e18').toFixed(4);
    info += '<p>' + translateThis('POL acquired') + ': ' + polStr + '</p>';
  }
  if (d.received && d.received.dai) {
    var daiStr = new BN(validation(d.received.dai) || '0').dividedBy('1e18').toFixed(2);
    info += '<p>' + translateThis('DAI acquired') + ': ' + daiStr + '</p>';
  }
  info += '<p><strong>' + translateThis('Progress') + ':</strong></p><ul style="padding-left:0;margin:0;">' + rows + '</ul>';
  if (d.status === 'failed') {
    // Don't surface raw error text to the DOM; full error is in the console.
    info += '<p style="color:#a33;margin-top:8px;">' + translateThis('An error occurred. Please check the browser console for details.') + '</p>';
  }
  info += '</div>';

  var canClear = (d.status === 'complete' || d.status === 'failed');
  var r = await Swal.fire({
    title: translateThis('Automation Status'),
    html: info,
    showCancelButton: !canClear,
    confirmButtonText: canClear ? translateThis('Clear') : translateThis('OK'),
    cancelButtonText: translateThis('Cancel Automation'),
    cancelButtonColor: '#d33'
  });

  if (canClear && r.isConfirmed) {
    clearWizardData();
    var be = document.getElementById('wizardAutomationBanner');
    if (be) be.remove();
    return;
  }
  if (!canClear && r.dismiss === Swal.DismissReason.cancel) {
    var cc = await Swal.fire({
      title: translateThis('Cancel Automation?'),
      text: translateThis('Your funds will remain where they currently are. You can continue to manage them manually.'),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: translateThis('Yes, Cancel'),
      cancelButtonText: translateThis('Keep Active')
    });
    if (cc.isConfirmed) {
      automationCancelled = true;
      clearWizardData();
      var be2 = document.getElementById('wizardAutomationBanner');
      if (be2) be2.remove();
    }
  }
}

window.checkAutomationOnLogin = async function() {
  if (!myaccounts || loginType === 0) return;

  var data = getWizardData();
  if (data && data.status !== 'complete' && data.status !== 'failed') {
    showAutomationBanner();
    if (loginType === 1) {
      await Swal.fire({
        title: translateThis('Automation Tasks Pending'),
        html: '<div style="text-align:left;max-height:400px;overflow-y:auto;">' +
          '<p>' + translateThis('You have pending automation tasks. To complete them, the tab must remain open and the wallet must be unlocked.') + '</p><br>' +
          '<p>' + translateThis('Since you are logged in via Metamask, you will need to unlock your wallet with your private key for the automation to proceed.') + '</p><br>' +
          '<p><strong>' + translateThis('Security Notice') + ':</strong> ' + translateThis('We only recommend this option if you trust the source code of this site. You may also wish to run the code locally. You are responsible for risks of direct key handling.') + '</p>' +
          '</div>',
        icon: 'info',
        confirmButtonText: translateThis('OK'),
        width: 550
      });
    }
    var unlocked = await ensureWalletUnlocked();
    runAutomation();
    return;
  }
  if (data && (data.status === 'complete' || data.status === 'failed')) {
    showAutomationBanner();
    return;
  }

  var declined = localStorage.getItem(getNewUserKey());
  if (declined === 'true') return;

  try {
    var polBal = validation(DOMPurify.sanitize(await web3.eth.getBalance(myaccounts)));
    if (new BigNumber(polBal).gt(0)) return;
    if (typeof BAYLaddy !== 'undefined' && BAYLaddy && typeof baylcontract !== 'undefined') {
      var bayBal = validation(DOMPurify.sanitize(await baylcontract.methods.balanceOf(myaccounts).call()));
      if (new BigNumber(bayBal).gt(0)) return;
    }
    if (typeof BAYRaddy !== 'undefined' && BAYRaddy && typeof bayrcontract !== 'undefined') {
      var bayrBal = validation(DOMPurify.sanitize(await bayrcontract.methods.balanceOf(myaccounts).call()));
      if (new BigNumber(bayrBal).gt(0)) return;
    }

    var welcomeResult = await Swal.fire({
      title: '👋 ' + translateThis('Welcome to BitBay!'),
      text: translateThis('Would you like to get started using the automation wizard?'),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: translateThis('Launch Wizard'),
      cancelButtonText: translateThis('No Thanks')
    });

    if (welcomeResult.isConfirmed) {
      await launchAutomationWizard();
    } else {
      localStorage.setItem(getNewUserKey(), 'true');
    }
  } catch(e) {
    console.log('New user check error:', e);
  }
};

window.addEventListener('load', function() {
  setTimeout(function() {
    if (myaccounts && loginType !== 0) {
      var data = getWizardData();
      if (data && data.status !== 'complete' && data.status !== 'failed') {
        showAutomationBanner();
        runAutomation();
      } else if (data) {
        showAutomationBanner();
      }
    }
  }, 5000);
});

// ============================================================================
// AUTOMATION RUNNER
// ============================================================================

var WIZARD_STATUS_META = {
  pending:          { emoji: '⏳', label: 'Waiting for ETH deposit' },
  buying_pol:       { emoji: '⛽', label: 'Buying POL on Ethereum' },
  lido_deposit:     { emoji: '🏦', label: 'Depositing to Lido HODL' },
  buying_dai:       { emoji: '💱', label: 'Swapping ETH to DAI on Ethereum' },
  bridging_pol:     { emoji: '🌉', label: 'Bridging POL to Polygon' },
  bridging_dai:     { emoji: '🌉', label: 'Bridging DAI to Polygon' },
  awaiting_polygon: { emoji: '⏳', label: 'Waiting for funds on Polygon (~30 min typical)' },
  stable_deposit:   { emoji: '💰', label: 'Depositing DAI to StableVault' },
  buying_bay:       { emoji: '🪙', label: 'Buying BAY' },
  buying_bayr:      { emoji: '🏛️', label: 'Buying BAYR' },
  complete:         { emoji: '✅', label: 'Automation complete' },
  failed:           { emoji: '❌', label: 'Automation failed' }
};

// Ethereum mainnet addresses used by the automation runner
var MAINNET_ADDR = {
  WETH:        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  DAI:         '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  POL:         '0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6',
  V3_ROUTER:   '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Uniswap SwapRouter02
  AUTO_BRIDGE: '0xE68446f9809fcBa0af2bD9da2cb06a4248897Fed',
  PLASMA_DEPOSIT_MANAGER: '0x401F6c983eA34274ec46f84D70b31C151321188b'
};
// WETH/DAI V3 pool 0x60594a405d53811d3BC4766596EFD80fd545A270 is the 0.05% tier
var V3_FEE_ETH_DAI = 500;
// WETH/POL V3 pool at the 0.3% tier (main liquidity on mainnet)
var V3_FEE_ETH_POL = 3000;

// Polygon router used for DAI<->BAY/BAYR (same pair BitBay uses elsewhere)
var POL_BAY_ROUTER   = '0x418fBc4E6B5C694495c90C7cDE1f293EE444F10B';
var POL_BAY_EXCHANGE = '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C';

var ETH_GAS_V3_SWAP    = 300000;
var ETH_GAS_APPROVE    = 100000;
var ETH_GAS_BRIDGE_ERC = 300000;
var POLL_INTERVAL_MS   = 120000;   // 2 min between balance polls (kept above
                                   // earn/index refresh cadence to avoid contention)
var POLL_MAX_AWAIT_MS  = 6 * 60 * 60 * 1000; // 6h cap for Polygon-arrival wait
// Require at least 0.3 POL on Polygon before running the polygon-side tasks
var POL_GAS_RESERVE_WEI = '300000000000000000';

var WIZ_ERC20_ABI = [
  {"constant":true,"inputs":[{"name":"account","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"},
  {"constant":false,"inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"type":"function"},
  {"constant":true,"inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"type":"function"}
];

// Uniswap V3 SwapRouter02 — exactInputSingle(struct)
var V3_ROUTER_ABI = [{
  "inputs":[{"components":[
    {"internalType":"address","name":"tokenIn","type":"address"},
    {"internalType":"address","name":"tokenOut","type":"address"},
    {"internalType":"uint24","name":"fee","type":"uint24"},
    {"internalType":"address","name":"recipient","type":"address"},
    {"internalType":"uint256","name":"amountIn","type":"uint256"},
    {"internalType":"uint256","name":"amountOutMinimum","type":"uint256"},
    {"internalType":"uint160","name":"sqrtPriceLimitX96","type":"uint160"}
  ],"internalType":"struct IV3SwapRouter.ExactInputSingleParams","name":"params","type":"tuple"}],
  "name":"exactInputSingle",
  "outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"}],
  "stateMutability":"payable","type":"function"
}];

var automationRunning = false;
var automationCancelled = false;

function wizardSleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function wizardPlan(choices) {
  var needsDai = !!(choices.stable || choices.bay || choices.bayr);
  var plan = ['pending'];
  if (choices.pol)    plan.push('buying_pol');
  if (choices.lido)   plan.push('lido_deposit');
  if (needsDai)       plan.push('buying_dai');
  if (choices.pol)    plan.push('bridging_pol');
  if (needsDai)       plan.push('bridging_dai');
  if (needsDai)       plan.push('awaiting_polygon');
  if (choices.stable) plan.push('stable_deposit');
  if (choices.bay)    plan.push('buying_bay');
  if (choices.bayr)   plan.push('buying_bayr');
  plan.push('complete');
  return plan;
}

function advanceStatus(data) {
  var plan = wizardPlan(data.choices);
  var idx = plan.indexOf(data.status);
  if (idx === -1 || idx >= plan.length - 1) return 'complete';
  return plan[idx + 1];
}

function isLastPolygonTask(choices, status) {
  if (choices.bayr)   return status === 'buying_bayr';
  if (choices.bay)    return status === 'buying_bay';
  if (choices.stable) return status === 'stable_deposit';
  return false;
}

// Returns the wei amount to actually use for a step given anticipated vs actual
// available balance. Within the prior 10% slippage/gas tolerance we proceed with
// what's there; otherwise we treat it as a timeout/short condition.
function adjustInputAmount(anticipated, balance) {
  var a = new BigNumber(anticipated);
  var b = new BigNumber(balance);
  if (a.lte(0)) return '0';
  if (b.gte(a)) return a.toFixed(0);
  var floor = a.times('90').dividedBy('100').integerValue(BigNumber.ROUND_DOWN);
  if (b.lt(floor)) {
    throw new Error('Timed out waiting for funds or balance is below target. Please check your account history.');
  }
  return b.toFixed(0);
}

function getEthWeb3Instance() {
  if (typeof earnState !== 'undefined' && earnState && earnState.ethWeb3) return earnState.ethWeb3;
  var rpc = typeof getEthereumRpc === 'function' ? getEthereumRpc() : 'https://eth.drpc.org/';
  return new Web3(rpc);
}

function getPolWeb3Instance() {
  if (typeof earnState !== 'undefined' && earnState && earnState.polWeb3) return earnState.polWeb3;
  var rpc = typeof getPolygonRpc === 'function' ? getPolygonRpc() : 'https://polygon-rpc.com/';
  return new Web3(rpc);
}

async function runAutomation() {
  if (automationRunning) return;
  automationRunning = true;
  automationCancelled = false;
  var data = getWizardData();
  if(data && data.inProgressStep) {
    await Swal.fire(translateThis("Automation cancelled"),translateThis("The automation was interrupted during a previous step. For your security the process has been cancelled to avoid repeating tasks. Remaining tasks should be handled manually."));
    data.status = 'failed';
    setWizardData(data);
  }
  try {
    while (true) {
      data = getWizardData();
      if (!data || automationCancelled) break;
      if (data.status === 'complete' || data.status === 'failed') break;
      // If wallet is Metamask-only and locked (no private key), we can still poll
      // for ETH arrival and Polygon arrival, but we cannot send transactions.
      // For steps that require signing, require a password-style login (loginType===2)
      // or that sendTx can prompt Metamask. sendTx handles both; rely on it to throw.
      try {
        if(data.status != 'pending' && data.status != 'awaiting_polygon') {
          data.inProgressStep = true;
          setWizardData(data);
        }
        await wizardSleep(10000);
        var nextStatus = await executeAutomationStep(data);
        if (nextStatus === null) break; // cancelled or data cleared
        var d = getWizardData();
        if (!d) break;
        d.status = nextStatus;
        d.inProgressStep = false;
        setWizardData(d);
        showAutomationBanner();
        if (nextStatus === 'complete' || nextStatus === 'failed') break;
      } catch (e) {
        // Full error stays in the console; we only persist `failedAt` for resume context.
        console.log('Automation step failed:', e);
        var d2 = getWizardData();
        if (d2) {
          d2.inProgressStep = false;
          d2.failedAt = d2.status;
          d2.status = 'failed';
          setWizardData(d2);
          showAutomationBanner();
        }
        break;
      }
    }
  } finally {
    automationRunning = false;
  }
}

//We need a more strict balance update in case a node is stale and to avoid race conditions to get accurate values
async function waitForBalanceUpdate(web3, erc20, account, balBefore, anticipated) {
  var BN = BigNumber;
  var before = new BN(balBefore);
  var expected = before.plus(new BN(anticipated));
  // Lower acceptance bound: at least 85% of the anticipated delta arrived.
  var minAcceptable = before.plus(new BN(anticipated).times('85').dividedBy('100').integerValue(BN.ROUND_DOWN));

  var TIMEOUT_MS = 3 * 60 * 1000;
  var INTERVAL_MS = 10 * 1000;
  var deadline = Date.now() + TIMEOUT_MS;
  var lastBlock = 0;

  while (Date.now() < deadline) {
    try {
      var blk = parseInt(validation(DOMPurify.sanitize(await web3.eth.getBlockNumber())));
      if (blk > lastBlock) {
        lastBlock = blk;
        var raw = validation(DOMPurify.sanitize(await erc20.methods.balanceOf(account).call({}, blk)));
        var cur = new BN(raw);
        if (cur.gt(before) && cur.gte(minAcceptable)) return cur;
      }
      // else: block hasn't advanced, treat read as stale and retry next tick
    } catch (e) {
      // transient RPC error; retry on the next poll
      console.log('waitForBalanceUpdate poll error:', e);
    }
    await wizardSleep(INTERVAL_MS);
  }
  throw new Error('Balance update timed out');
}

async function executeAutomationStep(data) {
  switch (data.status) {
    case 'pending':          return await stepPending(data);
    case 'buying_pol':       return await stepBuyPol(data);
    case 'lido_deposit':     return await stepLido(data);
    case 'buying_dai':       return await stepBuyDai(data);
    case 'bridging_pol':     return await stepBridgeERC20(data, 'pol');
    case 'bridging_dai':     return await stepBridgeERC20(data, 'dai');
    case 'awaiting_polygon': return await stepAwaitPolygon(data);
    case 'stable_deposit':   return await stepStableDeposit(data);
    case 'buying_bay':       return await stepBuyBayToken(data, false);
    case 'buying_bayr':      return await stepBuyBayToken(data, true);
    default:                 return 'complete';
  }
}

async function stepPending(data) {
  var ethW3 = getEthWeb3Instance();
  var BN = BigNumber;
  var targetWei = new BN(data.ethAmount).times('1e18').integerValue(BN.ROUND_DOWN);
  while (true) {
    var cur = getWizardData();
    if (!cur || cur.status !== 'pending' || automationCancelled) return null;
    try {
      var bal = new BN(validation(DOMPurify.sanitize(await ethW3.eth.getBalance(myaccounts))));
      if (bal.gte(targetWei)) return advanceStatus(cur);
    } catch (e) {
      // transient RPC error; retry on the next poll
      console.log('pending poll error:', e);
    }
    await wizardSleep(POLL_INTERVAL_MS);
  }
}

async function stepBuyPol(data) {
  var BN = BigNumber;
  var polETH = new BN(data.breakdown.polETH || 0);
  var anticipated = polETH.times('1e18').integerValue(BN.ROUND_DOWN);
  if (anticipated.lte(0)) return advanceStatus(data);

  var ethPx = new BN(data.prices.eth);
  var polPx = new BN(data.prices.pol);
  if (!polPx.gt(0) || !ethPx.gt(0)) throw new Error('Invalid prices in saved automation data');

  var ethW3 = getEthWeb3Instance();
  // Adjust input to actual ETH balance within the 10% slippage/gas tolerance.
  var ethBal = new BN(validation(DOMPurify.sanitize(await ethW3.eth.getBalance(myaccounts))));
  var amountIn = new BN(adjustInputAmount(anticipated, ethBal));

  // Expected POL wei = amountIn * (ethPx / polPx); POL has 18 decimals like ETH.
  var expectedOut = amountIn.times(ethPx).dividedBy(polPx).integerValue(BN.ROUND_DOWN);
  var polRaw = parseInt(await getPOLPrice()) / 1e8;
  var ethRaw = parseInt(await getWETHPrice()) / 1e8;
  if (!polRaw || isNaN(polRaw) || polRaw <= 0) throw new Error('Unable to fetch live POL price, trade cancelled');
  if (!ethRaw || isNaN(ethRaw) || ethRaw <= 0) throw new Error('Unable to fetch live ETH price, trade cancelled');
  var expectedOut2 = amountIn.times(ethRaw).dividedBy(polRaw).integerValue(BN.ROUND_DOWN);
  var minOut = expectedOut.times('90').dividedBy('100').integerValue(BN.ROUND_DOWN);
  var minOut2 = expectedOut2.times('98').dividedBy('100').integerValue(BN.ROUND_DOWN);
  if(minOut2.lt(minOut)) throw new Error('Prices have changed, automated trade was cancelled')

  var polErc20 = new ethW3.eth.Contract(WIZ_ERC20_ABI, MAINNET_ADDR.POL);
  var balBefore = new BN(validation(DOMPurify.sanitize(await polErc20.methods.balanceOf(myaccounts).call())));

  var swapRouter = new ethW3.eth.Contract(V3_ROUTER_ABI, MAINNET_ADDR.V3_ROUTER);
  var params = [
    MAINNET_ADDR.WETH,
    MAINNET_ADDR.POL,
    V3_FEE_ETH_POL,
    myaccounts,
    amountIn.toFixed(0),
    minOut2.toFixed(0),
    '0'
  ];
  await sendTx(swapRouter, 'exactInputSingle', [params], ETH_GAS_V3_SWAP, amountIn.toFixed(0), false, true, false);


  var balAfter = await waitForBalanceUpdate(ethW3, polErc20, myaccounts, balBefore, expectedOut);
  var received = balAfter.minus(balBefore);
  if (received.lte(0)) throw new Error('POL swap completed but no POL received');

  var d = getWizardData();
  if (!d) return null;
  d.received = d.received || {};
  d.received.pol = received.toFixed(0);
  setWizardData(d);
  return advanceStatus(d);
}

async function stepLido(data) {
  var BN = BigNumber;
  var anticipated = new BN(data.breakdown.lidoETH || 0).times('1e18').integerValue(BN.ROUND_DOWN);
  if (anticipated.lte(0)) return advanceStatus(data);

  var ethW3 = getEthWeb3Instance();
  // Adjust input to actual ETH balance within the 10% tolerance.
  var ethBal = new BN(validation(DOMPurify.sanitize(await ethW3.eth.getBalance(myaccounts))));
  var lidoETH = new BN(adjustInputAmount(anticipated, ethBal));

  var lidoContract = new ethW3.eth.Contract(lidoVaultABI, TREASURY_ADDRESSES.LIDO_VAULT);

  // Cap the user's chosen lock at maxdays, but never raise it to mindays — the
  // contract minimum may exceed what the user wants and will be enforced on-chain
  // if the user picks too small. We respect the user's choice as-is below maxdays.
  var maxDays = parseInt(validation(DOMPurify.sanitize(await lidoContract.methods.maxdays().call())));
  var minDays = parseInt(validation(DOMPurify.sanitize(await lidoContract.methods.mindays().call())));
  var days = parseInt(data.choices.lidoDays);
  if (isNaN(days) || days <= 0) days = minDays; // sensible default if not provided
  if (!isNaN(maxDays) && days > maxDays) days = maxDays;

  // Slippage 500 bps (5%), false = do not autocompound (matches earn.js semantics)
  await sendTx(lidoContract, 'tradeAndLockStETH', ['500', days.toString(), false], ETH_GAS_LIDO, lidoETH.toFixed(0), false, true, false);
  return advanceStatus(data);
}

async function stepBuyDai(data) {
  var needsDai = !!(data.choices.stable || data.choices.bay || data.choices.bayr);
  if (!needsDai) return advanceStatus(data);

  var BN = BigNumber;
  var totalEth = new BN(data.breakdown.stableETH || 0)
    .plus(data.breakdown.bayETH || 0)
    .plus(data.breakdown.bayrETH || 0);
  var anticipated = totalEth.times('1e18').integerValue(BN.ROUND_DOWN);
  if (anticipated.lte(0)) return advanceStatus(data);

  var ethPx = new BN(data.prices.eth);
  if (!ethPx.gt(0)) throw new Error('Invalid ETH price in saved automation data');

  var ethW3 = getEthWeb3Instance();
  var ethBal = new BN(validation(DOMPurify.sanitize(await ethW3.eth.getBalance(myaccounts))));
  var amountIn = new BN(adjustInputAmount(anticipated, ethBal));

  // Expected DAI wei = amountIn * ethPx (DAI has 18 decimals, same as ETH).
  var expectedOut = amountIn.times(ethPx).integerValue(BN.ROUND_DOWN);
  var ETHRaw = parseInt(await getWETHPrice()) / 1e8;
  if (!ETHRaw || isNaN(ETHRaw) || ETHRaw <= 0) throw new Error('Unable to fetch live ETH price, trade cancelled');
  var expectedOut2 = amountIn.times(ETHRaw).integerValue(BN.ROUND_DOWN);
  var minOut = expectedOut.times('93').dividedBy('100').integerValue(BN.ROUND_DOWN);
  var minOut2 = expectedOut2.times('98').dividedBy('100').integerValue(BN.ROUND_DOWN);
  if(minOut2.lt(minOut)) throw new Error('Prices have changed, automated trade was cancelled')

  var daiErc20 = new ethW3.eth.Contract(WIZ_ERC20_ABI, MAINNET_ADDR.DAI);
  var balBefore = new BN(validation(DOMPurify.sanitize(await daiErc20.methods.balanceOf(myaccounts).call())));

  var swapRouter = new ethW3.eth.Contract(V3_ROUTER_ABI, MAINNET_ADDR.V3_ROUTER);
  var params = [
    MAINNET_ADDR.WETH,
    MAINNET_ADDR.DAI,
    V3_FEE_ETH_DAI,
    myaccounts,
    amountIn.toFixed(0),
    minOut2.toFixed(0),
    '0'
  ];
  await sendTx(swapRouter, 'exactInputSingle', [params], ETH_GAS_V3_SWAP, amountIn.toFixed(0), false, true, false);

  var balAfter = await waitForBalanceUpdate(ethW3, daiErc20, myaccounts, balBefore, expectedOut);
  var received = balAfter.minus(balBefore);
  if (received.lte(0)) throw new Error('DAI swap completed but no DAI received');

  var d = getWizardData();
  if (!d) return null;
  d.received = d.received || {};
  d.received.dai = received.toFixed(0);
  setWizardData(d);
  return advanceStatus(d);
}

async function bridgePOL(amount) {
  var BN = BigNumber;
  var send = new BN(amount);
  if (send.lte(0)) throw new Error('bridgePOL: amount must be > 0');
  const PLASMA_DEPOSIT_MANAGER_ABI = [
    { "inputs":[
        {"name":"_token","type":"address"},
        {"name":"_user","type":"address"},
        {"name":"_amount","type":"uint256"}],
      "name":"depositERC20ForUser",
      "outputs":[],"stateMutability":"nonpayable","type":"function" }
  ];
  var ethW3  = getEthWeb3Instance();
  var pol    = new ethW3.eth.Contract(WIZ_ERC20_ABI, MAINNET_ADDR.POL);
  var bridge = new ethW3.eth.Contract(PLASMA_DEPOSIT_MANAGER_ABI, MAINNET_ADDR.PLASMA_DEPOSIT_MANAGER);
  var bal = new BN(validation(DOMPurify.sanitize(await pol.methods.balanceOf(myaccounts).call())));
  if (bal.lt(send)) throw new Error('Insufficient POL balance');
  var allow = new BN(validation(DOMPurify.sanitize(await pol.methods.allowance(myaccounts, MAINNET_ADDR.PLASMA_DEPOSIT_MANAGER).call())));
  if (allow.lt(send)) {
    await sendTx(pol, 'approve', [MAINNET_ADDR.PLASMA_DEPOSIT_MANAGER, send.toFixed(0)], ETH_GAS_APPROVE, '0', false, true, false);
  }
  await sendTx(bridge, 'depositERC20ForUser', [MAINNET_ADDR.POL, myaccounts, send.toFixed(0)], ETH_GAS_BRIDGE_ERC, '0', false, true, false);
}

async function stepBridgeERC20(data, which) {
  var BN = BigNumber;
  var anticipated = new BN((data.received && data.received[which]) || '0');
  if (anticipated.lte(0)) return advanceStatus(data);

  var ethW3 = getEthWeb3Instance();
  var tokenAddr = which === 'pol' ? MAINNET_ADDR.POL : MAINNET_ADDR.DAI;
  var tokenErc20 = new ethW3.eth.Contract(WIZ_ERC20_ABI, tokenAddr);
  var bridge     = new ethW3.eth.Contract(autoBridgev0ABI, MAINNET_ADDR.AUTO_BRIDGE);

  // Persist Polygon-side pre-balances BEFORE sending any bridge tx, so a credit
  // arriving between the read and the bridge can't be lost. Capture only once
  // per run so the second bridge step keeps the original pre.
  if (!data.preArrival) {
    var polW3pre = getPolWeb3Instance();
    var daiPolPre = new polW3pre.eth.Contract(WIZ_ERC20_ABI, TREASURY_ADDRESSES.DAI);
    var preDai = validation(DOMPurify.sanitize(await daiPolPre.methods.balanceOf(myaccounts).call()));
    var prePol = validation(DOMPurify.sanitize(await polW3pre.eth.getBalance(myaccounts)));
    var dPre = getWizardData();
    if (!dPre) return null;
    dPre.preArrival = { dai: preDai, pol: prePol };
    setWizardData(dPre);
    data = dPre;
  }

  // Tolerance: if held tokens are within 10% of anticipated, proceed with what's
  // there; if less, treat as a short condition.
  var held = new BN(validation(DOMPurify.sanitize(await tokenErc20.methods.balanceOf(myaccounts).call())));
  if (held.lte(0)) {
    return advanceStatus(data);
  }
  var sendAmount = new BN(adjustInputAmount(anticipated, held));
  if(tokenAddr == MAINNET_ADDR.POL) {
    await bridgePOL(sendAmount);
  } else {
    var allow = new BN(validation(DOMPurify.sanitize(await tokenErc20.methods.allowance(myaccounts, MAINNET_ADDR.AUTO_BRIDGE).call())));
    if (allow.lt(sendAmount)) {
      await sendTx(tokenErc20, 'approve', [MAINNET_ADDR.AUTO_BRIDGE, sendAmount.toFixed(0)], ETH_GAS_APPROVE, '0', false, true, false);
    }
    await sendTx(bridge, 'bridgeERC20', [tokenAddr, myaccounts, sendAmount.toFixed(0)], ETH_GAS_BRIDGE_ERC, '0', false, true, false);
  }
  // Update the persisted received[which] to what we actually sent so downstream
  // arrival checks compare against the real bridged amount.
  var d = getWizardData();
  if (!d) return null;
  d.received = d.received || {};
  d.received[which] = sendAmount.toFixed(0);
  setWizardData(d);
  return advanceStatus(d);
}

async function stepAwaitPolygon(data) {
  var BN = BigNumber;
  var polW3 = getPolWeb3Instance();
  var daiPol = new polW3.eth.Contract(WIZ_ERC20_ABI, TREASURY_ADDRESSES.DAI);

  // Bound the wait — the PoS bridge typically settles within ~30 min. Beyond
  // POLL_MAX_AWAIT_MS we surface a single generic "timed out / below target"
  // message and let the user check their account history.
  var startedAt = Date.now();

  while (true) {
    var cur = getWizardData();
    if (!cur || cur.status !== 'awaiting_polygon' || automationCancelled) return null;
    if (Date.now() - startedAt > POLL_MAX_AWAIT_MS) {
      throw new Error('Timed out waiting for funds or balance is below target. Please check your account history.');
    }

    try {
      var needPol = new BN((cur.received && cur.received.pol) || '0');
      var preDai  = new BN((cur.preArrival && cur.preArrival.dai) || '0');
      var prePol  = new BN((cur.preArrival && cur.preArrival.pol) || '0');
      var minPolReserve = new BN(POL_GAS_RESERVE_WEI);

      // DAI required for the remaining Polygon tasks. We compare against total
      // DAI balance (not delta) — any DAI the user already had counts.
      var requiredDai = new BN((cur.daiTargets && cur.daiTargets.stable) || '0')
        .plus((cur.daiTargets && cur.daiTargets.bay) || '0')
        .plus((cur.daiTargets && cur.daiTargets.bayr) || '0');
      var daiFloor = requiredDai.times('90').dividedBy('100').integerValue(BN.ROUND_DOWN);

      var daiBal = new BN(validation(DOMPurify.sanitize(await daiPol.methods.balanceOf(myaccounts).call())));
      var polBal = new BN(validation(DOMPurify.sanitize(await polW3.eth.getBalance(myaccounts))));

      var changed = !daiBal.eq(preDai) || !polBal.eq(prePol);
      if (changed) {
        // POL credit check: balance increase since pre-check covers ≥90% of
        // anticipated POL bridge amount. Detecting via delta tolerates the user
        // spending POL idle (delta could be negative; we just keep waiting).
        var polDelta = polBal.minus(prePol);
        var polOk = needPol.lte(0) || polDelta.gte(needPol.times('90').dividedBy('100').integerValue(BN.ROUND_DOWN));
        var daiOk = requiredDai.lte(0) || daiBal.gte(daiFloor);
        var hasGas = polBal.gte(minPolReserve);

        if (polOk && daiOk && hasGas) return advanceStatus(cur);

        // Balance changed but isn't yet sufficient — could be the user spending
        // POL while we wait. Re-baseline pre to current and keep waiting.
        cur.preArrival = { dai: daiBal.toFixed(0), pol: polBal.toFixed(0) };
        setWizardData(cur);
      }
    } catch (e) {
      // Transient RPC error — log and retry.
      console.log('awaiting_polygon poll error:', e);
    }
    await wizardSleep(POLL_INTERVAL_MS);
  }
}

async function computeTaskDaiAmount(data, status) {
  var BN = BigNumber;
  var polW3 = getPolWeb3Instance();
  var daiPol = new polW3.eth.Contract(WIZ_ERC20_ABI, TREASURY_ADDRESSES.DAI);
  var bal = new BN(validation(DOMPurify.sanitize(await daiPol.methods.balanceOf(myaccounts).call())));
  var key = status === 'stable_deposit' ? 'stable' : (status === 'buying_bay' ? 'bay' : 'bayr');
  var target = new BN((data.daiTargets && data.daiTargets[key]) || '0');
  if (isLastPolygonTask(data.choices, status)) {
    return BN.min(bal, target).toFixed(0);
  }
  return adjustInputAmount(target, bal);
}

async function stepStableDeposit(data) {
  var amount = await computeTaskDaiAmount(data, 'stable_deposit');
  var amountBN = new BigNumber(amount);
  if (amountBN.lte(0)) return advanceStatus(data);

  var polW3 = getPolWeb3Instance();
  var daiPol  = new polW3.eth.Contract(WIZ_ERC20_ABI, TREASURY_ADDRESSES.DAI);
  var stable  = new polW3.eth.Contract(stableVaultABI, TREASURY_ADDRESSES.STABLE_POOL);

  // Newer StableVault permits out-of-range deposits, so no isInRange gate.
  var allow = new BigNumber(validation(DOMPurify.sanitize(await daiPol.methods.allowance(myaccounts, TREASURY_ADDRESSES.STABLE_POOL).call())));
  if (allow.lt(amountBN)) {
    await sendTx(daiPol, 'approve', [TREASURY_ADDRESSES.STABLE_POOL, amount], ETH_GAS_APPROVE, '0', false, false, false);
  }
  var deadline = (Math.floor(Date.now() / 1000) + 300).toString();
  await sendTx(stable, 'deposit', [amount, deadline], 2000000, '0', false, false, false);
  return advanceStatus(data);
}

// Quote DAI -> BAY (or BAYR) using the standard Uniswap V2 getAmountOut helper
// already defined globally in index.html. BAY/BAYR are 8-decimal tokens; DAI is
// 18-decimal — getAmountOut works in raw token units so decimals are implicit.
async function quoteDaiToBay(polW3, daiInBN, bayAddr) {
  var factoryC = new polW3.eth.Contract(FactoryABI, POL_BAY_EXCHANGE);
  var pair = validation(DOMPurify.sanitize(await factoryC.methods.getPair(bayAddr, TREASURY_ADDRESSES.DAI).call()));
  if (/^0x0+$/.test(pair)) throw new Error('No liquidity pair for BAY/DAI on this exchange');
  var pairC = new polW3.eth.Contract(PairABI, pair);
  var reserves = validation(JSON.parse(DOMPurify.sanitize(JSON.stringify(await pairC.methods.getReserves().call()))));
  var token0 = validation(DOMPurify.sanitize(await pairC.methods.token0().call()));
  var reserveBay, reserveDai;
  if (token0.toLowerCase() === bayAddr.toLowerCase()) {
    reserveBay = new BigNumber(reserves._reserve0.toString());
    reserveDai = new BigNumber(reserves._reserve1.toString());
  } else {
    reserveBay = new BigNumber(reserves._reserve1.toString());
    reserveDai = new BigNumber(reserves._reserve0.toString());
  }
  if (reserveBay.lte(0) || reserveDai.lte(0)) throw new Error('Empty BAY/DAI reserves');
  return getAmountOut(daiInBN, reserveDai, reserveBay, new BigNumber(997));
}

async function stepBuyBayToken(data, isR) {
  var status = isR ? 'buying_bayr' : 'buying_bay';
  var amount = await computeTaskDaiAmount(data, status);
  var amountBN = new BigNumber(amount);
  if (amountBN.lte(0)) return advanceStatus(data);

  var polW3 = getPolWeb3Instance();
  var tokenAddr = isR
    ? (typeof BAYRaddy !== 'undefined' ? BAYRaddy : null)
    : (typeof BAYLaddy !== 'undefined' ? BAYLaddy : null);
  if (!tokenAddr) throw new Error('BAY token address not initialized');

  var daiPol = new polW3.eth.Contract(WIZ_ERC20_ABI, TREASURY_ADDRESSES.DAI);
  var router = new polW3.eth.Contract(RouterABI, POL_BAY_ROUTER);

  var quoted = await quoteDaiToBay(polW3, amountBN, tokenAddr);
  if (quoted.lte(0)) throw new Error('Quote failed or trade too large for pool');
  var minOut = quoted.times('90').dividedBy('100').integerValue(BigNumber.ROUND_DOWN);

  var allow = new BigNumber(validation(DOMPurify.sanitize(await daiPol.methods.allowance(myaccounts, POL_BAY_ROUTER).call())));
  if (allow.lt(amountBN)) {
    await sendTx(daiPol, 'approve', [POL_BAY_ROUTER, amount], ETH_GAS_APPROVE, '0', false, false, false);
  }
  var deadline = (Math.floor(Date.now() / 1000) + 300).toString();
  await sendTx(
    router,
    'swapExactTokensForTokens',
    [amount, minOut.toFixed(0), [TREASURY_ADDRESSES.DAI, tokenAddr], myaccounts, deadline, POL_BAY_EXCHANGE],
    5000000,
    '0',
    false,
    false,
    false
  );
  return advanceStatus(data);
}