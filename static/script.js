// DOM元素
const elements = {
    dealerCards: document.getElementById('dealer-cards'),
    playerCards: document.getElementById('player-cards'),
    dealerScore: document.getElementById('dealer-score'),
    playerScore: document.getElementById('player-score'),
    balance: document.getElementById('balance'),
    currentBet: document.getElementById('current-bet'),
    hitBtn: document.getElementById('hit-btn'),
    standBtn: document.getElementById('stand-btn'),
    betAmountInput: document.getElementById('bet-amount'),
    betSubmitBtn: document.getElementById('bet-submit-btn'),
    betBtns: document.querySelectorAll('.bet-btn')
};

// 初始化下注推荐 (初始余额可以从后端获取或硬编码一个初始值)
// For now, let's hardcode an initial balance for recommendation display
recommendBets(1000);

// API请求封装
async function apiRequest(url, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('API请求错误:', error);
        showToast('游戏服务器连接失败，请刷新页面重试', 'error');
        return null;
    }
}

// 显示动态弹窗
function showToast(message, type = 'info') {
    let backgroundColor = '#333'; // Default background color

    switch (type) {
        case 'success':
            backgroundColor = '#28a745'; // Green
            break;
        case 'error':
            backgroundColor = '#dc3545'; // Red
            break;
        case 'warning':
            backgroundColor = '#ffc107'; // Yellow
            break;
        case 'info':
        default:
            backgroundColor = '#17a2b8'; // Blue
            break;
    }

    Toastify({
        text: message,
        duration: 3000, // 3 seconds
        newWindow: true,
        close: true,
        gravity: "top", // `top` or `bottom`
        position: "right", // `left`, `center` or `right`
        stopOnFocus: true, // Prevents dismissing of toast on hover
        style: {
            background: backgroundColor,
        },
        onClick: function(){} // Callback after click
    }).showToast();
}

// 开始新游戏
async function startGame() {
    console.log('Starting game with bet:', elements.betAmountInput.value); // Use input value directly
    const betAmount = parseInt(elements.betAmountInput.value);
    if (isNaN(betAmount) || betAmount <= 0) {
        showToast('请输入有效的下注金额', 'warning');
        return;
    }

    // Lock bet controls while game is active
    lockBetControls();

    const response = await apiRequest('/api/game/start', 'POST', {
        bet_amount: betAmount
    });

    if (response) {
        console.log('Game started:', response);
        updateGameUI(response);

        // If player got Blackjack, game is over immediately
        if (response.game_over) {
            showGameResult(response.result);
            unlockBetControls();
        }
    } else {
        console.log('Failed to start game');
        unlockBetControls(); // Unlock if game start failed
    }
}

// 玩家要牌
async function hit() {
    console.log('Player hits');

    const response = await apiRequest('/api/game/hit', 'POST'); // No need to send deck or hand

    if (response) {
        console.log('Hit response:', response);
        updateGameUI(response);

        if (response.game_over) {
            showGameResult(response.result);
            unlockBetControls();
        }
    } else {
        console.log('Failed to hit');
    }
}

// 玩家停牌
async function stand() {
    console.log('Player stands');

    const response = await apiRequest('/api/game/stand', 'POST'); // No need to send game state

    if (response) {
        console.log('Stand response:', response);
        updateGameUI(response);
        showGameResult(response.result);
        unlockBetControls();
    } else {
        console.log('Failed to stand');
    }
}

// 加倍下注 (暂时移除，待后端支持后再添加)
// async function doubleDown() { ... }


// 更新游戏UI
function updateGameUI(data) {
    // Clear card areas
    elements.dealerCards.innerHTML = '';
    elements.playerCards.innerHTML = '';

    const isGameOver = data.game_over || false;

    // Display dealer cards
    const dealerHand = data.dealer_hand || [];
    dealerHand.forEach((card, index) => {
        const isHidden = index === 0 && !isGameOver;
        elements.dealerCards.appendChild(createCardElement(card, isHidden));
    });

    // Display player cards
    const playerHand = data.player_hand || [];
    playerHand.forEach(card => {
        elements.playerCards.appendChild(createCardElement(card, false));
    });

    // Update scores
    elements.playerScore.textContent = `点数: ${data.player_score || 0}`;

    if (isGameOver) {
        elements.dealerScore.textContent = `点数: ${data.dealer_score !== undefined ? data.dealer_score : '?'}`;
    } else {
        // Only show dealer's visible card score if game is not over
        const dealerVisibleCard = dealerHand.length > 0 ? [dealerHand[0]] : [];
        elements.dealerScore.textContent = `点数: ${dealerVisibleCard.length > 0 ? calculateScore(dealerVisibleCard) : '?'}`;
    }

    // Update balance and current bet display
    elements.balance.textContent = data.balance !== undefined ? data.balance : elements.balance.textContent;
    elements.currentBet.textContent = data.current_bet !== undefined ? data.current_bet : elements.currentBet.textContent;

    // Update recommended bets based on new balance
    recommendBets(data.balance !== undefined ? data.balance : parseInt(elements.balance.textContent));

    // Enable/disable hit/stand buttons based on game state
    if (isGameOver) {
        elements.hitBtn.disabled = true;
        elements.standBtn.disabled = true;
    } else {
        elements.hitBtn.disabled = false;
        elements.standBtn.disabled = false;
    }
}

// Helper function to calculate score on the frontend for displaying dealer's visible card score
function calculateScore(hand) {
    let score = 0;
    let aces = 0;

    for (const card of hand) {
        if (card.value === 'A') {
            aces += 1;
            score += 11;
        } else if (['K', 'Q', 'J'].includes(card.value)) {
            score += 10;
        } else {
            score += parseInt(card.value);
        }
    }

    while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
    }

    return score;
}

// 创建牌元素
function createCardElement(card, isHidden) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    
    if (isHidden) {
        cardEl.className += ' hidden';
        cardEl.innerHTML = '🂠';
    } else {
        const suitSymbol = getSuitSymbol(card.suit);
        cardEl.innerHTML = `<div class="card-value">${card.value}</div>
                          <div class="card-suit">${suitSymbol}</div>`;
    }
    
    return cardEl;
}

// 获取花色符号
function getSuitSymbol(suit) {
    const symbols = {
        hearts: '♥',
        diamonds: '♦',
        clubs: '♣',
        spades: '♠'
    };
    return symbols[suit] || '';
}

// 显示游戏结果
function showGameResult(result) {
    let message = '';
    switch (result) {
        case 'win':
            message = '恭喜你赢了！';
            break;
        case 'lose':
            message = '很遗憾你输了';
            break;
        case 'draw':
            message = '平局';
            break;
    }
    
    if (message) {
        setTimeout(() => showToast(message, 'success'), 500); // Assuming game result is a success message
    }
}

// 下注
function placeBet(amount) {
    // Get current balance from UI (updated by updateGameUI)
    const currentBalance = parseInt(elements.balance.textContent);
    // Check if player has enough balance - backend will also validate
    if (currentBalance >= amount) {
        // Call startGame with the bet amount from the input field
        startGame();
    } else {
        showToast('余额不足', 'warning');
    }
}

function lockBetControls() {
    elements.betAmountInput.disabled = true;
    elements.betSubmitBtn.disabled = true;
    elements.betBtns.forEach(btn => {
        btn.disabled = true;
    });
}

function unlockBetControls() {
    elements.betAmountInput.disabled = false;
    elements.betSubmitBtn.disabled = false;
    elements.betBtns.forEach(btn => {
        btn.disabled = false;
    });
}

function recommendBets(balance) {
    const recommendedBets = [Math.floor(balance / 10), Math.floor(balance / 5), Math.floor(balance / 2)];
    elements.betBtns.forEach((btn, index) => {
        // Only update the bet amount buttons, not the double down button (which was removed)
        if (index < recommendedBets.length) {
             btn.textContent = `$${recommendedBets[index]}`;
             btn.dataset.amount = recommendedBets[index];
        }
    });
}

// Event listeners
elements.betSubmitBtn.addEventListener('click', () => {
    const betAmount = parseInt(elements.betAmountInput.value);
    if (!isNaN(betAmount) && betAmount > 0) {
        // placeBet now just calls startGame with the input value
        startGame();
    } else {
        showToast('请输入有效的下注金额', 'warning');
    }
});

elements.betBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const betAmount = btn.dataset.amount;
        // Since doubleDown is removed, all bet buttons trigger placeBet
        // Ensure the bet amount is valid before calling placeBet/startGame
        const parsedBetAmount = parseInt(betAmount);
        if (!isNaN(parsedBetAmount) && parsedBetAmount > 0) {
             // Set the input value and then call startGame
             elements.betAmountInput.value = parsedBetAmount;
             startGame();
        } else {
             showToast('无效的下注金额', 'warning');
        }
    });
});


// Event listeners for game actions
elements.hitBtn.addEventListener('click', hit);
elements.standBtn.addEventListener('click', stand);

// Initial UI update (can fetch initial state from backend if needed)
// For now, rely on the first bet to trigger game start and UI update.
// A better approach would be to fetch initial user balance and rankings on page load.
// For now, let's just ensure bet controls are unlocked initially.
unlockBetControls();
