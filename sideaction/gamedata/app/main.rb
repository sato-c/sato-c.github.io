# 横スクロールアクション基礎 (DragonRuby GTK) 改訂版
# mygame/app/main.rb として保存して実行
#
# 操作 ←→:移動  SPACE:ジャンプ(2段)  A:左攻撃  D:右攻撃  ENTER:スタート

SCREEN_W    = 640
SCREEN_H    = 320
TILE        = 16
VIEW_SCALE  = 2.0                  # 640x320 -> 1280x640
VIEW_X      = 0
VIEW_Y      = 40                   # 1280x720 の縦中央
GROUND_TOP  = TILE * 2             # 下2列が地面
SCREENS     = 8                    # ステージ全長(画面数) 5～10で調整
WORLD_W     = SCREEN_W * SCREENS
SCROLL_X    = 160                  # 自キャラがこの位置を超えるとスクロール
SCROLL_STOP_REMAIN = 320           # 自キャラがマップ残りこの距離に入ったらスクロール停止
GOAL_REMAIN = 160                  # マップ残りこの距離がゴール範囲
CAMERA_MAX  = WORLD_W - SCROLL_STOP_REMAIN - SCROLL_X
START_LIVES = 3

PLAYER_W      = 32
PLAYER_H      = 64
PLAYER_SPEED  = 2.5
PLAYER_BOX_X  = 6                  # 当たり判定の左右の余白
PLAYER_BOX_W  = PLAYER_W - PLAYER_BOX_X * 2
JUMP_V        = 9.0
GRAVITY       = 0.4
MAX_JUMPS     = 2
INVULN_FRAMES = 120
# 攻撃の幅の推移: □ → □□ → □ (各6フレーム)
ATTACK_WIDTHS = [TILE] * 6 + [TILE * 2] * 6 + [TILE] * 6

# 硬直(フレーム)と先行入力
JUMP_LOCK        = 3               # 通常ジャンプ後: ジャンプ/攻撃を受け付けない
DOUBLE_JUMP_LOCK = 6               # 2段ジャンプ後
ATTACK_RECOVERY  = 4               # 攻撃終了後: ジャンプ/攻撃を受け付けない
LAND_LOCK        = 8               # 2段ジャンプ/空中攻撃した後の着地: 動けない
INPUT_BUFFER     = 6               # 先行入力の保持フレーム

ENEMY_W            = 32
ENEMY_H            = 64
ENEMY_CHASE_SPEED  = 1.8           # 左から出て追いかける
ENEMY_COME_SPEED   = 1.4           # 右から向かってくる
ENEMY_ATTACK_WIDTHS = [TILE, TILE * 2, TILE, TILE * 2]  # □→□□→□→□□
ENEMY_ATTACK_PHASE  = 15
MAX_ENEMIES        = 5
SPAWN_INTERVALS    = [220, 140, 80] # 前半/中盤/後半の出現間隔(フレーム)

def overlap?(a, b)
  a[0] < b[0] + b[2] && b[0] < a[0] + a[2] &&
    a[1] < b[1] + b[3] && b[1] < a[1] + a[3]
end

def clamp_to(v, lo, hi)
  [[v, lo].max, hi].min
end

class Player
  attr_accessor :x, :y, :vy, :dir, :jumps, :on_ground,
                :attack_t, :attack_dir, :invuln,
                :act_lock, :move_lock,
                :jump_buf, :atk_buf, :atk_buf_dir,
                :air_double, :air_attacked

  def initialize
    @x = 64.0
    @y = GROUND_TOP
    @vy = 0.0
    @dir = 1
    @jumps = MAX_JUMPS
    @on_ground = true
    @attack_t = nil
    @attack_dir = 1
    @invuln = 0
    @act_lock = 0        # ジャンプ/攻撃を受け付けない残りフレーム
    @move_lock = 0       # 移動も含めて動けない残りフレーム
    @jump_buf = 0
    @atk_buf = 0
    @atk_buf_dir = 1
    @air_double = false  # 今回の空中で2段ジャンプを使ったか
    @air_attacked = false # 今回の空中で攻撃したか
  end

  def body_box
    [@x + PLAYER_BOX_X, @y + 4, PLAYER_BOX_W, PLAYER_H - 8]
  end

  def attack_box
    return nil unless @attack_t
    w = ATTACK_WIDTHS[@attack_t]
    ax = @attack_dir > 0 ? @x + PLAYER_W : @x - w
    [ax, @y + TILE, w, TILE]   # 真ん中の段
  end
end

class Enemy
  attr_accessor :x, :y, :dir, :speed, :t, :dead

  def initialize(x, dir, speed)
    @x = x
    @y = GROUND_TOP
    @dir = dir
    @speed = speed
    @t = 0
    @dead = false
  end

  def body_box
    [@x + 4, @y + 4, ENEMY_W - 8, ENEMY_H - 8]
  end

  def full_box
    [@x, @y, ENEMY_W, ENEMY_H]
  end

  def attack_box
    w = ENEMY_ATTACK_WIDTHS[(@t / ENEMY_ATTACK_PHASE).to_i % ENEMY_ATTACK_WIDTHS.length]
    ax = @dir > 0 ? @x + ENEMY_W : @x - w
    [ax, @y, w, ENEMY_H]       # 上下の段すべて
  end
end

class Game
  def initialize
    @scene = :title
    @frame = 0
    reset
  end

  def reset
    @player = Player.new
    @enemies = []
    @obstacles = build_obstacles
    @lives = START_LIVES
    @max_x = 0.0
    @spawn_timer = 120
    @camera_x = 0.0
  end

  # 地面の上に1段分の障害物を並べる
  def build_obstacles
    list = []
    x = SCREEN_W
    i = 0
    while x < WORLD_W - SCREEN_W
      w = (i % 3 == 2) ? TILE * 2 : TILE
      list << [x, GROUND_TOP, w, TILE]
      x += TILE * (8 + (i * 5) % 6)
      i += 1
    end
    list
  end

  def tick(args)
    @frame += 1
    kb = args.inputs.keyboard
    case @scene
    when :title
      if kb.key_down.enter
        reset
        @scene = :play
      end
    when :play
      update(kb)
    when :gameover, :clear
      if kb.key_down.enter
        reset
        @scene = :play
      end
    end
    render(args)
  end

  # ---------- 更新 ----------

  def update(kb)
    p = @player

    # 硬直・先行入力のカウントダウン
    p.act_lock -= 1 if p.act_lock > 0
    p.move_lock -= 1 if p.move_lock > 0
    p.jump_buf -= 1 if p.jump_buf > 0
    p.atk_buf -= 1 if p.atk_buf > 0

    # 移動(着地硬直中は不可)
    if p.move_lock == 0
      dx = 0
      dx -= 1 if kb.key_down.left || kb.key_held.left
      dx += 1 if kb.key_down.right || kb.key_held.right
      if dx != 0
        p.dir = dx
        move_x(p, dx * PLAYER_SPEED)
      end
    end

    # 先行入力の記録
    p.jump_buf = INPUT_BUFFER if kb.key_down.space
    if kb.key_down.a
      p.atk_buf = INPUT_BUFFER
      p.atk_buf_dir = -1
    elsif kb.key_down.d
      p.atk_buf = INPUT_BUFFER
      p.atk_buf_dir = 1
    end

    # 行動(硬直が明けたフレームで先行入力を消化)
    if p.act_lock == 0 && p.move_lock == 0
      if p.atk_buf > 0 && p.attack_t.nil?
        start_attack(p, p.atk_buf_dir)
        p.atk_buf = 0
      end
      if p.jump_buf > 0 && p.jumps > 0
        do_jump(p)
        p.jump_buf = 0
      end
    end

    apply_gravity(p)

    @max_x = p.x if p.x > @max_x
    @camera_x = clamp_to(p.x - SCROLL_X, 0, CAMERA_MAX)

    spawn_enemy
    update_enemies
    check_player_attack
    check_player_hit
    advance_timers(p)

    @scene = :clear if p.x + PLAYER_W >= WORLD_W - GOAL_REMAIN
  end

  def lock_act(p, n)
    p.act_lock = n + 1 if n + 1 > p.act_lock    # +1: 設定したフレーム自身の分
  end

  def lock_move(p, n)
    p.move_lock = n + 1 if n + 1 > p.move_lock
  end

  def start_attack(p, dir)
    p.attack_t = 0
    p.attack_dir = dir
    p.dir = dir
    p.air_attacked = true unless p.on_ground
  end

  # 2段目は「地上からジャンプした空中」でだけ使える
  def do_jump(p)
    if p.on_ground
      lock_act(p, JUMP_LOCK)
    else
      p.air_double = true
      lock_act(p, DOUBLE_JUMP_LOCK)
    end
    p.vy = JUMP_V
    p.jumps -= 1
    p.on_ground = false
  end

  # 横移動(障害物は横から入れない)
  def move_x(p, dx)
    nx = clamp_to(p.x + dx, 0, WORLD_W - PLAYER_W)
    box = [nx + PLAYER_BOX_X, p.y, PLAYER_BOX_W, PLAYER_H]
    hit = @obstacles.find { |o| overlap?(box, o) }
    if hit
      nx = dx > 0 ? hit[0] - PLAYER_BOX_X - PLAYER_BOX_W : hit[0] + hit[2] - PLAYER_BOX_X
    end
    p.x = nx
  end

  def apply_gravity(p)
    was_ground = p.on_ground
    prev_y = p.y
    p.vy -= GRAVITY
    p.y += p.vy

    # 床の高さ: 地面、または真上から来た場合は障害物の上
    floor_y = GROUND_TOP
    px = p.x + PLAYER_BOX_X
    @obstacles.each do |o|
      top = o[1] + o[3]
      next unless prev_y >= top - 0.001
      next unless px < o[0] + o[2] && o[0] < px + PLAYER_BOX_W
      floor_y = top if top > floor_y
    end

    if p.y <= floor_y
      p.y = floor_y
      p.vy = 0.0
      p.on_ground = true
      p.jumps = MAX_JUMPS
      on_land(p) unless was_ground
    else
      p.on_ground = false
      p.jumps = 0 if was_ground   # 段差から落ちた場合はジャンプ不可
    end
  end

  # 2段ジャンプ後・空中攻撃後の着地は動き出しが遅れる
  def on_land(p)
    lock_move(p, LAND_LOCK) if p.air_double || p.air_attacked
    p.air_double = false
    p.air_attacked = false
  end

  def spawn_interval
    zone = [(@player.x * 3 / WORLD_W).to_i, 2].min
    (SPAWN_INTERVALS[zone] * (0.7 + rand * 0.6)).to_i
  end

  # 画面内の自キャラ周辺から出現(左=追いかける / 右=向かってくる)
  def spawn_enemy
    @spawn_timer -= 1
    return if @spawn_timer > 0
    @spawn_timer = spawn_interval
    return if @enemies.length >= MAX_ENEMIES

    p = @player
    cands = []
    lx = p.x - 130 + rand(60)
    cands << [:left, lx] if lx >= @camera_x
    rx = p.x + 200 + rand(50)
    cands << [:right, rx] if rx + ENEMY_W <= @camera_x + SCREEN_W && rx + ENEMY_W <= WORLD_W
    return if cands.empty?

    side, x = cands.sample
    if side == :left
      @enemies << Enemy.new(x, 1, ENEMY_CHASE_SPEED)
    else
      @enemies << Enemy.new(x, -1, ENEMY_COME_SPEED)
    end
  end

  # 進行方向は出現時に固定: 避けられたら追わずにそのまま画面外へ
  def update_enemies
    @enemies.each do |e|
      e.x += e.dir * e.speed
      e.t += 1
    end
    @enemies.reject! do |e|
      e.dead || e.x + ENEMY_W < @camera_x || e.x > @camera_x + SCREEN_W
    end
  end

  def check_player_attack
    box = @player.attack_box
    return unless box
    @enemies.each { |e| e.dead = true if overlap?(box, e.full_box) }
  end

  def check_player_hit
    p = @player
    return if p.invuln > 0
    pb = p.body_box
    hit = @enemies.any? do |e|
      !e.dead && (overlap?(pb, e.body_box) || overlap?(pb, e.attack_box))
    end
    return unless hit
    @lives -= 1
    p.invuln = INVULN_FRAMES
    @scene = :gameover if @lives <= 0
  end

  def advance_timers(p)
    p.invuln -= 1 if p.invuln > 0
    if p.attack_t
      p.attack_t += 1
      if p.attack_t >= ATTACK_WIDTHS.length
        p.attack_t = nil
        lock_act(p, ATTACK_RECOVERY)
      end
    end
  end

  # ---------- 描画 ----------

  def sx(x)
    (x - @camera_x).round
  end

  def render(args)
    t = args.outputs[:screen]
    t.w = SCREEN_W
    t.h = SCREEN_H

    t.solids << { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H, r: 120, g: 180, b: 230 }
    draw_ground(t)
    draw_obstacles(t)
    draw_goal(t)
    draw_enemies(t)
    draw_player(t)
    draw_hud(t)
    draw_overlay(t)

    args.outputs.sprites << {
      x: VIEW_X, y: VIEW_Y, w: SCREEN_W * VIEW_SCALE, h: SCREEN_H * VIEW_SCALE,
      path: :screen, scale_quality_enum: 0
    }
  end

  def draw_ground(t)
    t.solids << { x: 0, y: 0, w: SCREEN_W, h: GROUND_TOP, r: 110, g: 80, b: 50 }
    t.solids << { x: 0, y: GROUND_TOP - TILE, w: SCREEN_W, h: TILE, r: 70, g: 150, b: 60 }
    off = @camera_x % TILE
    (0..(SCREEN_W / TILE).to_i).each do |i|
      x = (i * TILE - off).round
      (GROUND_TOP / TILE).to_i.times do |row|
        t.borders << { x: x, y: row * TILE, w: TILE, h: TILE, r: 50, g: 35, b: 20, a: 140 }
      end
    end
  end

  def draw_obstacles(t)
    @obstacles.each do |o|
      x = sx(o[0])
      next if x + o[2] < 0 || x > SCREEN_W
      t.solids << { x: x, y: o[1], w: o[2], h: o[3], r: 130, g: 130, b: 140 }
      (o[2] / TILE).to_i.times do |i|
        t.borders << { x: x + i * TILE, y: o[1], w: TILE, h: TILE, r: 60, g: 60, b: 70 }
      end
    end
  end

  # ゴール範囲(マップ残り GOAL_REMAIN)の入り口に旗
  def draw_goal(t)
    x = sx(WORLD_W - GOAL_REMAIN)
    return if x > SCREEN_W
    t.solids << { x: x, y: GROUND_TOP, w: 4, h: 128, r: 240, g: 240, b: 240 }
    t.solids << { x: x - 28, y: GROUND_TOP + 96, w: 28, h: 24, r: 220, g: 40, b: 40 }
  end

  def draw_enemies(t)
    @enemies.each do |e|
      x = sx(e.x)
      ab = e.attack_box
      t.solids << { x: sx(ab[0]), y: ab[1], w: ab[2], h: ab[3], r: 255, g: 150, b: 30, a: 170 }
      t.solids << { x: x, y: e.y, w: ENEMY_W, h: ENEMY_H, r: 200, g: 40, b: 50 }
      ex = e.dir > 0 ? x + 20 : x + 6
      t.solids << { x: ex, y: e.y + 44, w: 6, h: 6, r: 255, g: 255, b: 255 }
    end
  end

  def draw_player(t)
    p = @player
    ab = p.attack_box
    if ab
      t.solids << { x: sx(ab[0]), y: ab[1], w: ab[2], h: ab[3], r: 255, g: 230, b: 60 }
    end
    return if p.invuln > 0 && (@frame / 4).to_i.even?
    x = sx(p.x)
    t.solids << { x: x, y: p.y, w: PLAYER_W, h: PLAYER_H, r: 50, g: 90, b: 220 }
    fx = p.dir > 0 ? x + 18 : x + 4
    t.solids << { x: fx, y: p.y + 46, w: 10, h: 8, r: 255, g: 255, b: 255 }
  end

  def draw_hud(t)
    score = (@max_x / 4).to_i * 10
    t.labels << { x: 6, y: SCREEN_H - 4, text: "SCORE #{score}", size_enum: -3, r: 255, g: 255, b: 255 }
    t.labels << { x: SCREEN_W - 6, y: SCREEN_H - 4, text: "LIFE x#{@lives}",
                  size_enum: -3, alignment_enum: 2, r: 255, g: 255, b: 255 }
  end

  def draw_overlay(t)
    return if @scene == :play
    t.solids << { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H, r: 0, g: 0, b: 0, a: 150 }
    lines =
      case @scene
      when :title
        ["SIDE ACTION", "<- ->:MOVE  SPACE:JUMP  A/D:ATTACK", "PRESS ENTER"]
      when :gameover
        ["GAME OVER", "SCORE #{(@max_x / 4).to_i * 10}", "PRESS ENTER"]
      else
        ["GOAL!", "SCORE #{(@max_x / 4).to_i * 10}", "PRESS ENTER"]
      end
    lines.each_with_index do |s, i|
      t.labels << { x: SCREEN_W / 2, y: 210 - i * 36, text: s, size_enum: (i == 0 ? 2 : -2),
                    alignment_enum: 1, r: 255, g: 255, b: 255 }
    end
  end
end

def tick(args)
  args.state.game ||= Game.new
  args.state.game.tick(args)
end
