package main

import (
	"encoding/json"
	"io/ioutil"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"time"

	log "github.com/Sirupsen/logrus"
)

func init() {
	rand.Seed(time.Now().Unix())
}

type Env_t struct {
	Skip int
}

type Config_t struct {
	ApiKey string `json:"key"`
}

type QuoteCoin_t struct {
	LastUpdated      string  `json:"last_updated"`
	Price            float64 `json:"price"`
	Floor            float64 `json:"floor"`
	FloorJump        bool    `json:"floorjump"`
	PegVote          string  `json:"pegvote"`
}

type Record_t struct {
	Bay QuoteCoin_t `json:"BAY"`
	Btc QuoteCoin_t `json:"BTC"`
}

type Quote_t struct {
	Usd QuoteCoin_t `json:"USD"`
}

type CoinCMC_t struct {
	LastUpdated string  `json:"last_updated"`
	Quote       Quote_t `json:"quote"`
}

type DataCMC_t struct {
	Bay CoinCMC_t `json:"BAY"`
	Btc CoinCMC_t `json:"BTC"`
	Dai CoinCMC_t `json:"DAI"`
}

type RespCMC_t struct {
	Data DataCMC_t `json:"data"`
}

type RespLatoken_t struct {
	PairID 		string  `json:"pairId"`
	Symbol		string  `json:"symbol"`
	Volume 		float64 `json:"volume"`
	Open 		float64 `json:"open"`
	Low 		float64 `json:"low"`
	High 		float64 `json:"high"`
	Close 		float64 `json:"close"`
	PriceChange 	float64 `json:"priceChange"`
}

type RespNTOTC_t struct {
        Date          string  `json:"date"`
        Coin          string  `json:"coin"`
        Price         float64 `json:"price"`
	Volume        float64 `json:"volume"`
}

var (
	Env    *Env_t
	Config *Config_t
)

type RespNTrow_t struct {
	Date	int64	`json:"tt"`
	Close	float64	`json:"c"`
	Volume	float64	`json:"v"`
}

func main() {
	fconf, err := os.Open("coinmarketcap.conf")
	if err != nil {
		log.Fatal(err)
	}
	defer fconf.Close()

	Env = new(Env_t)
	Config = new(Config_t)

	err = json.NewDecoder(fconf).Decode(Config)
	if err != nil {
		log.Fatal(err)
	}

	log.Println("Config is read.")
	log.Println("API key:", Config.ApiKey)

	first := true
	probe := 1
	for {
		if first {
			first = false
		} else {
			time.Sleep(20 * time.Minute)
		}
		//time.Sleep(10 * time.Second)
		probe++

		out, err := exec.Command("sh", "-c", "pwd && cd ratedb && sleep 1 && git reset --hard").Output()
		log.Println("git reset --hard:", string(out))
		if err != nil {
			log.Println("exec.Command-i1 err:", err)
			continue
		}

		out, err = exec.Command("sh", "-c", "pwd && cd ratedb && sleep 1 && git pull gh master").Output()
		log.Println("git pull gh master:", string(out))
		if err != nil {
			log.Println("exec.Command-i2 err:", err)
			continue
		}

		client := &http.Client{}

		// coinmarketcap
		req1, err := http.NewRequest("GET", "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest", nil)
		if err != nil {
			log.Println("http.NewRequest err:", err)
			continue
		}

		q1 := req1.URL.Query()
		q1.Add("symbol", "BAY,BTC,DAI")
		req1.URL.RawQuery = q1.Encode()
		req1.Header.Add("X-CMC_PRO_API_KEY", Config.ApiKey)

		resp1, err := client.Do(req1)
		if err != nil {
			log.Println("client.Do err:", err)
			continue
		}
		defer resp1.Body.Close()

		RespData1 := new(RespCMC_t)

		err = json.NewDecoder(resp1.Body).Decode(RespData1)
		if err != nil {
			log.Println("Decode err:", err)
			continue
		}

		// latoken BAY-BTC / repl BAY-USDT
                //req2, err := http.NewRequest("GET", "https://api.latoken.com/api/v1/MarketData/ticker/BAYUSDT", nil)
                //if err != nil {
                //        log.Println("http.NewRequest err:", err)
                //        continue
                //}
		//
                //resp2, err := client.Do(req2)
                //if err != nil {
                //        log.Println("client.Do err:", err)
                //        continue
                //}
                //defer resp2.Body.Close()
		//
                //RespData2 := new(RespLatoken_t)
		//
                //err = json.NewDecoder(resp2.Body).Decode(RespData2)
                //if err != nil {
                //        log.Println("Decode err:", err)
                //        continue
                //}

		// NT OTC
                //req3, err := http.NewRequest("GET", "https://raw.githubusercontent.com/NightTrader/nighttrader.github.io/master/otc_trades.json", nil)
                //if err != nil {
                //        log.Println("http.NewRequest err:", err)
                //        continue
                //}
                //resp3, err := client.Do(req3)
                //if err != nil {
                //        log.Println("client.Do err:", err)
                //        continue
                //}
                //defer resp3.Body.Close()
                //RespData3 := new(RespNTOTC_t)
                //err = json.NewDecoder(resp3.Body).Decode(RespData3)
                //if err != nil {
                //        log.Println("Decode err:", err)
                //        continue
                //}

		// NT vs btc
                req4, err := http.NewRequest("GET", "https://my.nighttrader.exchange/u/chart/BAY-BTC/300", nil)
                if err != nil {
                        log.Println("http.NewRequest err:", err)
                        continue
                }

                resp4, err := client.Do(req4)
                if err != nil {
                        log.Println("client.Do err:", err)
                        continue
                }
                defer resp4.Body.Close()

		RespData4 := make([]RespNTrow_t, 0)

		err = json.NewDecoder(resp4.Body).Decode(&RespData4)
                if err != nil {
                        log.Println("Decode err:", err)
                        continue
                }
		nt_price1 := 0.
		if len(RespData4) >0 {
			nt_price1 = RespData4[len(RespData4)-1].Close * RespData1.Data.Btc.Quote.Usd.Price 
		}
		// last 40 points should have a volume
		last40_size := 40
		if len(RespData4) < last40_size {
			last40_size = len(RespData4)
		}
		has_vol1 := false
		for i:=len(RespData4)-last40_size; i<len(RespData4); i++ {
			if RespData4[i].Volume > 0. {
				has_vol1 = true
			}
		}

		// NT vs dai
                req5, err := http.NewRequest("GET", "https://my.nighttrader.exchange/u/chart/BAY-DAI/300", nil)
                if err != nil {
                        log.Println("http.NewRequest err:", err)
                        continue
                }

                resp5, err := client.Do(req5)
                if err != nil {
                        log.Println("client.Do err:", err)
                        continue
                }
                defer resp5.Body.Close()

		RespData5 := make([]RespNTrow_t, 0)

		err = json.NewDecoder(resp5.Body).Decode(&RespData5)
                if err != nil {
                        log.Println("Decode err:", err)
                        continue
                }
		nt_price2 := 0.
		if len(RespData5) >0 {
			nt_price2 = RespData5[len(RespData5)-1].Close * RespData1.Data.Dai.Quote.Usd.Price 
		}
		// last 40 points should have a volume
		last40_size = 40
		if len(RespData5) < last40_size {
			last40_size = len(RespData5)
		}
		has_vol2 := false
		for i:=len(RespData5)-last40_size; i<len(RespData5); i++ {
			if RespData5[i].Volume > 0. {
				has_vol2 = true
			}
		}


		nt_price := (nt_price1+nt_price2)/2.

		has_vol := has_vol1 || has_vol2

		// ready

		log.Println(
			"CMC BAY:", RespData1.Data.Bay.Quote.Usd.Price,
			"CMC BTC:", RespData1.Data.Btc.Quote.Usd.Price,
			"CMC DAI:", RespData1.Data.Dai.Quote.Usd.Price,
			"NTL BAY:", nt_price)

		Records := make([]Record_t, 0)
		{
			inp1k, err := ioutil.ReadFile("ratedb/rates1k.json")
			if err != nil {
				log.Println("ioutil.ReadFile err:", err)
			}

			err = json.Unmarshal(inp1k, &Records)
			if err != nil {
				log.Println("json.Unmarshal err:", err)
			}
		}

		LastBtcPrice := RespData1.Data.Btc.Quote.Usd.Price
		LastBayPrice := RespData1.Data.Bay.Quote.Usd.Price
		PrevBayPrice := LastBayPrice
		LastBtcFloor := 20000.0
		LastBayFloor := .2
                JumpBayFloor := false
		if len(Records) > 0 {
			LastBtcFloor = Records[len(Records)-1].Btc.Floor
			LastBayFloor = Records[len(Records)-1].Bay.Floor
			PrevBayPrice = Records[len(Records)-1].Bay.Price
			if LastBtcFloor == 0 {
				LastBtcFloor = 20000.0
			}
			if LastBtcPrice > LastBtcFloor {
				LastBtcFloor = LastBtcPrice
			}
			if LastBayFloor == 0 {
				LastBayFloor = 0.2
			}
			if len(Records) > 1000 {
				Over3x := true
				for i := 0; i < 1000; i++ {
					BayPrice := Records[len(Records)-1-i].Bay.Price
					if (BayPrice * 0.35) < LastBayFloor {
						Over3x = false
					}
                                        if Records[len(Records)-1-i].Bay.FloorJump {
                                                Over3x = false
                                        }
				}
				if Over3x {
					LastBayFloor *= 1.5
                                        JumpBayFloor = true
				}
			}
			if (LastBayFloor * 100000.0) < LastBtcFloor {
				LastBayFloor = LastBtcFloor / 100000.0
			}
		}

		var Record Record_t
		Record.Bay = RespData1.Data.Bay.Quote.Usd
		Record.Btc = RespData1.Data.Btc.Quote.Usd
		//if RespData2.Close >0 {
		//	Record.Bay.Price = RespData2.Close // (in USDT) * Record.Btc.Price
		//	LastBayPrice = RespData2.Close // (in USDT) * Record.Btc.Price
		if nt_price >0 {
			Record.Bay.Price = nt_price
			LastBayPrice = nt_price
		} else { // NT is down
			continue
			//if RespData3.Price >0 {
			//	Record.Bay.Price = RespData3.Price
			//	LastBayPrice = RespData3.Price
			//} else {
				Record.Bay.Price = PrevBayPrice
				LastBayPrice = PrevBayPrice
			//}
		}
                Record.Bay.FloorJump = JumpBayFloor
		Record.Bay.Floor = LastBayFloor
		Record.Btc.Floor = LastBtcFloor

		overrideApplied := false
		if data, err := os.ReadFile("algo.json"); err == nil {
			var algo map[string]interface{}
			if err := json.Unmarshal(data, &algo); err == nil {
				if vote, ok := algo["vote"].(string); ok {
					Record.Bay.PegVote = vote
					overrideApplied = true
				}
				if af, ok := algo["floor"].(float64); ok {
					Record.Bay.Floor = af
				}
			}
		}


		if !overrideApplied {
			if (LastBayPrice * 1.05) < LastBayFloor {
				Record.Bay.PegVote = "deflate"
			} else if (LastBayPrice * 0.95) > LastBayFloor {
				Record.Bay.PegVote = "inflate"
			} else {
				Record.Bay.PegVote = "nochange"
			}
	                //Record.Bay.PegVote = "inflate" // temp
			if !has_vol {
				Record.Bay.PegVote = "nochange"
			}
		}

		out, _ = json.MarshalIndent(Record, "", "\t")
		if err != nil {
			log.Println("json.MarshalIndent err:", err)
			continue
		}

		err = ioutil.WriteFile("ratedb/rates.json", out, 0644)
		if err != nil {
			log.Println("ioutil.WriteFile err:", err)
			continue
		}

		Records = append(Records, Record)
		if len(Records) > 2000 {
			Records = Records[len(Records)-2000:]
		}

		out1k, _ := json.MarshalIndent(Records, "", "\t")
		err = ioutil.WriteFile("ratedb/rates1k.json", out1k, 0644)
		if err != nil {
			log.Println("ioutil.WriteFile err:", err)
			continue
		}

		date := RespData1.Data.Bay.LastUpdated
		tc, err := time.Parse("2006-01-02T15:04:05.000Z", date)
		if err != nil {
			log.Println("time.Parse err:", err)
			continue
		}
		date_year := tc.Year()
		date_month := int(tc.Month())
		date_fname := strconv.Itoa(date_year) + "-" + strconv.Itoa(date_month)

		Records = make([]Record_t, 0)
		{
			inp1k, err := ioutil.ReadFile("ratedb/rates_" + date_fname + ".json")
			if err != nil {
				log.Println("ioutil.ReadFile err:", err)
			}

			err = json.Unmarshal(inp1k, &Records)
			if err != nil {
				log.Println("json.Unmarshal err:", err)
			}
		}
		Records = append(Records, Record)
		outm, _ := json.MarshalIndent(Records, "", "\t")
		err = ioutil.WriteFile("ratedb/rates_"+date_fname+".json", outm, 0644)
		if err != nil {
			log.Println("ioutil.WriteFile err:", err)
			continue
		}

		out, err = exec.Command("sh", "-c", "cd ratedb && git add rates_"+date_fname+".json").Output()
		log.Println(string(out))
		if err != nil {
			log.Println("exec.Command1 err:", err)
			continue
		}
		out, err = exec.Command("sh", "-c", "cd ratedb && sleep 1 && git commit -am update").Output()
		log.Println(string(out))
		if err != nil {
			log.Println("exec.Command2 err:", err)
			continue
		}
		out, err = exec.Command("sh", "-c", "cd ratedb && sleep 1 && git push gh master").Output()
		log.Println(string(out))
		if err != nil {
			log.Println("exec.Command3 err:", err)
			continue
		}
		out, err = exec.Command("sh", "-c", "cd ratedb && sleep 1 && git push bb master").Output()
		log.Println(string(out))
		if err != nil {
			log.Println("exec.Command4 err:", err)
			continue
		}
	}
}
