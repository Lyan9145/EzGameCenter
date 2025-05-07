import pytest
from app import app # Assuming your Flask app instance is named 'app' in app.py

@pytest.fixture
def client():
    # Configure the app for testing
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'testing_secret_key' # Use a test secret key for session

    with app.test_client() as client:
        # You might need to set up a test database here if your app uses one
        # For now, we'll rely on the in-memory lists in app.py
        yield client

def test_start_game_unauthenticated(client):
    """Test starting a game without being logged in."""
    response = client.post('/api/game/start', json={'bet_amount': 100})
    assert response.status_code == 401
    assert 'error' in response.get_json()
    assert response.get_json()['error'] == '未登录'

# Note: Testing authenticated routes with sessions requires setting up the session
# This often involves simulating a login. For simplicity in this initial test,
# we might skip full authentication flow tests and focus on game logic assuming authentication passes.
# A more robust test setup would involve mocking authentication or using a test database.

# Basic test for starting a game (assuming a user is logged in - this requires session setup)
# This test will likely fail without proper session handling in the test client setup
# We'll add a placeholder and refine if needed.
# def test_start_game_authenticated(client):
#     # Simulate login and session setup here
#     # For example, if you have a login route:
#     # client.post('/login', data={'username': 'testuser', 'password': 'password'})
#     # Then proceed with the game start test

#     response = client.post('/api/game/start', json={'bet_amount': 100})
#     assert response.status_code == 200
#     data = response.get_json()
#     assert 'player_hand' in data
#     assert 'dealer_hand' in data
#     assert 'player_score' in data
#     assert 'dealer_score' in data
#     assert 'bet_amount' in data
#     assert 'deck' in data # Deck should be returned for frontend state management (though backend now manages state)
#     assert 'game_over' in data
#     assert data['game_over'] is False # Game should not be over immediately unless Blackjack

#     # Check if player got Blackjack
#     if data['player_score'] == 21:
#          assert data['game_over'] is True
#          assert 'result' in data # Should have a result if game is over

# Basic game flow test (requires session setup)
# def test_basic_game_flow(client):
#     # Simulate login
#     # client.post('/login', data={'username': 'testuser', 'password': 'password'})

#     # Start game
#     start_response = client.post('/api/game/start', json={'bet_amount': 100})
#     assert start_response.status_code == 200
#     start_data = start_response.get_json()

#     if not start_data['game_over']: # Only proceed if game didn't end on start (no Blackjack)
#         # Player hits
#         hit_response = client.post('/api/game/hit') # No data needed with session state
#         assert hit_response.status_code == 200
#         hit_data = hit_response.get_json()
#         assert 'player_hand' in hit_data
#         assert 'new_card' in hit_data
#         assert 'player_score' in hit_data
#         assert 'game_over' in hit_data
#         assert 'deck' in hit_data

#         if not hit_data['game_over']: # Only proceed if player didn't bust
#             # Player stands
#             stand_response = client.post('/api/game/stand') # No data needed with session state
#             assert stand_response.status_code == 200
#             stand_data = stand_response.get_json()
#             assert 'dealer_hand' in stand_data
#             assert 'player_score' in stand_data
#             assert 'dealer_score' in stand_data
#             assert 'result' in stand_data
#             assert 'game_over' in stand_data
#             assert stand_data['game_over'] is True

# Note: Full integration tests with session and database require more complex setup.
# The current tests are placeholders. We can implement proper session testing if needed.

# Example of how to test with session in Flask test client:
# with app.test_client() as client:
#     with client.session_transaction() as sess:
#         sess['username'] = 'testuser'
#     # Now make requests with the client, the session will be active

# Let's add a basic authenticated start game test using session_transaction
def test_start_game_authenticated(client):
    """Test starting a game while logged in."""
    with client.session_transaction() as sess:
        sess['username'] = 'testuser' # Simulate a logged-in user

    response = client.post('/api/game/start', json={'bet_amount': 100})
    assert response.status_code == 200
    data = response.get_json()
    assert 'player_hand' in data
    assert 'dealer_hand' in data
    assert 'player_score' in data
    # Note: dealer_score returned here is only the visible card score
    assert 'dealer_score' in data
    assert 'bet_amount' in data
    # Deck is no longer returned to frontend in start_game response
    # assert 'deck' in data
    assert 'game_over' in data
    # Game should not be over immediately unless Blackjack
    if data['player_score'] != 21:
         assert data['game_over'] is False
    else:
         assert data['game_over'] is True
         assert 'result' in data # Should have a result if game is over

# Add a basic hit test (requires game state in session)
def test_hit_authenticated(client):
    """Test hitting while logged in and game is active."""
    with client.session_transaction() as sess:
        sess['username'] = 'testuser'
        # Manually set up a game state in the session for testing
        sess['game_state'] = {
            'deck': game_logic.create_deck(), # Use a fresh deck
            'player_hand': [{'suit': 'hearts', 'value': '2'}, {'suit': 'diamonds', 'value': '3'}], # Score 5
            'dealer_hand': [{'suit': 'clubs', 'value': 'K'}, {'suit': 'spades', 'value': 'Q'}], # Score 20
            'player_score': 5,
            'dealer_score': 20,
            'current_bet': 100,
            'game_over': False
        }

    response = client.post('/api/game/hit')
    assert response.status_code == 200
    data = response.get_json()
    assert 'player_hand' in data
    assert len(data['player_hand']) == 3 # Player should have 3 cards after hitting
    assert 'new_card' in data
    assert 'player_score' in data
    assert data['player_score'] > 5 # Score should increase
    assert 'game_over' in data
    assert 'deck' in data # Deck should be returned (though backend manages state)
    # Check if game_over is True if player busted
    if data['player_score'] > 21:
        assert data['game_over'] is True
        assert 'result' in data # Should have a result if game is over

# Add a basic stand test (requires game state in session)
def test_stand_authenticated(client):
    """Test standing while logged in and game is active."""
    with client.session_transaction() as sess:
        sess['username'] = 'testuser'
        # Manually set up a game state in the session for testing
        sess['game_state'] = {
            'deck': game_logic.create_deck(), # Use a fresh deck
            'player_hand': [{'suit': 'hearts', 'value': '10'}, {'suit': 'diamonds', 'value': '8'}], # Score 18
            'dealer_hand': [{'suit': 'clubs', 'value': 'K'}, {'suit': 'spades', 'value': '2'}], # Score 12
            'player_score': 18,
            'dealer_score': 12,
            'current_bet': 100,
            'game_over': False
        }

    response = client.post('/api/game/stand')
    assert response.status_code == 200
    data = response.get_json()
    assert 'dealer_hand' in data # Full dealer hand should be returned
    assert 'player_score' in data # Player score should be the same
    assert 'dealer_score' in data # Final dealer score after AI turn
    assert 'result' in data # Game result
    assert 'game_over' in data
    assert data['game_over'] is True # Game should be over after standing
    assert 'deck' in data # Deck should be returned (though backend manages state)

# Test case for player Blackjack on start
def test_start_game_player_blackjack(client):
    """Test starting a game where the player gets Blackjack."""
    with client.session_transaction() as sess:
        sess['username'] = 'testuser'
        # Manually set up a deck that gives player Blackjack
        deck = game_logic.create_deck()
        # Ensure first two cards are Ace and 10/Face
        deck.remove({'suit': 'hearts', 'value': 'A'})
        deck.insert(0, {'suit': 'hearts', 'value': 'A'})
        deck.remove({'suit': 'spades', 'value': 'Q'})
        deck.insert(1, {'suit': 'spades', 'value': 'Q'})
        # Ensure dealer gets something reasonable
        deck.remove({'suit': 'clubs', 'value': '7'})
        deck.insert(2, {'suit': 'clubs', 'value': '7'})
        deck.remove({'suit': 'diamonds', 'value': '8'})
        deck.insert(3, {'suit': 'diamonds', 'value': '8'})

        sess['game_state'] = {
            'deck': deck,
            'player_hand': [], # Will be dealt by start_game
            'dealer_hand': [], # Will be dealt by start_game
            'player_score': 0,
            'dealer_score': 0,
            'current_bet': 100,
            'game_over': False
        }

    response = client.post('/api/game/start', json={'bet_amount': 100})
    assert response.status_code == 200
    data = response.get_json()

    assert 'player_hand' in data
    assert game_logic.calculate_score(data['player_hand']) == 21 # Player should have Blackjack
    assert 'game_over' in data
    assert data['game_over'] is True # Game should be over
    assert 'result' in data # Should have a result
    assert data['result'] in ['win', 'draw'] # Player Blackjack is usually win or push vs dealer Blackjack
    assert 'dealer_hand' in data # Full dealer hand should be revealed
    assert 'dealer_score' in data # Final dealer score should be shown

# Test case for player bust after hitting
def test_hit_player_busts(client):
    """Test hitting where the player busts."""
    with client.session_transaction() as sess:
        sess['username'] = 'testuser'
        # Manually set up a deck and player hand that will bust on hit
        deck = game_logic.create_deck()
        # Ensure the next card drawn causes a bust
        deck.remove({'suit': 'hearts', 'value': '10'})
        deck.insert(0, {'suit': 'hearts', 'value': '10'}) # Card to be drawn

        sess['game_state'] = {
            'deck': deck,
            'player_hand': [{'suit': 'clubs', 'value': '10'}, {'suit': 'spades', 'value': '2'}], # Score 12
            'dealer_hand': [{'suit': 'diamonds', 'value': 'K'}, {'suit': 'clubs', 'value': '3'}],
            'player_score': 12,
            'dealer_score': 13,
            'current_bet': 100,
            'game_over': False
        }

    response = client.post('/api/game/hit')
    assert response.status_code == 200
    data = response.get_json()

    assert 'player_hand' in data
    assert game_logic.calculate_score(data['player_hand']) > 21 # Player should have busted
    assert 'game_over' in data
    assert data['game_over'] is True # Game should be over
    assert 'result' in data # Should have a result
    assert data['result'] == 'lose' # Player bust is a loss
    # Dealer hand and score might not be fully revealed in hit response, depending on frontend logic
    # But the backend state should be updated.
    # assert 'dealer_hand' in data # Dealer hand might not be in hit response
    # assert 'dealer_score' in data # Dealer score might not be in hit response

# Test case for dealer bust after player stands
def test_stand_dealer_busts(client):
    """Test standing where the dealer busts."""
    with client.session_transaction() as sess:
        sess['username'] = 'testuser'
        # Manually set up a deck and dealer hand that will cause dealer to bust
        deck = game_logic.create_deck()
        # Ensure cards drawn cause dealer to bust (e.g., dealer has 16, next card is 6)
        deck.remove({'suit': 'hearts', 'value': '6'})
        deck.insert(0, {'suit': 'hearts', 'value': '6'}) # Card to be drawn

        sess['game_state'] = {
            'deck': deck,
            'player_hand': [{'suit': 'clubs', 'value': '10'}, {'suit': 'spades', 'value': '8'}], # Score 18
            'dealer_hand': [{'suit': 'diamonds', 'value': '10'}, {'suit': 'clubs', 'value': '6'}], # Score 16
            'player_score': 18,
            'dealer_score': 16,
            'current_bet': 100,
            'game_over': False
        }

    response = client.post('/api/game/stand')
    assert response.status_code == 200
    data = response.get_json()

    assert 'dealer_hand' in data # Full dealer hand should be revealed
    assert game_logic.calculate_score(data['dealer_hand']) > 21 # Dealer should have busted
    assert 'dealer_score' in data
    assert data['dealer_score'] > 21 # Dealer score should be over 21
    assert 'game_over' in data
    assert data['game_over'] is True # Game should be over
    assert 'result' in data # Should have a result
    assert data['result'] == 'win' # Dealer bust is a player win

# Test case for player win (dealer stands on 17+)
def test_stand_player_wins(client):
    """Test standing where player has higher score than dealer (dealer stands)."""
    with client.session_transaction() as sess:
        sess['username'] = 'testuser'
        # Manually set up game state where player wins
        sess['game_state'] = {
            'deck': game_logic.create_deck(), # Deck doesn't matter much here if dealer stands
            'player_hand': [{'suit': 'clubs', 'value': '10'}, {'suit': 'spades', 'value': '9'}], # Score 19
            'dealer_hand': [{'suit': 'diamonds', 'value': '10'}, {'suit': 'clubs', 'value': '7'}], # Score 17
            'player_score': 19,
            'dealer_score': 17,
            'current_bet': 100,
            'game_over': False
        }

    response = client.post('/api/game/stand')
    assert response.status_code == 200
    data = response.get_json()

    assert 'result' in data
    assert data['result'] == 'win'
    assert 'game_over' in data
    assert data['game_over'] is True

# Test case for player lose (dealer has higher score)
def test_stand_player_loses(client):
    """Test standing where dealer has higher score than player."""
    with client.session_transaction() as sess:
        sess['username'] = 'testuser'
        # Manually set up game state where player loses
        sess['game_state'] = {
            'deck': game_logic.create_deck(), # Deck doesn't matter much here if dealer stands
            'player_hand': [{'suit': 'clubs', 'value': '10'}, {'suit': 'spades', 'value': '7'}], # Score 17
            'dealer_hand': [{'suit': 'diamonds', 'value': '10'}, {'suit': 'clubs', 'value': '9'}], # Score 19
            'player_score': 17,
            'dealer_score': 19,
            'current_bet': 100,
            'game_over': False
        }

    response = client.post('/api/game/stand')
    assert response.status_code == 200
    data = response.get_json()

    assert 'result' in data
    assert data['result'] == 'lose'
    assert 'game_over' in data
    assert data['game_over'] is True

# Test case for draw
def test_stand_draw(client):
    """Test standing where player and dealer have the same score."""
    with client.session_transaction() as sess:
        sess['username'] = 'testuser'
        # Manually set up game state for a draw
        sess['game_state'] = {
            'deck': game_logic.create_deck(), # Deck doesn't matter much here if dealer stands
            'player_hand': [{'suit': 'clubs', 'value': '10'}, {'suit': 'spades', 'value': '8'}], # Score 18
            'dealer_hand': [{'suit': 'diamonds', 'value': '10'}, {'suit': 'clubs', 'value': '8'}], # Score 18
            'player_score': 18,
            'dealer_score': 18,
            'current_bet': 100,
            'game_over': False
        }

    response = client.post('/api/game/stand')
    assert response.status_code == 200
    data = response.get_json()

    assert 'result' in data
    assert data['result'] == 'draw'
    assert 'game_over' in data
    assert data['game_over'] is True

# Note: More tests are needed for edge cases, double down (once implemented),
# user registration/login (requires database setup), rankings, etc.
# This is a good starting point for integration tests.
