from flask import jsonify, request, session
from datetime import datetime

from database import db, User, GameSession, GameRecord, Ranking
from database import update_rankings_db, add_game_record

import game_logic
from game_logic import *

# Get app reference (will be initialized when this is imported)
from app import app

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
