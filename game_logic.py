import random

def create_deck():
    suits = ['hearts', 'diamonds', 'clubs', 'spades']
    values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
    return [{'suit': suit, 'value': value} for suit in suits for value in values]

def shuffle_deck(deck):
    random.shuffle(deck)

def deal_cards(deck, num_cards=2):
    return [deck.pop() for _ in range(num_cards)]

def calculate_score(hand):
    score = 0
    aces = 0
    
    for card in hand:
        if card['value'] == 'A':
            aces += 1
            score += 11
        elif card['value'] in ['K', 'Q', 'J']:
            score += 10
        else:
            score += int(card['value'])
    
    while score > 21 and aces > 0:
        score -= 10
        aces -= 1
    
    return score

def determine_result(player_score, dealer_score):
    if player_score > 21:
        return 'lose'
    if dealer_score > 21:
        return 'win'
    if player_score > dealer_score:
        return 'win'
    if player_score == dealer_score:
        return 'draw'
    return 'lose'

def calculate_bust_risk(hand):
    """Calculates the risk of busting (going over 21) with the current hand."""
    current_total = calculate_score(hand)
    risky_cards = 0

    # Count Aces that can be 11 without busting
    ace_count = 0
    for card in hand:
        if card['value'] == 'A':
            ace_count += 1

    # Check for cards that would cause a bust
    for card_value in range(2, 12): # Values 2-10, J, Q, K (10), A (11)
        # Special handling for Ace if it can be 11 without busting
        if card_value == 11 and ace_count > 0 and current_total + 11 <= 21:
            continue
        
        # If current total + card value > 21, it's a risky card
        if current_total + card_value > 21:
            risky_cards += 1

    # If current total + the smallest possible value (2) busts, all remaining cards are risky
    if current_total + 2 > 21:
        return 1.00  # 100% risk

    # Assuming a standard deck and considering only values 2-11
    # There are 10 possible values (2-10, J/Q/K as 10, A as 11)
    total_possible_values = 10.0
    return risky_cards / total_possible_values

def is_soft_hand(hand):
    """Checks if the hand is a soft hand (contains an Ace that can be counted as 11)."""
    score = 0
    has_ace = False
    
    for card in hand:
        if card['value'] == 'A':
            has_ace = True
            score += 11
        elif card['value'] in ['K', 'Q', 'J']:
            score += 10
        else:
            score += int(card['value'])
    
    # A hand is soft if it contains an Ace and the score is 21 or less when counting the Ace as 11
    return has_ace and score <= 21 and calculate_score(hand) != score

def dealer_should_hit(dealer_hand, player_score):
    """Decides if the dealer should hit based on the AI logic."""
    dealer_total = calculate_score(dealer_hand)
    bust_risk = calculate_bust_risk(dealer_hand)
    is_soft = is_soft_hand(dealer_hand)

    # Debugging output (optional, can be removed later)
    print(f"[DEBUG] Dealer AI thinking:")
    print(f"  - Dealer Total: {dealer_total}")
    print(f"  - Player Score: {player_score}")
    print(f"  - Bust Risk: {bust_risk:.2f}")
    print(f"  - Is Soft Hand: {is_soft}")

    if dealer_total >= 17:
        print("  - Decision: Stand (>= 17)")
        return False

    # If dealer has a soft 17, hit
    if is_soft and dealer_total == 17:
        print("  - Decision: Hit (Soft 17)")
        return True

    # If dealer total is less than player score and bust risk is low, hit
    if dealer_total < player_score and bust_risk < 0.5:
         print("  - Decision: Hit (Less than player and low risk)")
         return True

    # If dealer total is less than 17, hit (standard rule)
    if dealer_total < 17:
        print("  - Decision: Hit (< 17)")
        return True

    # Default to stand if no other condition is met
    print("  - Decision: Stand (Default)")
    return False


def dealer_ai_turn(deck, dealer_hand, player_score):
    """Manages the dealer's turn using the AI logic."""
    while dealer_should_hit(dealer_hand, player_score):
        print("[DEBUG] Dealer hits...")
        new_card = deck.pop()
        dealer_hand.append(new_card)
        dealer_score = calculate_score(dealer_hand)
        print(f"[DEBUG] Dealer hand: {dealer_hand}, Score: {dealer_score}")
        if dealer_score > 21:
            print("[DEBUG] Dealer busted.")
            break # Dealer busts

    return calculate_score(dealer_hand)
