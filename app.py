from flask import Flask, render_template, request, redirect, url_for, jsonify, session, flash
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import game_logic
import json
from sqlalchemy.types import TypeDecorator, TEXT
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'  # 生产环境应使用更安全的密钥
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///blackjack.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Custom type for JSON data
class JSONEncodedDict(TypeDecorator):
    impl = TEXT

    def process_bind_param(self, value, dialect):
        if value is not None:
            value = json.dumps(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            value = json.loads(value)
        return value

# Database Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    game_sessions = relationship('GameSession', backref='user', lazy=True)
    rankings = relationship('Ranking', backref='user', lazy=True)
    game_records = relationship('GameRecord', backref='user', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class GameSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, ForeignKey('user.id'), nullable=False)
    deck = db.Column(JSONEncodedDict, nullable=False)
    player_hand = db.Column(JSONEncodedDict, nullable=False)
    dealer_hand = db.Column(JSONEncodedDict, nullable=False)
    player_score = db.Column(db.Integer, nullable=False)
    dealer_score = db.Column(db.Integer, nullable=False)
    current_bet = db.Column(db.Integer, nullable=False)
    game_over = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

class Ranking(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, ForeignKey('user.id'), nullable=False)
    score = db.Column(db.Integer, default=0, nullable=False)

class GameRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, ForeignKey('user.id'), nullable=False)
    result = db.Column(db.String(10), nullable=False) # 'win', 'lose', 'draw'
    player_score = db.Column(db.Integer, nullable=False)
    dealer_score = db.Column(db.Integer, nullable=False)
    bet_amount = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

@app.route('/api/game/start', methods=['POST'])
async def start_game():
    print('Starting game for user:', session.get('username'))
    if 'username' not in session:
        print('User not logged in')
        return jsonify({'error': '未登录'}), 401

    user = User.query.filter_by(username=session['username']).first()
    if not user:
        return jsonify({'error': '用户不存在'}), 404

    data = request.get_json()
    bet_amount = data.get('bet_amount', 0)
    print('Received bet amount:', bet_amount)

    # 创建新牌组并洗牌
    deck = game_logic.create_deck()
    game_logic.shuffle_deck(deck)
    print('Deck shuffled:', deck[:5])

    # 发牌
    player_hand = game_logic.deal_cards(deck)
    dealer_hand = game_logic.deal_cards(deck, num_cards=2)
    print('Player hand:', player_hand)
    print('Dealer hand:', dealer_hand)

    # 计算分数
    player_score = game_logic.calculate_score(player_hand)
    dealer_score = game_logic.calculate_score(dealer_hand)

    # 创建新的 GameSession 记录
    new_game_session = GameSession(
        user_id=user.id,
        deck=deck,
        player_hand=player_hand,
        dealer_hand=dealer_hand,
        player_score=player_score,
        dealer_score=dealer_score,
        current_bet=bet_amount,
        game_over=False
    )
    db.session.add(new_game_session)
    db.session.commit() # Need to commit to get the session ID

    # 将游戏 session ID 存储在 Flask session 中
    session['game_session_id'] = new_game_session.id
    print('Game session ID stored in Flask session:', session['game_session_id'])

    # 返回给前端的数据，庄家第二张牌隐藏
    response_data = {
        'player_hand': player_hand,
        'dealer_hand': [dealer_hand[0], {'hidden': True}], # 庄家第二张牌隐藏
        'player_score': player_score,
        'dealer_score': game_logic.calculate_score([dealer_hand[0]]), # 只显示庄家明牌的分数
        'bet_amount': bet_amount,
        'game_over': False
    }

    # 检查玩家是否 Blackjack
    if player_score == 21:
        print('Player Blackjack!')
        # 如果玩家 Blackjack，直接进行庄家回合并结束游戏
        # 需要异步加载 game_session 才能更新
        game_session = GameSession.query.get(session['game_session_id'])
        if game_session:
            game_session.game_over = True
            # 使用从数据库加载的牌堆和庄家手牌进行庄家回合
            dealer_final_score = game_logic.dealer_ai_turn(game_session.deck, game_session.dealer_hand, game_session.player_score)
            game_session.dealer_score = dealer_final_score
            db.session.commit()

            result = game_logic.determine_result(game_session.player_score, game_session.dealer_score)
            response_data['game_over'] = True
            response_data['dealer_hand'] = game_session.dealer_hand # 游戏结束，显示庄家完整手牌
            response_data['dealer_score'] = game_session.dealer_score
            response_data['result'] = result
            if result != 'draw':
                 # 异步更新排名和游戏记录
                 update_rankings_db(user.id, game_session.current_bet * (2 if result == 'win' else 0))
                 add_game_record(user.id, result, game_session.player_score, game_session.dealer_score, game_session.current_bet)


    response = jsonify(response_data)
    print('Start game response:', response.json)
    return response

# 异步更新排名 (使用数据库)
def update_rankings_db(user_id, score):
    # 查找或创建用户的排名记录
    ranking = Ranking.query.filter_by(user_id=user_id).first()
    if ranking:
        if score > ranking.score:
            ranking.score = score
    else:
        new_ranking = Ranking(user_id=user_id, score=score)
        db.session.add(new_ranking)
    db.session.commit()

# 异步添加游戏记录 (使用数据库)
def add_game_record(user_id, result, player_score, dealer_score, bet_amount):
    new_record = GameRecord(
        user_id=user_id,
        result=result,
        player_score=player_score,
        dealer_score=dealer_score,
        bet_amount=bet_amount,
        timestamp=datetime.utcnow()
    )
    db.session.add(new_record)
    db.session.commit()


@app.route('/blackjack')
def blackjack_game():
    if 'username' not in session:
        return redirect(url_for('login'))
    # 在 index 页面显示排名，需要从数据库获取
    rankings_data = Ranking.query.order_by(Ranking.score.desc()).all()
    # 需要获取用户名，可以通过 user 关系访问
    player_scores_display = [{'username': r.user.username, 'score': r.score} for r in rankings_data]
    return render_template('index.html', username=session['username'], player_scores=player_scores_display)

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/about')
def about():
    return render_template('about.html')


@app.route('/api/game/hit', methods=['POST'])
async def hit():
    print('Player hits')
    if 'username' not in session:
        print('User not logged in')
        return jsonify({'error': '未登录'}), 401

    # 从 Flask session 获取游戏 session ID
    game_session_id = session.get('game_session_id')
    if not game_session_id:
        print('Game session ID not found in session')
        return jsonify({'error': '游戏未开始'}), 400

    # 从数据库异步加载游戏状态
    game_session = GameSession.query.get(game_session_id)
    if not game_session or game_session.game_over:
        print('Game not found or already over')
        return jsonify({'error': '游戏未开始或已结束'}), 400

    # 使用从数据库加载的状态
    deck = game_session.deck
    player_hand = game_session.player_hand
    player_score = game_session.player_score
    user_id = game_session.user_id
    current_bet = game_session.current_bet

    print('Current deck (from db):', deck[:5])
    print('Current player hand (from db):', player_hand)

    # 发牌
    if not deck:
        print('Deck is empty, cannot hit')
        return jsonify({'error': '牌堆为空，无法要牌'}), 400

    new_card = deck.pop()
    player_hand.append(new_card)
    print('New card:', new_card)

    # 计算新分数
    player_score = game_logic.calculate_score(player_hand)
    print('New player score:', player_score)

    # 更新数据库中的游戏状态
    game_session.deck = deck
    game_session.player_hand = player_hand
    game_session.player_score = player_score
    game_session.updated_at = datetime.utcnow() # Update timestamp
    db.session.commit()

    response_data = {
        'player_hand': player_hand,
        'new_card': new_card,
        'player_score': player_score,
        'game_over': False,
        'deck': deck # 返回更新后的牌堆
    }

    # 检查玩家是否爆牌
    if player_score > 21:
        print('Player busted!')
        game_session.game_over = True
        db.session.commit() # Commit game over state
        response_data['game_over'] = True
        response_data['result'] = 'lose' # 玩家爆牌直接输

        # 记录游戏结果
        add_game_record(user_id, 'lose', player_score, game_session.dealer_score, current_bet)

    response = jsonify(response_data)
    print('Hit response:', response.json)
    return response


@app.route('/api/game/double_down', methods=['POST'])
async def double_down():
    print('Player doubles down')
    if 'username' not in session:
        print('User not logged in')
        return jsonify({'error': '未登录'}), 401

    # 从 Flask session 获取游戏 session ID
    game_session_id = session.get('game_session_id')
    if not game_session_id:
        print('Game session ID not found in session')
        return jsonify({'error': '游戏未开始'}), 400

    # 从数据库异步加载游戏状态
    game_session = GameSession.query.get(game_session_id)
    if not game_session or game_session.game_over:
        print('Game not found or already over')
        return jsonify({'error': '游戏未开始或已结束'}), 400

    # 使用从数据库加载的状态
    deck = game_session.deck
    player_hand = game_session.player_hand
    current_bet = game_session.current_bet
    user_id = game_session.user_id

    # 验证赌注金额 (这里需要从用户模型获取余额，暂时跳过余额检查)
    # if user.balance < current_bet:
    #     return jsonify({'error': '余额不足'}), 400

    # 双倍下注
    game_session.current_bet *= 2
    db.session.commit() # Commit updated bet

    # 发牌
    if not deck:
        print('Deck is empty, cannot double down')
        return jsonify({'error': '牌堆为空，无法要牌'}), 400

    new_card = deck.pop()
    player_hand.append(new_card)
    print('New card:', new_card)

    # 计算新分数
    player_score = game_logic.calculate_score(player_hand)
    print('Player score:', player_score)

    # 更新数据库中的游戏状态
    game_session.deck = deck
    game_session.player_hand = player_hand
    game_session.player_score = player_score
    game_session.updated_at = datetime.utcnow() # Update timestamp

    if player_score > 21:
        print('Player busted after double down!')
        game_session.game_over = True
        db.session.commit() # Commit game over state
        result = 'lose'
        # 记录游戏结果
        add_game_record(user_id, result, player_score, game_session.dealer_score, game_session.current_bet)

        response = jsonify({
            'player_hand': player_hand,
            'new_card': new_card,
            'player_score': player_score,
            'game_over': True,
            'result': result,
            # 'balance': user.balance # 需要从用户模型获取余额
        })
        print('Double down response:', response.json)
        return response

    # 如果没有爆牌，双倍下注后必须停牌，直接进入庄家回合
    print('Player did not bust, proceeding to dealer turn')
    # 需要异步加载 game_session 才能更新
    game_session = GameSession.query.get(game_session_id) # Re-fetch to ensure latest state
    if game_session:
        game_session.game_over = True
        # 使用从数据库加载的牌堆和庄家手牌进行庄家回合
        dealer_final_score = game_logic.dealer_ai_turn(game_session.deck, game_session.dealer_hand, game_session.player_score)
        game_session.dealer_score = dealer_final_score
        db.session.commit()

        result = game_logic.determine_result(game_session.player_score, game_session.dealer_score)
        # 异步更新排名和游戏记录
        if result != 'draw':
             update_rankings_db(user_id, game_session.current_bet * (2 if result == 'win' else 0))
        add_game_record(user_id, result, game_session.player_score, game_session.dealer_score, game_session.current_bet)

        response = jsonify({
            'player_hand': game_session.player_hand,
            'new_card': new_card, # Still return the new card
            'player_score': game_session.player_score,
            'dealer_hand': game_session.dealer_hand, # Show dealer hand
            'dealer_score': game_session.dealer_score, # Show dealer score
            'game_over': True,
            'result': result,
            # 'balance': user.balance # Need user balance
        })
        print('Double down response (after dealer turn):', response.json)
        return response

    # This part should ideally not be reached if player didn't bust
    response = jsonify({
        'player_hand': player_hand,
        'new_card': new_card,
        'player_score': player_score,
        'game_over': False, # Should be True after double down
        # 'balance': user.balance # Need user balance
    })
    print('Double down response (unexpected):', response.json)
    return response


@app.route('/api/game/stand', methods=['POST'])
async def stand():
    print('Player stands')
    if 'username' not in session:
        print('User not logged in')
        return jsonify({'error': '未登录'}), 401

    # 从 Flask session 获取游戏 session ID
    game_session_id = session.get('game_session_id')
    if not game_session_id:
        print('Game session ID not found in session')
        return jsonify({'error': '游戏未开始'}), 400

    # 从数据库异步加载游戏状态
    game_session = GameSession.query.get(game_session_id)
    if not game_session or game_session.game_over:
        print('Game not found or already over')
        return jsonify({'error': '游戏未开始或已结束'}), 400

    # 使用从数据库加载的状态
    deck = game_session.deck
    player_hand = game_session.player_hand
    dealer_hand = game_session.dealer_hand
    player_score = game_session.player_score
    current_bet = game_session.current_bet
    user_id = game_session.user_id

    print('Current deck (from db):', deck[:5])
    print('Current player hand (from db):', player_hand)
    print('Current dealer hand (from db):', dealer_hand)
    print('Current player score (from db):', player_score)
    print('Current bet (from db):', current_bet)

    # 庄家行动 - 使用从数据库加载的牌堆和庄家手牌
    dealer_final_score = game_logic.dealer_ai_turn(deck, dealer_hand, player_score)
    print('Dealer hand after standing:', dealer_hand)
    print('Dealer score:', dealer_final_score)

    # 确定游戏结果
    result = game_logic.determine_result(player_score, dealer_final_score)
    print('Game result:', result)

    # 更新数据库中的游戏状态
    game_session.deck = deck
    game_session.dealer_hand = dealer_hand
    game_session.dealer_score = dealer_final_score
    game_session.game_over = True
    game_session.updated_at = datetime.utcnow() # Update timestamp
    db.session.commit()

    # 记录游戏结果并更新排名
    if result != 'draw':
        update_rankings_db(user_id, current_bet * (2 if result == 'win' else 0))
    add_game_record(user_id, result, player_score, dealer_final_score, current_bet)

    response_data = {
        'dealer_hand': dealer_hand, # 返回真实的庄家手牌
        'player_score': player_score,
        'dealer_score': dealer_final_score,
        'result': result,
        'game_over': True,
        'deck': deck # 返回更新后的牌堆
    }

    response = jsonify(response_data)
    print('Stand response:', response.json)
    return response

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        # 使用异步查询
        if User.query.filter_by(username=username).first():
            flash('用户名已存在', 'error')
            return redirect(url_for('register'))

        new_user = User(username=username)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()
        flash('注册成功，请登录', 'success')
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        # 使用异步查询
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            session['username'] = username
            flash('登录成功，欢迎回来！', 'success')
            return redirect(url_for('home'))

        flash('用户名或密码错误', 'error')
        return redirect(url_for('login'))
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('username', None)
    return redirect(url_for('home'))

@app.route('/rankings')
def rankings():
    # 从数据库获取排名
    rankings_data = Ranking.query.order_by(Ranking.score.desc()).all()
    # 需要获取用户名，可以通过 user 关系访问
    player_scores_display = [{'username': r.user.username, 'score': r.score} for r in rankings_data]
    return render_template('rankings.html', player_scores=player_scores_display)

@app.route('/api/user/stats')
def user_stats():
    if 'username' not in session:
        return jsonify({'error': '未登录'}), 401

    user = User.query.filter_by(username=session['username']).first()
    if not user:
        return jsonify({'error': '用户不存在'}), 404

    # 从数据库获取游戏记录
    user_games = GameRecord.query.filter_by(user_id=user.id).all()
    wins = sum(1 for game in user_games if game.result == 'win')
    losses = sum(1 for game in user_games if game.result == 'lose')
    draws = sum(1 for game in user_games if game.result == 'draw')

    return jsonify({
        'username': session['username'],
        'total_games': len(user_games),
        'wins': wins,
        'losses': losses,
        'draws': draws,
        'win_rate': wins / len(user_games) if user_games else 0
    })


if __name__ == '__main__':
    # 为了运行异步 Flask 应用，需要使用 ASGI 服务器，例如 hypercorn
    # 运行命令示例: hypercorn app:app -w 4 -k asyncio
    # 在开发环境中，可以使用 debug=True 运行，但需要安装 gevent 或 eventlet
    app.run(debug=True)
    # print("请使用 ASGI 服务器运行此应用，例如: hypercorn app:app -w 4 -k asyncio")
