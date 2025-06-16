from flask import jsonify, request, session
from datetime import datetime
import logging

from database import db, User, GameSession, GameRecord, Ranking
from database import update_rankings_db, add_game_record
import game_logic

logger = logging.getLogger(__name__)

# Get app reference (will be initialized when this is imported)
from app import app

class GameError(Exception):
    """Custom exception for game-related errors."""
    pass

def get_current_user():
    """Get current logged-in user."""
    if 'username' not in session:
        raise GameError('未登录')
    
    user = User.query.filter_by(username=session['username']).first()
    if not user:
        raise GameError('用户不存在')
    
    return user

def get_current_game_session():
    """Get current game session."""
    game_session_id = session.get('game_session_id')
    if not game_session_id:
        raise GameError('游戏未开始')
    
    game_session = GameSession.query.get(game_session_id)
    if not game_session or game_session.game_over:
        raise GameError('游戏未开始或已结束')
    
    return game_session

def update_game_session(game_session, **kwargs):
    """Update game session with provided fields."""
    for key, value in kwargs.items():
        setattr(game_session, key, value)
    game_session.updated_at = datetime.utcnow()
    db.session.commit()

def handle_game_end(game_session, result):
    """Handle end game logic including payouts and records."""
    user = User.query.get(game_session.user_id)
    
    # Calculate payout
    payout = 0
    if result == 'win':
        payout = game_session.current_bet * 2
    elif result == 'draw':
        payout = game_session.current_bet
    
    # Update user balance
    user.balance += payout
    
    # Record game and update rankings
    add_game_record(
        game_session.user_id, 
        result, 
        game_session.player_score, 
        game_session.dealer_score, 
        game_session.current_bet
    )
    
    if result != 'draw':
        update_rankings_db(game_session.user_id, payout)
    
    db.session.commit()
    return user.balance

@app.route('/api/game/start', methods=['POST'])
def start_game():
    """Start a new blackjack game."""
    try:
        user = get_current_user()
        data = request.get_json() or {}
        bet_amount = data.get('bet_amount', 0)
        
        # Validate bet amount
        if not isinstance(bet_amount, (int, float)) or bet_amount <= 0:
            return jsonify({'error': '下注金额必须大于0'}), 400
        
        if user.balance < bet_amount:
            return jsonify({'error': '余额不足'}), 400

        # Deduct bet amount
        user.balance -= bet_amount
        
        # Create and shuffle deck
        deck = game_logic.create_deck()
        game_logic.shuffle_deck(deck)

        # Deal initial cards
        player_hand = game_logic.deal_cards(deck, 2)
        dealer_hand = game_logic.deal_cards(deck, 2)

        # Calculate scores
        player_score = game_logic.calculate_score(player_hand)
        dealer_score = game_logic.calculate_score(dealer_hand)

        # Create game session
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
        db.session.commit()

        session['game_session_id'] = new_game_session.id

        response_data = {
            'player_hand': player_hand,
            'dealer_hand': dealer_hand,
            'player_score': player_score,
            'dealer_score': dealer_score,
            'current_bet': bet_amount,
            'balance': user.balance,
            'game_over': False
        }

        # Check for player blackjack
        if game_logic.is_blackjack(player_hand):
            new_game_session.game_over = True
            dealer_final_score = game_logic.dealer_ai_turn(
                new_game_session.deck, 
                new_game_session.dealer_hand, 
                new_game_session.player_score
            )
            new_game_session.dealer_score = dealer_final_score
            
            result = game_logic.determine_result(player_score, dealer_final_score)
            
            # Handle blackjack payout (1.5x)
            if result == 'win':
                user.balance += bet_amount * 2.5
            elif result == 'draw':
                user.balance += bet_amount
            
            db.session.commit()
            
            response_data.update({
                'game_over': True,
                'dealer_hand': new_game_session.dealer_hand,
                'dealer_score': new_game_session.dealer_score,
                'result': result,
                'balance': user.balance
            })
            
            # Record game
            add_game_record(user.id, result, player_score, dealer_final_score, bet_amount)
            if result != 'draw':
                update_rankings_db(user.id, bet_amount * (2.5 if result == 'win' else 0))

        return jsonify(response_data)
        
    except GameError as e:
        return jsonify({'error': str(e)}), 401
    except Exception as e:
        logger.error(f"Error starting game: {e}")
        return jsonify({'error': '游戏启动失败'}), 500

@app.route('/api/game/hit', methods=['POST'])
def hit():
    """Player hits (takes another card)."""
    try:
        user = get_current_user()
        game_session = get_current_game_session()

        if not game_session.deck:
            return jsonify({'error': '牌堆为空，无法要牌'}), 400

        # Create new deck list and deal new card
        new_deck = list(game_session.deck)
        new_card = new_deck.pop()
        
        # Create new list to ensure SQLAlchemy detects the change
        new_player_hand = list(game_session.player_hand)
        new_player_hand.append(new_card)
        
        game_session.deck = new_deck
        game_session.player_hand = new_player_hand
        game_session.player_score = game_logic.calculate_score(game_session.player_hand)

        # Check for player bust
        if game_session.player_score > 21:
            update_game_session(game_session, game_over=True)
            balance = handle_game_end(game_session, 'lose')
            
            return jsonify({
                'player_hand': game_session.player_hand,
                'dealer_hand': game_session.dealer_hand,
                'player_score': game_session.player_score,
                'dealer_score': game_session.dealer_score,
                'current_bet': game_session.current_bet,
                'balance': balance,
                'game_over': True,
                'result': 'lose'
            })

        # Dealer takes one action if should hit
        if game_logic.dealer_should_hit(game_session.dealer_hand, game_session.player_score):
            if game_session.deck:
                # Create new deck list for dealer card
                new_deck = list(game_session.deck)
                dealer_new_card = new_deck.pop()
                
                # Create new list for dealer hand too
                new_dealer_hand = list(game_session.dealer_hand)
                new_dealer_hand.append(dealer_new_card)
                
                game_session.deck = new_deck
                game_session.dealer_hand = new_dealer_hand
                game_session.dealer_score = game_logic.calculate_score(game_session.dealer_hand)
                
                # Check dealer bust
                if game_session.dealer_score > 21:
                    update_game_session(game_session, game_over=True)
                    balance = handle_game_end(game_session, 'win')
                    
                    return jsonify({
                        'player_hand': game_session.player_hand,
                        'dealer_hand': game_session.dealer_hand,
                        'player_score': game_session.player_score,
                        'dealer_score': game_session.dealer_score,
                        'current_bet': game_session.current_bet,
                        'balance': balance,
                        'game_over': True,
                        'result': 'win'
                    })

        # Update game state with the new hand and score data
        update_game_session(
            game_session,
            player_hand=game_session.player_hand,
            player_score=game_session.player_score,
            dealer_hand=game_session.dealer_hand,
            dealer_score=game_session.dealer_score,
            deck=game_session.deck
        )

        return jsonify({
            'player_hand': game_session.player_hand,
            'dealer_hand': game_session.dealer_hand,
            'player_score': game_session.player_score,
            'dealer_score': game_session.dealer_score,
            'current_bet': game_session.current_bet,
            'balance': user.balance,
            'game_over': False
        })
        
    except GameError as e:
        return jsonify({'error': str(e)}), 401
    except Exception as e:
        logger.error(f"Error in hit: {e}")
        return jsonify({'error': '操作失败'}), 500

@app.route('/api/game/stand', methods=['POST'])
def stand():
    """Player stands (dealer plays to completion)."""
    try:
        user = get_current_user()
        game_session = get_current_game_session()

        # Dealer plays to completion
        dealer_final_score = game_logic.dealer_ai_turn(
            game_session.deck, 
            game_session.dealer_hand, 
            game_session.player_score
        )
        
        # Determine result
        result = game_logic.determine_result(game_session.player_score, dealer_final_score)
        
        # Update game session
        update_game_session(
            game_session,
            dealer_score=dealer_final_score,
            game_over=True
        )
        
        # Handle payouts and records
        balance = handle_game_end(game_session, result)

        return jsonify({
            'player_hand': game_session.player_hand,
            'dealer_hand': game_session.dealer_hand,
            'player_score': game_session.player_score,
            'dealer_score': dealer_final_score,
            'result': result,
            'balance': balance,
            'current_bet': game_session.current_bet,
            'game_over': True
        })
        
    except GameError as e:
        return jsonify({'error': str(e)}), 401
    except Exception as e:
        logger.error(f"Error in stand: {e}")
        return jsonify({'error': '操作失败'}), 500

@app.route('/api/game/double_down', methods=['POST'])
def double_down():
    """Player doubles down (double bet, take one card, then stand)."""
    try:
        user = get_current_user()
        game_session = get_current_game_session()

        # Check if player can afford to double
        if user.balance < game_session.current_bet:
            return jsonify({'error': '余额不足以加倍'}), 400

        # Double the bet and deduct from balance
        user.balance -= game_session.current_bet
        game_session.current_bet *= 2

        if not game_session.deck:
            return jsonify({'error': '牌堆为空，无法要牌'}), 400

        # Create new deck list and deal one card
        new_deck = list(game_session.deck)
        new_card = new_deck.pop()
        
        # Create new list to ensure SQLAlchemy detects the change
        new_player_hand = list(game_session.player_hand)
        new_player_hand.append(new_card)
        
        game_session.deck = new_deck
        game_session.player_hand = new_player_hand
        game_session.player_score = game_logic.calculate_score(game_session.player_hand)

        # Check for player bust
        if game_session.player_score > 21:
            update_game_session(game_session, game_over=True)
            balance = handle_game_end(game_session, 'lose')
            
            return jsonify({
                'player_hand': game_session.player_hand,
                'dealer_hand': game_session.dealer_hand,
                'player_score': game_session.player_score,
                'dealer_score': game_session.dealer_score,
                'current_bet': game_session.current_bet,
                'balance': balance,
                'game_over': True,
                'result': 'lose',
                'new_card': new_card
            })

        # Dealer plays to completion
        dealer_final_score = game_logic.dealer_ai_turn(
            game_session.deck,
            game_session.dealer_hand,
            game_session.player_score
        )
        
        # Determine result
        result = game_logic.determine_result(game_session.player_score, dealer_final_score)
        
        # Update game session
        update_game_session(
            game_session,
            dealer_score=dealer_final_score,
            game_over=True
        )
        
        # Handle payouts and records
        balance = handle_game_end(game_session, result)

        return jsonify({
            'player_hand': game_session.player_hand,
            'dealer_hand': game_session.dealer_hand,
            'player_score': game_session.player_score,
            'dealer_score': dealer_final_score,
            'current_bet': game_session.current_bet,
            'balance': balance,
            'game_over': True,
            'result': result,
            'new_card': new_card
        })
        
    except GameError as e:
        return jsonify({'error': str(e)}), 401
    except Exception as e:
        logger.error(f"Error in double_down: {e}")
        return jsonify({'error': '操作失败'}), 500

@app.route('/api/user/status', methods=['GET'])
def get_user_status():
    """Get current user status."""
    try:
        user = get_current_user()
        return jsonify({
            'username': user.username,
            'balance': user.balance,
            'logged_in': True
        })
    except GameError as e:
        return jsonify({'error': str(e)}), 401
    except Exception as e:
        logger.error(f"Error getting user status: {e}")
        return jsonify({'error': '获取用户状态失败'}), 500

