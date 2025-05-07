import pytest
import game_logic

def test_create_deck():
    deck = game_logic.create_deck()
    assert len(deck) == 52
    # Check for unique cards (basic check)
    assert len(set(str(card) for card in deck)) == 52

def test_shuffle_deck():
    deck1 = game_logic.create_deck()
    deck2 = game_logic.create_deck()
    # Shuffling should change the order
    game_logic.shuffle_deck(deck1)
    # This is a probabilistic test, might fail rarely
    assert deck1 != deck2

@pytest.mark.parametrize("hand, expected_score", [
    ([{'suit': 'hearts', 'value': '2'}, {'suit': 'diamonds', 'value': '3'}], 5),
    ([{'suit': 'clubs', 'value': 'K'}, {'suit': 'spades', 'value': 'Q'}], 20),
    ([{'suit': 'hearts', 'value': 'A'}, {'suit': 'diamonds', 'value': '10'}], 21), # Blackjack
    ([{'suit': 'clubs', 'value': 'A'}, {'suit': 'spades', 'value': 'A'}, {'suit': 'hearts', 'value': 'A'}], 13), # Three Aces
    ([{'suit': 'hearts', 'value': 'A'}, {'suit': 'diamonds', 'value': '5'}, {'suit': 'clubs', 'value': 'A'}], 17), # Soft hand
    ([{'suit': 'spades', 'value': '10'}, {'suit': 'clubs', 'value': 'J'}, {'suit': 'hearts', 'value': '2'}], 22), # Bust
    ([{'suit': 'diamonds', 'value': 'A'}, {'suit': 'hearts', 'value': 'A'}], 12), # Two Aces
    ([{'suit': 'clubs', 'value': '7'}, {'suit': 'spades', 'value': '8'}], 15),
])
def test_calculate_score(hand, expected_score):
    assert game_logic.calculate_score(hand) == expected_score

@pytest.mark.parametrize("player_score, dealer_score, expected_result", [
    (21, 20, 'win'),
    (20, 21, 'lose'),
    (22, 18, 'lose'), # Player busts
    (18, 22, 'win'), # Dealer busts
    (19, 19, 'draw'),
    (17, 18, 'lose'),
    (18, 17, 'win'),
    (21, 21, 'draw'), # Both Blackjack
])
def test_determine_result(player_score, dealer_score, expected_result):
    assert game_logic.determine_result(player_score, dealer_score) == expected_result

# Basic tests for dealer AI logic - more comprehensive tests might involve mocking the deck
def test_dealer_should_hit_under_17():
    dealer_hand = [{'suit': 'hearts', 'value': '10'}, {'suit': 'diamonds', 'value': '6'}] # Score 16
    player_score = 20
    assert game_logic.dealer_should_hit(dealer_hand, player_score) is True

def test_dealer_should_stand_on_17_or_more():
    dealer_hand = [{'suit': 'hearts', 'value': '10'}, {'suit': 'diamonds', 'value': '7'}] # Score 17
    player_score = 20
    assert game_logic.dealer_should_hit(dealer_hand, player_score) is False

def test_dealer_should_hit_soft_17():
    dealer_hand = [{'suit': 'hearts', 'value': 'A'}, {'suit': 'diamonds', 'value': '6'}] # Score 17 (soft)
    player_score = 20
    # Assuming AI hits soft 17
    assert game_logic.dealer_should_hit(dealer_hand, player_score) is True

def test_dealer_should_stand_on_hard_17():
    dealer_hand = [{'suit': 'hearts', 'value': '10'}, {'suit': 'diamonds', 'value': '7'}] # Score 17 (hard)
    player_score = 20
    assert game_logic.dealer_should_hit(dealer_hand, player_score) is False

# Note: More complex dealer_ai_turn tests would require mocking the deck to control card drawing.
# This is a starting point for unit tests.
