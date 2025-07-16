from web3 import Web3
import json
import requests
from decimal import Decimal
import time
from datetime import datetime, timedelta
import os
import traceback

# Initialize Web3
web3 = Web3(Web3.HTTPProvider("https://polygon-rpc.com"))

# Constants
DAI_BAYL_PAIRS = ["0x37f75363c6552D47106Afb9CFdA8964610207938", "0x9A3Ec2E1F99cd32E867701ee0031A91e2f139640"]
BAYL = "0x5119E704BCDF8e81229E19d0794C33A12caCc7Ce"
DAI = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063"

VOLUME_LIST = [
    Web3.to_wei(1000, 'ether'),
    Web3.to_wei(2500, 'ether'),
    Web3.to_wei(5000, 'ether'),
    Web3.to_wei(10000, 'ether'),
    Web3.to_wei(25000, 'ether')
]

STARTING_PRICE = Web3.to_wei(0.10, 'ether')
MAX_PRICE = Web3.to_wei(1.10, 'ether')
FLOOR_STEP = Web3.to_wei(0.25, 'ether')
TOLERANCE_PERCENT = Web3.to_wei(0.05, 'ether')
INCREMENT = Web3.to_wei(0.01, 'ether')
NEW_FLOOR_FREQUENCY = 86400

# LocalStorage simulation using dat file
def get_local_storage(key, default_value):
    try:
        with open('local_storage.dat', 'r') as f:
            data = json.load(f)
            return data.get(key, default_value)
    except:
        return default_value

def set_local_storage(key, value):
    try:
        with open('local_storage.dat', 'r') as f:
            data = json.load(f)
    except:
        data = {}
    
    data[key] = value
    
    with open('local_storage.dat', 'w') as f:
        json.dump(data, f)

# Initialize storage values
last_check = get_local_storage("lastFloorCheck", int(time.time()))
price_floor = int(get_local_storage("priceFloor", str(STARTING_PRICE)))

# Uniswap Pair ABI
UNISWAP_PAIR_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "sender", "type": "address"},
            {"indexed": False, "name": "amount0In", "type": "uint256"},
            {"indexed": False, "name": "amount1In", "type": "uint256"},
            {"indexed": False, "name": "amount0Out", "type": "uint256"},
            {"indexed": False, "name": "amount1Out", "type": "uint256"},
            {"indexed": True, "name": "to", "type": "address"}
        ],
        "name": "Swap",
        "type": "event"
    },
    {
        "constant": True,
        "inputs": [],
        "name": "token0",
        "outputs": [{"name": "", "type": "address"}],
        "type": "function"
    },
    {
        "constant": True,
        "inputs": [],
        "name": "token1",
        "outputs": [{"name": "", "type": "address"}],
        "type": "function"
    },
    {
        "constant": True,
        "inputs": [],
        "name": "getReserves",
        "outputs": [
            {"internalType": "uint112", "name": "_reserve0", "type": "uint112"},
            {"internalType": "uint112", "name": "_reserve1", "type": "uint112"},
            {"internalType": "uint32", "name": "_blockTimestampLast", "type": "uint32"}
        ],
        "type": "function"
    }
]

async def fetch_average_price_for_3_days(symbol_a, symbol_b, interval_sec=300):
    try:
        url = f"https://my-api.nighttrader.exchange/u/chart/{symbol_a}-{symbol_b}/{interval_sec}"
        response = requests.get(url)
        if not response.ok:
            raise Exception(f"Failed to fetch data: {response.status_code}")
        
        data = response.json()
        
        MS_IN_3_DAYS = 3 * 24 * 60 * 60 * 1000
        now = int(time.time() * 1000)
        cutoff = now - MS_IN_3_DAYS
        
        total_volume_a = 0
        total_volume_b = 0
        total_bars = 0
        
        for bar in reversed(data):
            ts = datetime.strptime(bar['t'], "%Y-%m-%dT%H:%M:%SZ").timestamp() * 1000
            if ts < cutoff:
                break
                
            total_volume_a += bar['v']
            total_volume_b += bar['vb']
            if float(bar['vb']) > 0:
                total_bars += 1
        
        if symbol_b == "BTC":
            try:
                btc_response = requests.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')
                if not btc_response.ok:
                    raise Exception("Binance fetch failed")
                btc_price = float(btc_response.json()['price'])
                total_volume_b *= btc_price
            except Exception as e:
                print(f"Failed to fetch BTC price: {str(e)}")
                return {"totalVolumeB": 0, "totalVolumeA": 0, "totalBars": 0}
        
        return {"totalVolumeB": total_volume_b, "totalVolumeA": total_volume_a, "totalBars": total_bars}
    except Exception as e:
        print(e)
        return {"totalVolumeB": 0, "totalVolumeA": 0, "totalBars": 0}

async def algorithm():
    global last_check, price_floor
    
    pairs = [web3.eth.contract(address=addr, abi=UNISWAP_PAIR_ABI) for addr in DAI_BAYL_PAIRS]
    current_block = web3.eth.block_number
    
    events = []
    blocks_per_day = int(86400 / 2.1)
    success = False
    
    print("Getting events...")
    for p, pair in enumerate(pairs):
        token0 = None
        code = web3.eth.get_code(Web3.to_checksum_address(DAI_BAYL_PAIRS[p]))
        if code in [b'', b'0x']:
            print(f"Pair {DAI_BAYL_PAIRS[p]} not deployed yet, skipping.")
            continue
            
        try:
            token0 = pair.functions.token0().call().lower()
        except:
            continue
            
        success = True
        token1 = pair.functions.token1().call().lower()
        DAI_IS_TOKEN0 = token0 == DAI.lower()
        
        for i in range(3):
            start = current_block - blocks_per_day * (i + 1)
            end = current_block - blocks_per_day * i - 1
            
            try:
                chunk = pair.events.Swap().get_logs(from_block=start, to_block=end)
                
                # Add DAI_IS_TOKEN0 as metadata to each event
                events2 = []
                for ev in chunk:
                    event_data = {
                        'event': ev,
                        'DAI_IS_TOKEN0': DAI_IS_TOKEN0 
                    }
                    events2.append(event_data)
                
                events.extend(events2)
            except Exception as e:
                print(f"Error fetching events from pair {p} day {i + 1}: {str(e)}")
                return "nochange", price_floor
    
    print("Processing data...")
    if not success:
        print("Please check that pairs exist.")
        return "nochange", price_floor
    
    total_DAI = 0
    total_BAY = 0
    price_sum = 0
    trade_count = 0
    
    for event_data in events:
        ev = event_data['event']
        DAI_IS_TOKEN0 = event_data['DAI_IS_TOKEN0']
        a = ev.args
        
        dai_amount = 0
        bayl_amount = 0
        
        if DAI_IS_TOKEN0:
            dai_amount = int(a['amount0In']) + int(a['amount0Out'])
            bayl_amount = int(a['amount1In']) + int(a['amount1Out'])
        else:
            dai_amount = int(a['amount1In']) + int(a['amount1Out'])
            bayl_amount = int(a['amount0In']) + int(a['amount0Out'])
        
        if dai_amount == 0 or bayl_amount == 0:
            continue
            
        bayl_normalized = bayl_amount * 10**10
        trade_price = (dai_amount * 10**18) // bayl_normalized
        
        total_DAI += dai_amount
        total_BAY += bayl_normalized
        price_sum += trade_price
        trade_count += 1
    
    vol_DAI = 0
    vol_BAY = 0
    bar_count = 0
    
    try:
        result = await fetch_average_price_for_3_days("BAY", "BTC")
        vol_DAI += result['totalVolumeB']
        vol_BAY += result['totalVolumeA']
        bar_count += result['totalBars']
        
        result = await fetch_average_price_for_3_days("BAY", "DAI")
        vol_DAI += result['totalVolumeB']
        vol_BAY += result['totalVolumeA']
        bar_count += result['totalBars']
        
        total_DAI += Web3.to_wei(vol_DAI, 'ether')
        total_BAY += Web3.to_wei(vol_BAY, 'ether')
    except Exception as err:
        print(err)
    
    output = f"AMM Trades analyzed: {trade_count}\n"
    output += f"NT candles analyzed: {bar_count}\n"
    output += f"Total 3-day DAI Volume: {Web3.from_wei(total_DAI, 'ether')} DAI\n"
    
    if trade_count == 0 and bar_count == 0:
        output += "No valid trades.\n"
        print(output)
        return "nochange", price_floor
    else:
        if total_BAY == 0:
            output += "No BAYL volume found.\n"
            print(output)
            return "nochange", price_floor
            
        SCALE = 10**18
        avg_price = (total_DAI * SCALE) // total_BAY
        output += f"Average Price: ${Web3.from_wei(avg_price, 'ether')}\n"
    
    # Determine if volume is beyond target
    beyond_target = False
    for i, volume in enumerate(VOLUME_LIST):
        if price_floor > STARTING_PRICE + FLOOR_STEP * (i + 1):
            continue
        if total_DAI >= volume:
            beyond_target = True
            print("Volume beyond target")
            break
        else:
            break
    
    # Tolerance range
    PRECISION = 10**18
    upper = price_floor + (price_floor * TOLERANCE_PERCENT) // PRECISION
    upper2x = upper + (price_floor * TOLERANCE_PERCENT) // PRECISION
    lower = price_floor - (price_floor * TOLERANCE_PERCENT) // PRECISION
    
    if price_floor >= MAX_PRICE:
        set_local_storage("lastFloorCheck", int(time.time()) + NEW_FLOOR_FREQUENCY)
    else:
        if avg_price > upper and beyond_target:
            if int(last_check) < int(time.time()):
                INCREMENT2 = INCREMENT
                if avg_price > upper2x:
                    INCREMENT2 = INCREMENT2 * 2
                
                output += f"New price floor has increased: +{Web3.from_wei(INCREMENT2, 'ether')}\n"
                price_floor = price_floor + INCREMENT2
                set_local_storage("priceFloor", str(price_floor))
                set_local_storage("lastFloorCheck", int(time.time()) + NEW_FLOOR_FREQUENCY)
    
    output += f"Target Price Floor: ${Web3.from_wei(price_floor, 'ether')}\n"
    
    # Get current price from pair
    pair = web3.eth.contract(address=DAI_BAYL_PAIRS[0], abi=UNISWAP_PAIR_ABI)
    reserves = pair.functions.getReserves().call()
    token0 = pair.functions.token0().call()
    
    if token0.lower() == DAI.lower():
        reserve_DAI = int(reserves[0])
        reserve_BAYL = int(reserves[1])
    else:
        reserve_DAI = int(reserves[1])
        reserve_BAYL = int(reserves[0])
    
    # Adjust BAYL to 18 decimals
    bayl_adjusted = reserve_BAYL * 10**10
    
    # Compute DAI/BAYL price
    SCALE2 = 10**18
    current_price = (reserve_DAI * SCALE2) // bayl_adjusted
    
    output += f"Current BAY/DAI Price: {Web3.from_wei(current_price, 'ether')}\n"
    
    if current_price > upper:
        result = "inflate"
    elif current_price < lower:
        result = "deflate"
    else:
        result = "nochange"
    
    output += f"Decision: {result}"
    print(output)
    return result, price_floor

def update_vars_from_github():
    url = "https://raw.githubusercontent.com/bitbaymarket/bridge/main/vars.json"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        vars_dict = response.json()
    except Exception as e:
        print(f"Failed to fetch remote vars.json: {e}")
        return False

    try:
        global VOLUME_LIST, STARTING_PRICE, MAX_PRICE, FLOOR_STEP
        global TOLERANCE_PERCENT, INCREMENT, NEW_FLOOR_FREQUENCY

        # Parse list of string numbers to wei integers
        VOLUME_LIST = [Web3.to_wei(x, 'ether') for x in vars_dict.get("VOLUME_LIST", [])]

        STARTING_PRICE = Web3.to_wei(vars_dict.get("STARTING_PRICE", "0.10"), 'ether')
        MAX_PRICE = Web3.to_wei(vars_dict.get("MAX_PRICE", "1.10"), 'ether')
        FLOOR_STEP = Web3.to_wei(vars_dict.get("FLOOR_STEP", "0.25"), 'ether')
        TOLERANCE_PERCENT = Web3.to_wei(vars_dict.get("TOLERANCE_PERCENT", "0.05"), 'ether')
        INCREMENT = Web3.to_wei(vars_dict.get("INCREMENT", "0.01"), 'ether')
        NEW_FLOOR_FREQUENCY = int(vars_dict.get("NEW_FLOOR_FREQUENCY", 86400))

        print("Vars updated successfully from remote vars.json")
        return True

    except Exception as e:
        print(f"Error parsing remote vars.json: {e}")
        return False

if __name__ == "__main__":
    import asyncio
    while True:
        try:
            update_vars_from_github()
            decision, floor = asyncio.run(algorithm())
            json_result = {
                "vote": decision,
                "floor": str(floor)
            }            
            with open('algo.json', 'w') as f:
                json.dump(json_result, f)
        except:
            traceback.print_exc()
        time.sleep(1800)        