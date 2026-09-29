package main

import (
	"fmt"
	"math/rand"
	"strings"
	"syscall/js"
	"time"
)

type Game struct {
	isPlaying     bool
	playerChoice  string
	comChoice     string
	history       []HistoryItem
	document      js.Value
	shuffleTicker *time.Ticker
	stopShuffle   chan struct{}
}

type HistoryItem struct {
	COM    string
	Player string
	Result string
}

var game Game

func main() {
	c := make(chan struct{})

	rand.Seed(time.Now().UnixNano())

	game = Game{
		isPlaying:    false,
		playerChoice: "gu",
		history:      make([]HistoryItem, 0),
		document:     js.Global().Get("document"),
	}

	// 初期表示選択状態をセット
	game.selectHand("gu")

	// キーボードイベントの登録
	onKeyDown := js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		event := args[0]
		key := strings.ToUpper(event.Get("key").String())
		code := event.Get("code").String()

		if code == "Space" {
			event.Call("preventDefault")
			if !game.isPlaying {
				go game.startGame()
			}
		}

		if key == "S" {
			game.selectHand("gu")
		} else if key == "G" {
			game.selectHand("choki")
		} else if key == "K" {
			game.selectHand("pa")
		}

		return nil
	})

	js.Global().Call("addEventListener", "keydown", onKeyDown)

	<-c
}

func (g *Game) selectHand(hand string) {
	g.playerChoice = hand

	cards := map[string]string{
		"gu":    "card-gu",
		"choki": "card-choki",
		"pa":    "card-pa",
	}

	for key, id := range cards {
		el := g.document.Call("getElementById", id)
		if key == hand {
			el.Get("classList").Call("add", "selected")
		} else {
			el.Get("classList").Call("remove", "selected")
		}
	}
}

func (g *Game) startGame() {
	g.isPlaying = true

	signalEl := g.document.Call("getElementById", "signal")
	resultEl := g.document.Call("getElementById", "result")
	resultEl.Set("innerHTML", "")

	// COM手の高速シャッフル開始
	g.stopShuffle = make(chan struct{})
	g.shuffleTicker = time.NewTicker(50 * time.Millisecond)

	go func() {
		hands := []string{"gu", "choki", "pa"}
		idx := 0
		for {
			select {
			case <-g.shuffleTicker.C:
				idx = (idx + 1) % 3
				g.setSVGHand("com-hand-container", hands[idx])
			case <-g.stopShuffle:
				return
			}
		}
	}()

	signalEl.Set("textContent", "じゃん！")
	time.Sleep(800 * time.Millisecond)

	signalEl.Set("textContent", "けん！")
	time.Sleep(800 * time.Millisecond)

	signalEl.Set("textContent", "ぽん！")
	g.finishGame()
}

func (g *Game) finishGame() {
	g.shuffleTicker.Stop()
	g.stopShuffle <- struct{}{}

	hands := []string{"gu", "choki", "pa"}
	g.comChoice = hands[rand.Intn(3)]
	g.setSVGHand("com-hand-container", g.comChoice)

	var result string
	if g.playerChoice == g.comChoice {
		result = "あいこ"
	} else if (g.playerChoice == "gu" && g.comChoice == "choki") ||
		(g.playerChoice == "choki" && g.comChoice == "pa") ||
		(g.playerChoice == "pa" && g.comChoice == "gu") {
		result = "かち！"
	} else {
		result = "まけ…"
	}

	resultEl := g.document.Call("getElementById", "result")
	resultEl.Set("innerHTML", g.getPrettyResultSVG(result))

	g.addHistory(result)
	g.isPlaying = false
}

func (g *Game) setSVGHand(containerID string, hand string) {
	container := g.document.Call("getElementById", containerID)
	template := g.document.Call("getElementById", "svg-"+hand)
	if template.Truthy() {
		container.Set("innerHTML", template.Get("innerHTML").String())
	}
}

func (g *Game) getPrettyResultSVG(result string) string {
	color := "#FF6B6B" // かち！
	if result == "あいこ" {
		color = "#4ECDC4"
	} else if result == "まけ…" {
		color = "#70A1FF"
	}

	return fmt.Sprintf(`
		<svg width="220" height="70" viewBox="0 0 220 70">
			<defs>
				<filter id="pop-shadow" x="-10%%" y="-10%%" width="130%%" height="130%%">
					<feDropShadow dx="3" dy="4" stdDeviation="0" flood-color="#2D3436" />
				</filter>
			</defs>
			<rect x="10" y="10" width="200" height="50" rx="25" fill="%s" stroke="#2D3436" stroke-width="4" filter="url(#pop-shadow)" />
			<text x="110" y="45" font-family="'Comic Sans MS', cursive, sans-serif" font-size="28" font-weight="900" fill="#FFFFFF" text-anchor="middle" stroke="#2D3436" stroke-width="1.5">%s</text>
		</svg>
	`, color, result)
}

func (g *Game) addHistory(result string) {
	handNames := map[string]string{"gu": "ぐー", "choki": "ちょき", "pa": "ぱー"}

	newItem := HistoryItem{
		COM:    handNames[g.comChoice],
		Player: handNames[g.playerChoice],
		Result: result,
	}

	g.history = append([]HistoryItem{newItem}, g.history...)
	if len(g.history) > 5 {
		g.history = g.history[:5]
	}

	tbody := g.document.Call("getElementById", "history-body")
	tbody.Set("innerHTML", "")

	for idx, item := range g.history {
		tr := g.document.Call("createElement", "tr")
		tr.Set("innerHTML", fmt.Sprintf(`
			<td>%d</td>
			<td>%s</td>
			<td>%s</td>
			<td style="font-weight:bold;">%s</td>
		`, idx+1, item.COM, item.Player, item.Result))
		tbody.Call("appendChild", tr)
	}
}
