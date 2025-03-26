import pyxel

class App:
    def __init__(self):
        # ゲーム初期化が一度だけ行われるようにする
        if not hasattr(App, 'initialized'):
            # ゲーム画面の初期化（256x160ピクセル）
            pyxel.init(256, 160, title="Pyxel Defender")
            # クラスに初期化フラグを設定
            App.initialized = True
            # スプライト画像の作成
            self.create_sprites()
            # サウンドの設定
            self.setup_sound()
        
        # ゲーム変数の初期化（リスタート時にも実行される）
        self.reset_game()
        
    def reset_game(self):
        """ゲームをリセット/初期化する関数"""
        # プレイヤー関連の変数
        self.player_x = 80
        self.player_y = 80
        self.player_speed = 2
        self.player_bullets = []
        self.bullet_speed = 4
        self.player_lives = 3
        self.invincible = 0  # 無敵時間
        
        # 復活位置
        self.respawn_x = 80
        self.respawn_y = 80

        # 敵関連の変数
        self.enemies = []
        self.enemy_timer = 0
        self.score = 0
        
        # 地形（下部の山）
        self.terrain = []
        for x in range(0, 300, 10):
            height = 20 + pyxel.rndi(0, 5) * 4
            self.terrain.append((x, 160 - height, height))
        
        # 背景の星
        self.stars = []
        for _ in range(30):
            self.stars.append((
                pyxel.rndi(0, 255),
                pyxel.rndi(0, 120),
                pyxel.rndf(0.5, 1.5)
            ))
        
        # 爆発エフェクト
        self.explosions = []
        
        # 特殊エフェクト
        self.player_death_effect = []  # プレイヤーがやられた時のエフェクト
        self.player_respawn_effect = []  # プレイヤーが復活する時のエフェクト
        self.effect_lines = 16  # エフェクトの線の数
        self.respawn_timer = 0  # 復活までのタイマー
        
        # ゲームの状態
        self.game_state = "playing"  # "playing", "game_over", "respawning"
    
    def create_sprites(self):
        """スプライト画像をイメージバンクに作成する関数"""
        # 背景色をクリア
        pyxel.images[0].cls(0)
        
        # プレイヤーの宇宙船 (0, 0)
        pyxel.images[0].rect(0, 0, 8, 8, 11)  # 基本の四角形
        pyxel.images[0].rect(0, 3, 8, 2, 7)   # 中央部分
        pyxel.images[0].pset(7, 4, 10)        # 先端
        
        # 通常の敵 (8, 0)
        pyxel.images[0].rect(8, 0, 8, 8, 8)   # 基本の四角形
        pyxel.images[0].rect(8, 3, 6, 2, 2)   # 中央部分
        pyxel.images[0].pset(8, 4, 9)         # 先端
        
        # 追尾する敵 (16, 0)
        pyxel.images[0].circ(20, 4, 4, 14)    # 円形の敵
        pyxel.images[0].circb(20, 4, 4, 2)    # 外枠
        pyxel.images[0].pset(16, 4, 7)        # 左側の点
        pyxel.images[0].pset(17, 2, 7)        # 左上の点
        pyxel.images[0].pset(17, 6, 7)        # 左下の点
    
    def setup_sound(self):
        """サウンドを設定する関数"""
        # シューティング音
        pyxel.sounds[0].set(
            "a3a2c1a1",
            "p",
            "7",
            "s",
            10
        )
        
        # 爆発音
        pyxel.sounds[1].set(
            "f2f1c1g1c1f1",
            "n",
            "7742",
            "s",
            12
        )
        
        # ゲームオーバー音
        pyxel.sounds[2].set(
            "c2c2c2c2c2c2c2c2",
            "s",
            "4",
            "nf",
            20
        )
    
    def run(self):
        """ゲームを実行する関数"""
        # 最初に一度だけ実行される
        if not hasattr(App, 'running'):
            App.running = True
            pyxel.run(self.update, self.draw)
    
    def update(self):
        """ゲームの状態を更新する関数"""
        if self.game_state == "playing":
            self.update_player()
            self.update_bullets()
            self.update_enemies()
            self.update_explosions()
            self.check_collisions()
            self.spawn_enemies()
        elif self.game_state == "respawning":
            # 復活エフェクトの更新
            self.update_respawn_effect()
            self.update_enemies()  # 敵の動きは継続
        
        # 死亡エフェクトの更新（どの状態でも実行）
        self.update_death_effect()
        
        # 復活タイマーの処理
        if self.respawn_timer > 0:
            self.respawn_timer -= 1
            if self.respawn_timer == 0:
                # タイマーが0になったら復活エフェクト開始
                self.create_respawn_effect(80, 80)
        
        # Rキーでリスタート
        if self.game_state == "game_over" and pyxel.btnp(pyxel.KEY_R):
            self.reset_game()
    
    def update_player(self):
        """プレイヤーの状態を更新する関数"""
        # プレイヤーの移動
        if pyxel.btn(pyxel.KEY_LEFT) or pyxel.btn(pyxel.KEY_A):
            self.player_x = max(8, self.player_x - self.player_speed)
        if pyxel.btn(pyxel.KEY_RIGHT) or pyxel.btn(pyxel.KEY_D):
            self.player_x = min(pyxel.width - 8, self.player_x + self.player_speed)
        if pyxel.btn(pyxel.KEY_UP) or pyxel.btn(pyxel.KEY_W):
            self.player_y = max(8, self.player_y - self.player_speed)
        if pyxel.btn(pyxel.KEY_DOWN) or pyxel.btn(pyxel.KEY_S):
            self.player_y = min(140, self.player_y + self.player_speed)
        
        # 弾の発射
        if pyxel.btnp(pyxel.KEY_SPACE):
            self.player_bullets.append((self.player_x + 8, self.player_y))
            pyxel.play(0, 0, loop=False)  # 発射音
        
        # 無敵時間の更新
        if self.invincible > 0:
            self.invincible -= 1
    
    def update_bullets(self):
        """弾の状態を更新する関数"""
        # プレイヤーの弾の更新
        new_bullets = []
        for x, y in self.player_bullets:
            x += self.bullet_speed
            if x < pyxel.width + 8:
                new_bullets.append((x, y))
        self.player_bullets = new_bullets
    
    def update_enemies(self):
        """敵の状態を更新する関数"""
        # 敵の移動
        new_enemies = []
        for x, y, type in self.enemies:
            if type == 0:  # 通常の敵
                x -= 1
            elif type == 1:  # 追尾する敵
                x -= 1
                if x % 10 == 0:  # 10フレームごとにプレイヤーの方向に移動
                    if y < self.player_y:
                        y += 1
                    elif y > self.player_y:
                        y -= 1
            
            if x > -8:
                new_enemies.append((x, y, type))
        self.enemies = new_enemies
    
    def update_explosions(self):
        """爆発エフェクトを更新する関数"""
        # 爆発エフェクトの更新
        new_explosions = []
        for x, y, t in self.explosions:
            t -= 1
            if t > 0:
                new_explosions.append((x, y, t))
        self.explosions = new_explosions
    
    def create_death_effect(self, x, y):
        """プレイヤーの死亡エフェクトを作成する関数"""
        self.player_death_effect = []
        # 複数の線がプレイヤーの位置から広がるエフェクト
        for i in range(self.effect_lines):
            angle = i * (360 / self.effect_lines)
            # 角度、開始X、開始Y、速度X、速度Y、寿命
            dx = pyxel.cos(angle) * 2
            dy = pyxel.sin(angle) * 2
            self.player_death_effect.append([angle, x, y, dx, dy, 30])
    
    def update_death_effect(self):
        """死亡エフェクトを更新する関数"""
        if not self.player_death_effect:
            return
            
        new_effects = []
        for effect in self.player_death_effect:
            angle, x, y, dx, dy, life = effect
            # 線を移動
            x += dx
            y += dy
            life -= 1
            
            if life > 0:
                new_effects.append([angle, x, y, dx, dy, life])
                
        self.player_death_effect = new_effects
    
    def create_respawn_effect(self, x, y):
        """プレイヤーの復活エフェクトを作成する関数"""
        self.player_respawn_effect = []
        # 複数の線がプレイヤーの位置に集まるエフェクト
        for i in range(self.effect_lines):
            angle = i * (360 / self.effect_lines)
            # 画面端から始まる位置を計算
            start_x = x + pyxel.cos(angle) * 100
            start_y = y + pyxel.sin(angle) * 100
            # 角度、現在X、現在Y、目標X、目標Y、寿命
            self.player_respawn_effect.append([angle, start_x, start_y, x, y, 45])
        

        # 復活位置を設定
        self.respawn_x = x
        self.respawn_y = y

        # 状態を復活中に設定
        self.game_state = "respawning"
    
    def update_respawn_effect(self):
        """復活エフェクトを更新する関数"""
        if not self.player_respawn_effect:
            # エフェクト終了、プレイヤーを復活させてゲーム再開
            self.game_state = "playing"
            return
            
        all_arrived = True
        new_effects = []
        
        for effect in self.player_respawn_effect:
            angle, x, y, target_x, target_y, life = effect
            
            # 目標に向かって移動
            dx = (target_x - x) * 0.1
            dy = (target_y - y) * 0.1
            
            x += dx
            y += dy
            life -= 1
            
            # 目標に近づいているかチェック
            distance = ((target_x - x) ** 2 + (target_y - y) ** 2) ** 0.5
            
            if distance > 2 and life > 0:
                all_arrived = False
                new_effects.append([angle, x, y, target_x, target_y, life])
                
        self.player_respawn_effect = new_effects
        
        # すべての線が目標に到達したらプレイヤーを復活
        if all_arrived or not self.player_respawn_effect:
            self.game_state = "playing"
            # プレイヤーを復活位置に移動
            self.player_x = self.respawn_x
            self.player_y = self.respawn_y

    def spawn_enemies(self):
        """敵を出現させる関数"""
        # 敵の出現処理
        self.enemy_timer += 1
        if self.enemy_timer > 30:  # 30フレームごとに敵を出現
            self.enemy_timer = 0
            enemy_type = pyxel.rndi(0, 10)
            if enemy_type < 8:  # 80%の確率で通常の敵
                self.enemies.append((pyxel.width, pyxel.rndi(20, 130), 0))
            else:  # 20%の確率で追尾する敵
                self.enemies.append((pyxel.width, pyxel.rndi(20, 130), 1))
    
    def check_collisions(self):
        """衝突判定を行う関数"""
        # 弾と敵の衝突判定
        new_bullets = []
        for bx, by in self.player_bullets:
            hit = False
            for i, (ex, ey, etype) in enumerate(self.enemies):
                if abs(bx - ex) < 8 and abs(by - ey) < 8:
                    hit = True
                    # 敵を削除
                    self.enemies.pop(i)
                    # 爆発エフェクト
                    self.explosions.append((ex, ey, 10))
                    # スコア加算
                    self.score += 100
                    # 爆発音
                    pyxel.play(0, 1, loop=False)
                    break
            if not hit:
                new_bullets.append((bx, by))
        self.player_bullets = new_bullets
        
        # プレイヤーと敵の衝突判定
        if self.invincible == 0:
            for i, (ex, ey, _) in enumerate(self.enemies):
                if abs(self.player_x - ex) < 8 and abs(self.player_y - ey) < 8:
                    # 敵を削除
                    self.enemies.pop(i)
                    # ライフを減らす
                    self.player_lives -= 1
                    # 爆発エフェクト
                    self.explosions.append((self.player_x, self.player_y, 20))
                    # 死亡エフェクト作成
                    self.create_death_effect(self.player_x, self.player_y)
                    
                    if self.player_lives <= 0:
                        # ゲームオーバー
                        self.game_state = "game_over"
                        pyxel.play(0, 2, loop=False)  # ゲームオーバー音
                    else:
                        # 無敵時間設定
                        self.invincible = 60
                        # 爆発音
                        pyxel.play(0, 1, loop=False)
                        # 復活エフェクトのタイマーを設定
                        self.respawn_timer = 60  # 60フレーム（約1秒）後に復活
                        # 復活位置を保存
                        self.respawn_x = 80
                        self.respawn_y = 80
                    break
    
    def draw(self):
        """画面を描画する関数"""
        pyxel.cls(0)
        
        # 背景の星を描画
        for x, y, speed in self.stars:
            px = (x - pyxel.frame_count * speed / 2) % pyxel.width
            pyxel.pset(px, y, 7)
        
        # 地形を描画
        for x, y, h in self.terrain:
            terrain_x = (x - pyxel.frame_count / 2) % 300
            if terrain_x < pyxel.width:
                pyxel.rect(terrain_x, y, 12, h, 3)
        
        # ゲームが進行中かリスポーン中なら敵を描画
        if self.game_state in ["playing", "respawning"]:
            # 敵を描画
            for x, y, type in self.enemies:
                if type == 0:  # 通常の敵
                    pyxel.blt(x, y, 0, 8, 0, 8, 8, 0)
                else:  # 追尾する敵
                    pyxel.blt(x, y, 0, 16, 0, 8, 8, 0)
        
        # ゲームが進行中ならプレイヤーと弾を描画
        if self.game_state == "playing":
            # プレイヤーを描画（無敵時間中は点滅）
            if self.invincible == 0 or pyxel.frame_count % 4 < 2:
                pyxel.blt(self.player_x, self.player_y, 0, 0, 0, 8, 8, 0)
            
            # 弾を描画
            for x, y in self.player_bullets:
                pyxel.rect(x, y, 4, 1, 10)
        
        # 爆発エフェクトを描画
        for x, y, t in self.explosions:
            pyxel.circb(x, y, 10 - t, 8 + t % 3)
        
        # 死亡エフェクトを描画
        for angle, x, y, dx, dy, life in self.player_death_effect:
            line_length = 20 * (life / 30)  # エフェクトの残り時間に応じて線の長さを変える
            end_x = x - dx * line_length
            end_y = y - dy * line_length
            pyxel.line(x, y, end_x, end_y, 7)
        
        # 復活エフェクトを描画
        for angle, x, y, target_x, target_y, life in self.player_respawn_effect:
            # 線の色を時間で変化させる
            color = 7 + life % 8
            pyxel.line(x, y, target_x, target_y, color)
        
        # UI情報を描画
        pyxel.text(4, 4, f"SCORE: {self.score}", 7)
        pyxel.text(4, 14, f"LIVES: {self.player_lives}", 7)
        
        # ゲームオーバー表示
        if self.game_state == "game_over":
            pyxel.text(pyxel.width // 2 - 30, pyxel.height // 2, "GAME OVER", pyxel.frame_count % 16)
            pyxel.text(pyxel.width // 2 - 50, pyxel.height // 2 + 10, "PRESS R TO RESTART", 7)


# メインのゲームを作成して実行
if __name__ == "__main__":
    app = App()
    app.run()