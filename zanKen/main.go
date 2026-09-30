package main

import (
//	"fmt"
	"math/rand"
	"strconv"
	"strings"
	"syscall/js"
	"time"
)

type Game struct {
	playerHand []string
	playerDeck int
	comHand    []string
	comDeck    int
	fieldLeft  string
	fieldRight string
	isPlaying  bool
	isFinished bool
	document   js.Value
	stopCPU    chan struct{}
}

var game Game

func main() {
	c := make(chan struct{})
	rand.Seed(time.Now().UnixNano())

	game = Game{
		document: js.Global().Get("document"),
	}

	// キーボード入力
	onKeyDown := js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		event := args[0]
		code := event.Get("code").String()
		key := strings.ToUpper(event.Get("key").String())

		if code == "Space" {
			event.Call("preventDefault")
			if !game.isPlaying && !game.isFinished {
				game.startGame()
			} else if game.isFinished {
				game.initGame()
			}
		}

		if game.isPlaying {
			// キー入力（D: dragon, K: knight, H: princess/hime）に応じて該当する手札を出す
			if key == "D" {
				game.playCardType("dragon")
			} else if key == "K" {
				game.playCardType("knight")
			} else if key == "H" {
				game.playCardType("princess")
			}
		}

		return nil
	})

	js.Global().Call("addEventListener", "keydown", onKeyDown)

	game.initGame()
	<-c
}

// 三竦みの判定
func wins(cardA, cardB string) bool {
	if cardA == "knight" && cardB == "dragon" {
		return true
	}
	if cardA == "princess" && cardB == "knight" {
		return true
	}
	if cardA == "dragon" && cardB == "princess" {
		return true
	}
	return false
}

func generateDeck(count int) []string {
	types := []string{"dragon", "knight", "princess"}
	deck := make([]string, count)
	for i := 0; i < count; i++ {
		deck[i] = types[rand.Intn(3)]
	}
	return deck
}

func (g *Game) initGame() {
	g.isPlaying = false
	g.isFinished = false

	g.playerHand = generateDeck(3)
	g.playerDeck = 12
	g.comHand = generateDeck(3)
	g.comDeck = 12

	g.fieldLeft = ""
	g.fieldRight = ""

	g.updateUI()
	g.setMessage("SPACEキーを押してスタート！")
}

func (g *Game) startGame() {
	g.isPlaying = true
	g.drawFieldCards()
	g.updateUI()
	g.setMessage("バトル開始！ [D] [K] [H] キーで出せ！")

	g.stopCPU = make(chan struct{})
	go g.runCPU()
}

func (g *Game) drawFieldCards() {
	types := []string{"dragon", "knight", "princess"}
	g.fieldLeft = types[rand.Intn(3)]
	g.fieldRight = types[rand.Intn(3)]
}

// 押されたキー（カード種別）に対応する手札を探して出す処理
func (g *Game) playCardType(targetCard string) {
	handIndex := -1
	for i, card := range g.playerHand {
		if card == targetCard {
			handIndex = i
			break
		}
	}

	// 手札に対象のカードがなければ何もしない
	if handIndex == -1 {
		return
	}

	card := g.playerHand[handIndex]

	played := false
	if wins(card, g.fieldLeft) {
		g.fieldLeft = card
		played = true
	} else if wins(card, g.fieldRight) {
		g.fieldRight = card
		played = true
	}

	if played {
		if g.playerDeck > 0 {
			g.playerHand[handIndex] = generateDeck(1)[0]
			g.playerDeck--
		} else {
			g.playerHand = append(g.playerHand[:handIndex], g.playerHand[handIndex+1:]...)
		}

		g.updateUI()
		g.checkGameEnd()
	}
}

func (g *Game) runCPU() {
	ticker := time.NewTicker(700 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if !g.isPlaying {
				return
			}
			g.cpuTryMove()
		case <-g.stopCPU:
			return
		}
	}
}

func (g *Game) cpuTryMove() {
	for i, card := range g.comHand {
		played := false
		if wins(card, g.fieldLeft) {
			g.fieldLeft = card
			played = true
		} else if wins(card, g.fieldRight) {
			g.fieldRight = card
			played = true
		}

		if played {
			if g.comDeck > 0 {
				g.comHand[i] = generateDeck(1)[0]
				g.comDeck--
			} else {
				g.comHand = append(g.comHand[:i], g.comHand[i+1:]...)
			}
			g.updateUI()
			g.checkGameEnd()
			return
		}
	}
}

func (g *Game) checkGameEnd() {
	if len(g.playerHand) == 0 && g.playerDeck == 0 {
		g.isPlaying = false
		g.isFinished = true
		close(g.stopCPU)
		g.setMessage("🎉 あなたの勝ち！見事なスピード！")
	} else if len(g.comHand) == 0 && g.comDeck == 0 {
		g.isPlaying = false
		g.isFinished = true
		close(g.stopCPU)
		g.setMessage("💀 CPUの勝ち…！もっと素早く！")
	}
}

func (g *Game) setMessage(msg string) {
	el := g.document.Call("getElementById", "message")
	el.Set("textContent", msg)
}

func (g *Game) updateUI() {
	g.renderCardContainer("field-left", g.fieldLeft)
	g.renderCardContainer("field-right", g.fieldRight)

	g.document.Call("getElementById", "com-deck").Set("textContent", "残: "+strconv.Itoa(g.comDeck))
	for i := 0; i < 3; i++ {
		id := "com-hand-" + strconv.Itoa(i+1)
		if i < len(g.comHand) {
			g.renderCardContainer(id, "back")
		} else {
			g.renderCardContainer(id, "empty")
		}
	}

	g.document.Call("getElementById", "player-deck").Set("textContent", "残: "+strconv.Itoa(g.playerDeck))
	for i := 0; i < 3; i++ {
		id := "player-hand-" + strconv.Itoa(i+1)
		idBadge := "player-badge-" + strconv.Itoa(i+1)
		badgeEl := g.document.Call("getElementById", idBadge)

		if i < len(g.playerHand) {
			cardType := g.playerHand[i]
			g.renderCardContainer(id, cardType)
			
			// キーバッジ表示の切り替え
			if cardType == "dragon" {
				badgeEl.Set("textContent", "D")
			} else if cardType == "knight" {
				badgeEl.Set("textContent", "K")
			} else if cardType == "princess" {
				badgeEl.Set("textContent", "H")
			}
			badgeEl.Get("style").Set("display", "block")
		} else {
			g.renderCardContainer(id, "empty")
			badgeEl.Get("style").Set("display", "none")
		}
	}
}

func (g *Game) renderCardContainer(containerID string, cardType string) {
	container := g.document.Call("getElementById", containerID)
	if !container.Truthy() {
		return
	}
	template := g.document.Call("getElementById", "card-tpl-"+cardType)
	if template.Truthy() {
		container.Set("innerHTML", template.Get("innerHTML").String())
	} else {
		container.Set("innerHTML", "")
	}
}