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

// 游戏状态追踪
let gameActive = false;


// 开始新游戏
async function startGame() {
    console.log('Starting game with bet:', elements.betAmountInput.value);
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
        gameActive = true; // 设置游戏为活跃状态
        updateGameUI(response);

        // If player got Blackjack, game is over immediately
        if (response.game_over) {
            showGameResult(response.result);
            gameActive = false; // 游戏结束
            unlockBetControls();
        }
    } else {
        console.log('Failed to start game');
        unlockBetControls(); // Unlock if game start failed
    }
}

// 玩家要牌
async function hit() {
    if (!gameActive) {
        showToast('请先开始游戏', 'warning');
        return;
    }
    
    console.log('Player hits');

    const response = await apiRequest('/api/game/hit', 'POST');

    if (response) {
        console.log('Hit response:', response);
        updateGameUI(response);

        if (response.game_over) {
            showGameResult(response.result);
            gameActive = false; // 游戏结束
            unlockBetControls();
        }
    } else { 
        console.log('Failed to hit');
    }
}

// 玩家停牌
async function stand() {
    if (!gameActive) {
        showToast('请先开始游戏', 'warning');
        return;
    }
    
    console.log('Player stands');

    const response = await apiRequest('/api/game/stand', 'POST');

    if (response) {
        console.log('Stand response:', response);
        updateGameUI(response);
        showGameResult(response.result);
        gameActive = false; // 游戏结束
        unlockBetControls();
    } else {
        console.log('Failed to stand');
    }
}

// 加倍下注 (暂时移除，待后端支持后再添加)
// function doubleDown() { ... }


// 更新游戏UI
function updateGameUI(data) {
    // Clear card areas
    elements.dealerCards.innerHTML = '';
    elements.playerCards.innerHTML = '';

    const isGameOver = data.game_over || false;

    // Display dealer cards
    const dealerHand = data.dealer_hand || [];
    dealerHand.forEach((card) => {
        elements.dealerCards.appendChild(createCardElement(card));
    });

    // Display player cards
    const playerHand = data.player_hand || [];
    playerHand.forEach(card => {
        elements.playerCards.appendChild(createCardElement(card));
    });

    // Update scores
    elements.playerScore.textContent = `点数: ${data.player_score || 0}`;

    if (isGameOver) {
        elements.dealerScore.textContent = `点数: ${data.dealer_score !== undefined ? data.dealer_score : '?'}`;
    } else {
        // Only show dealer's visible card score if game is not over
        elements.dealerScore.textContent = `点数: ?`;
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
function createCardElement(card) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    
    const suitSymbol = getSuitSymbol(card.suit);
    cardEl.innerHTML = `<div class="card-value">${card.value}</div>
                        <div class="card-suit">${suitSymbol}</div>`;

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
    let type = 'info';
    switch (result) {
        case 'win':
            message = '恭喜你赢了！';
            type = 'success';
            break;
        case 'lose':
            message = '很遗憾你输了';
            type = 'error';
            break;
        case 'draw':
            message = '平局';
            type = 'info';
            break;
    }
    
    if (message) {
        // 显示动画背景效果
        animatePlayerAreaResult(result);
        setTimeout(() => showToast(message, type), 500);
    }
}

// 动画显示游戏结果背景效果
function animatePlayerAreaResult(result) {
    const playerArea = document.querySelector('.player-area');
    if (!playerArea) return;

    // 添加结果类和动画类
    playerArea.classList.add(`result-${result}`, 'animating');

    // 移除动画类（遮罩动画完成）
    setTimeout(() => {
        playerArea.classList.remove('animating');
    }, 800);

    // 3秒后恢复原背景色，再次使用遮罩动画
    setTimeout(() => {
        playerArea.classList.add('animating');
        
        // 在遮罩动画进行中移除结果类
        setTimeout(() => {
            playerArea.classList.remove(`result-${result}`);
            playerArea.classList.remove('animating');
        }, 800);
    }, 3000);
}


// 下注
function placeBet(amount) {
    if (isNaN(amount) || amount <= 0) {
        showToast('请输入有效的下注金额', 'warning');
        return;
    }
    
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
    if (elements.betAmountInput) elements.betAmountInput.disabled = true;
    if (elements.betSubmitBtn) elements.betSubmitBtn.disabled = true;
    if (elements.betBtns) {
        elements.betBtns.forEach(btn => {
            btn.disabled = true;
        });
    }
}

function unlockBetControls() {
;    if (elements.betAmountInput) elements.betAmountInput.disabled = false;
    if (elements.betSubmitBtn) elements.betSubmitBtn.disabled = false;
    if (elements.betBtns) {
        elements.betBtns.forEach(btn => {
            btn.disabled = false;
        });
    }
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

// 获取用户信息
async function fetchUserInfo() {
    const response = await apiRequest('/api/user/info', 'GET', null, false);

    if (response === null) {
        console.log('Failed to fetch user info');
        return; // 如果获取用户信息失败，直接返回
    }
    updateUserInfo(response);
    return response;
}


// 更新用户信息显示
function updateUserInfo(userInfo) {
    // 更新余额显示
    if (userInfo.balance !== undefined) {
        elements.balance.textContent = userInfo.balance;
        // 根据新余额更新推荐下注金额
        recommendBets(userInfo.balance);
    }
    
    // 如果有其他用户信息，也可以在这里更新
    // 例如用户名、等级等
    if (userInfo.username) {
        console.log('Current user:', userInfo.username);
    }
}

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
    recommendBets(1000); // 初始推荐下注金额
    // 页面加载时获取用户信息
    fetchUserInfo();
    
    // 为要牌按钮添加监听器
    const hitBtn = document.getElementById('hit-btn');
    if (hitBtn) hitBtn.addEventListener('click', hit);
    
    // 为停牌按钮添加监听器
    const standBtn = document.getElementById('stand-btn');
    if (standBtn) standBtn.addEventListener('click', stand);
    
    // 为开始游戏按钮添加监听器
    const betBtn = document.getElementById('bet-btn');
    if (betBtn) betBtn.addEventListener('click', function(event){
        placeBet(elements.betAmountInput.value);
    });
    
    // 为推荐下注按钮添加监听器
    const betButtons = document.querySelectorAll('.bet-btn');
    betButtons.forEach(button => {
        button.addEventListener('click', function() {
            const amount = this.getAttribute('data-amount');
            const betAmountInput = document.getElementById('bet-amount');
            if (betAmountInput) betAmountInput.value = amount;
            placeBet(amount);
        });
    });

    unlockBetControls();
});


