import time
import json
from selenium import webdriver
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.common.by import By
import platform
import os

URL = "https://my.bitbay.market/rates.html"
INTERVAL = 20 * 60  # 20 minutes in seconds
ALGO_FILE = "algo.json"

def launch_browser():
    is_windows = platform.system() == "Windows"
    driver_filename = "geckodriver.exe" if is_windows else "geckodriver"
    driver_path = os.path.join(os.getcwd(), driver_filename)

    options = FirefoxOptions()
    #options.headless = True  # Run in headless mode
    #service = FirefoxService(executable_path=driver_path)
    return webdriver.Firefox(options=options)

def algorithm(driver) -> dict | None:
    driver.get(URL)

    keywords = {"inflate", "deflate", "nochange"}
    timeout = 300
    for _ in range(timeout):
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()

        vote = next((k for k in keywords if k in body_text), None)
        if vote:
            algofloor = None
            try:
                # Find the substring starting with "target price floor:"
                start = body_text.index("target price floor: ")
                # Get the substring after that
                floor_part = body_text[start:].split("$")[1]
                # Split by whitespace to isolate the number
                floor_str = floor_part.split()[0]
                algofloor = float(floor_str)
            except (ValueError, IndexError):
                pass

            result = {"vote": vote}
            if algofloor is not None:
                result["floor"] = algofloor
            return result
        time.sleep(1)
    return None

def save_algo_result(result: dict):
    with open(ALGO_FILE, "w") as f:
        json.dump(result, f, indent=2)

def main_loop():
    while True:
        driver = launch_browser()
        try:
            result = algorithm(driver)
            if isinstance(result, dict):
                save_algo_result(result)
        except Exception as e:
            print("Error:", e)
        finally:
            driver.quit()
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main_loop()