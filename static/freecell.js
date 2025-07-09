const droppable_hint_style = "ring-2 ring-green-400 hover:ring-4 hover:ring-green-500";
let droppable_hint_enabled = true;
var gamemode = 'random'; // Default game mode

/**
 * Encapsulate the game
 */
var Game = function () {
    // the empty slots for moving cards
    this.free = [null, null, null, null];
    // the spaces to hold the completed suits
    this.suits = [null, null, null, null];
    // the columns of cards
    this.columns = [[], [], [], [], [], [], [], []];
    // the deck of cards
    this.deck = new this.Deck();
    // *** The history of moves for the undo function
    this.history = [];
};

/**
 * Initialise the game object.
 */
Game.prototype.init = function () {
    var card;

    // shuffle the deck
    this.deck.shuffle();

    for (var i = 0; i < 52; i++) {
        // add the cards to the columns
        card = this.deck.cards[i];
        this.columns[i % 8].push(card);
    }
};

/**
 * Reset the game
 */
Game.prototype.reset = function () {
    var i, col;

    this.free = [null, null, null, null];
    this.suits = [null, null, null, null];
    this.history = [];

    for (i = 0; i < 8; i++) {
        col = this.columns[i];
        col.length = 0;
    }

    this.init();
};

// 检查是否为有效
// 规则：每张牌下面的牌是否与其花色相反，数值是否比其小1，
// 从每列顶部开始向下检查，如果从某张牌开始直到本列最后一张牌都符合，则构成有效牌堆
// 如果card_id为有效牌堆中的牌，返回true
Game.prototype.valid_stack = function (card_id) {
    var i, col, card;

    for (i = 0; i < 8; i++) {
        col = this.columns[i];
        if (col.length > 0 && col[col.length - 1].id === card_id) {
            // Check the stack below this card
            for (var j = col.length - 2; j >= 0; j--) {
                card = col[j];
                if (card.suit === col[col.length - 1].suit || card.value !== col[col.length - 1].value - 1) {
                    return false;
                }
            }
            return true;
        }
    }
    return false;
};  

/**
 * Create an array of ids of the valid draggable cards.
 */
Game.prototype.valid_drag_ids = function () {
    var drag_ids, i, card, col, col_len;

    drag_ids = [];

    // add cards in freecell spaces
    for (i = 0; i < 4; i++) {
        card = this.free[i];
        if (card !== null) {
            drag_ids.push(card.id.toString());
        }
    }
    // add cards at the bottom of columns
    // 以及合法牌堆中的牌
    for (i = 0; i < 8; i++) {
        col = this.columns[i];
        col_len = col.length;
        if (col_len > 0) {
            card = col[col_len - 1];
            drag_ids.push(card.id.toString());
        }
        // add valid stack cards
        for (var j = 0; j < col.length; j++) {
            if (this.valid_stack(col[j].id)) {
                drag_ids.push(col[j].id.toString());
            }
        }
    }

    return drag_ids;
};

/**
 * 核心算法，判断一张牌是否可以放置到指定位置，返回一个列表
 * free、suit、col
 * 修改了valid_drop_ids函数，添加了对空列的检查
 */
Game.prototype.valid_drop_ids = function (card_id) {
    var drop_ids, i, free, suit_card, drag_card, card, col;

    drop_ids = [];

    // 当前卡牌
    drag_card = this.deck.get_card(card_id);

    // freecells
    // 空的free
    for (i = 0; i < 4; i++) {
        free = this.free[i];
        if (free === null) {
            drop_ids.push('free' + i.toString());
        }
    }

    // suitcell
    // 空的suit（A）或符合值的suit
    for (i = 0; i < 4; i++) {
        suit_card = this.suits[i];
        if (suit_card === null) {
            if (drag_card.value === 1) {
                drop_ids.push('suit' + i.toString());
            }
        } else {
            if ((drag_card.suit === suit_card.suit) &&
                (drag_card.value === suit_card.value + 1)) {
                drop_ids.push('suit' + i.toString());
            }
        }
    }

    // col
    // 遍历所有8个列来决定是否可以作为放置点
    for (i = 0; i < 8; i++) {
        col = this.columns[i];
        if (col.length === 0) {
            // 如果列是空的，可以直接放置
            drop_ids.push('col' + i.toString());
        } else {
            // 如果列不为空，检查最下面一张牌
            card = col[col.length - 1];
            if ((card.value === drag_card.value + 1) &&
                (card.colour !== drag_card.colour)) {
                // 如果规则匹配，将列的ID作为有效的放置点
                drop_ids.push('col' + i.toString());
            }
        }
    }

    return drop_ids;
};

/*
 * Return an array of the cards that are at the bottom of columns
 */
Game.prototype.col_bottom_cards = function () {
    var i, col, card_count, bottom_cards;

    bottom_cards = [];

    for (i = 0; i < 8; i++) {
        col = this.columns[i];
        card_count = col.length;
        if (card_count > 0) {
            bottom_cards.push(col[card_count - 1]);
        }
    }

    return bottom_cards;
};

/**
 * Move a card to a new location
 *  drag_id is an integer
 *  drop_id is a string
 */
Game.prototype.move_card = function (drag_id, drop_id) {
    const from_id = this.find_source_id_for_card(drag_id);
    this.history.push({
        cardId: drag_id,
        from: from_id,
        to: drop_id
    });
    var drag_card, col_index;

    // pop the card from its current location
    drag_card = this.pop_card(drag_id);

    if (drop_id.length <= 2) {
        // dropping this card on another card in column
        drop_id = parseInt(drop_id, 10);
        this.push_card(drag_card, drop_id);
    } else {
        // dropping on a freecell or suit cell or empty column
        // the index of
        col_index = parseInt(drop_id.charAt(drop_id.length - 1), 10);
        if (drop_id.slice(0, 1) === 'f') {
            // dropping on a freecell
            this.free[col_index] = drag_card;
        } else if (drop_id.slice(0, 1) === 's') {
            // dropping on a suit cell
            this.suits[col_index] = drag_card;
        } else {
            // dropping on an empty column
            this.columns[col_index].push(drag_card);
        }
    }
};

/**
 * Return the card object and remove it from its current location
 * card_id is an integer.
 */
Game.prototype.pop_card = function (card_id) {
    var i, col, card;

    // check the bottom of each column
    for (i = 0; i < 8; i++) {
        col = this.columns[i];
        if (col.length > 0 && col[col.length - 1].id === card_id) {
            return col.pop();
        }
    }

    // check the freecells
    for (i = 0; i < 4; i++) {
        card = this.free[i];
        if ((card !== null) && (card.id === card_id)) {
            this.free[i] = null;
            return card;
        }
    }

    // 检查每个花色的牌（用于撤销功能）
    for (i = 0; i < 4; i++) {
        card = this.suits[i];
        if ((card !== null) && (card.id === card_id)) {
            if (card.value > 1) {
                // Find the previous card in the sequence for that suit
                const prevCard = this.deck.cards.find(c => c.suit === card.suit && c.value === card.value - 1);
                this.suits[i] = prevCard;
            } else {
                this.suits[i] = null; // It was an Ace
            }
            return card; // Return the card that was removed
        }
    }

    // shouldn't reach this point - should always find card
    console.error('error in Game.pop_card(): could not find card with id', card_id);
    return null;
};

/**
 * Push the card onto the end of a column based on the id of the bottom card
 */
Game.prototype.push_card = function (card, drop_id) {
    var i, col, col_len, bottom_card;

    for (i = 0; i < 8; i++) {
        col = this.columns[i];
        col_len = col.length;
        if (col_len === 0) {
            continue;
        }
        bottom_card = col[col.length - 1];
        if (bottom_card.id === drop_id) {
            col.push(card);
            return;
        }
    }
};

/**
 * Has the game been won?
 */
Game.prototype.is_game_won = function () {
    var i, card;

    for (i = 0; i < 4; i++) {
        card = this.suits[i];
        if (card === null || card.value !== 13) {
            return false;
        }
    }
    return true;
};



// *** Find where a card is coming from before a move.
Game.prototype.find_source_id_for_card = function (card_id) {
    var i, col, card;
    // Check columns
    for (i = 0; i < 8; i++) {
        col = this.columns[i];
        if (col.length > 0 && col[col.length - 1].id === card_id) {
            // If it's the only card, the source is the column container.
            // Otherwise, the source is considered the card below it.
            return col.length > 1 ? col[col.length - 2].id : 'col' + i;
        }
    }
    // Check freecells
    for (i = 0; i < 4; i++) {
        card = this.free[i];
        if (card !== null && card.id === card_id) {
            return 'free' + i;
        }
    }
    return null; // Should not happen for a valid drag
};

// *** Place a card at a specific location, used by move_card and undo.
Game.prototype.place_card = function (card_to_place, location_id) {
    if (typeof location_id === 'string' && location_id.startsWith('col')) {
        const index = parseInt(location_id.slice(-1), 10);
        this.columns[index].push(card_to_place);
    } else if (typeof location_id === 'string' && location_id.startsWith('free')) {
        const index = parseInt(location_id.slice(-1), 10);
        this.free[index] = card_to_place;
    } else if (typeof location_id === 'string' && location_id.startsWith('suit')) {
        const index = parseInt(location_id.slice(-1), 10);
        this.suits[index] = card_to_place;
    } else {
        // The location is another card's ID, so use push_card logic.
        const drop_on_card_id = parseInt(location_id, 10);
        this.push_card(card_to_place, drop_on_card_id);
    }
};

// 撤回逻辑实现
Game.prototype.undo = function () {
    if (this.history.length === 0) {
        return false; // Nothing to undo
    }

    const lastMove = this.history.pop();

    // Remove the card from where it was placed (`lastMove.to`)
    const card = this.pop_card(lastMove.cardId);

    if (card) {
        // Place the card back where it came from (`lastMove.from`)
        this.place_card(card, lastMove.from);
        return true;
    }

    // This case should not be reached if history is consistent
    console.error("Undo failed: could not restore previous state.");
    return false;
};

/******************************************************************************/

/**
 * Deck object - contains an array of Cards.
 */
Game.prototype.Deck = function () {
    var suits, values, colours, i, suit, value;

    suits = ['clubs', 'spades', 'hearts', 'diamonds'];
    values = [1, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    colours = {
        'clubs': 'black',
        'spades': 'black',
        'hearts': 'red',
        'diamonds': 'red'
    };

    this.cards = [];
    for (i = 0; i < 52; i++) {
        suit = suits[i % 4];
        value = values[Math.floor(i / 4)];
        this.cards.push(new this.Card(i + 1, suit, value, colours[suit]));
    }
};

/**
 * shuffle the deck of cards
 * 添加测试模式和随机模式
 */
Game.prototype.Deck.prototype.shuffle = function () {
    var len, i, j, item_j;

    if (gamemode === 'test') {
        // 排序，方便测试
        this.cards.sort(function (a, b) {
            if (a.value < b.value) {
                return -1;
            }
            if (a.value > b.value) {
                return 1;
            }
            return 0;
        });
        this.cards.reverse();
    } else if (gamemode === 'random') {
        len = this.cards.length;
        for (i = 0; i < len; i++) {
            j = Math.floor(len * Math.random());
            item_j = this.cards[j];
            this.cards[j] = this.cards[i];
            this.cards[i] = item_j;
        }
    }
};

/**
 * Get the card by its id
 */
Game.prototype.Deck.prototype.get_card = function (card_id) {
    var i, card;

    for (i = 0; i < 52; i++) {
        card = this.cards[i];
        if (card_id === card.id) {
            return card;
        }
    }
    // only reach this if invalid card_id is supplied
    alert('error in Deck.get_card()');
    return null;
};

/******************************************************************************/

/**
 * Card object
 */
Game.prototype.Deck.prototype.Card = function (id, suit, value, colour) {
    this.id = id;
    this.suit = suit;
    this.value = value;
    this.colour = colour;
};

/**
 * does this card and another card share the same suit?
 */
Game.prototype.Deck.prototype.Card.prototype.sameSuit = function (other) {
    return this.suit === other.suit;
};

/**
 * does this card and another card share the same colour?
 */
Game.prototype.Deck.prototype.Card.prototype.sameColour = function (other) {
    return this.colour === other.colour;
};

/**
 * does this card and another card share the same value?
 */
Game.prototype.Deck.prototype.Card.prototype.sameValue = function (other) {
    return this.value === other.value;
};

/**
 * The image name and location as a string. Used when creating the web page.
 * 重写实现读取SVG
 * 使用GET: /static/cards/<filename> API
 */
Game.prototype.Deck.prototype.Card.prototype.image = function () {
    let cardValue = this.value;

    if (cardValue == 1) {
        cardValue = 'ace';
    } else if (cardValue == 13) {
        cardValue = 'king';
    } else if (cardValue == 12) {
        cardValue = 'queen';
    } else if (cardValue == 11) {
        cardValue = 'jack';
    }

    // Use SVG images for card suits
    const suitImage = `static/cards/${cardValue}_of_${this.suit}.svg`;
    return suitImage;
};

/******************************************************************************/

/**
 * The user interface
 */
var UI = function (game) {
    this.game = game;
    // an array of all the draggables
    // this.drag = [];
    // an array of all the droppables
    this.drop = [];
};

/**
 * Initialise the user interface
 */
UI.prototype.init = function () {
    this.game.init();

    this.add_cards();

    // set up the win dialog
    // this.win();
    // set up the new game button
    // this.new_game();
    // set up the help dialog and button
    // this.help();

    // this.setup_secret();

    this.setup_controls();

    // initialise draggables
    this.create_draggables();

    this.update_history_display();
};

// 添加动画，等所有图片加载完成后再开始动画
UI.prototype.add_cards = function () {
    let card_counter = 0;
    const allCardDivs = [];
    const allImages = [];

    // 1. 先创建所有卡片DOM和图片对象，收集到数组
    for (let i = 0; i < 8; i++) {
        const cards = this.game.columns[i];
        const num_cards = cards.length;
        const col_div = document.getElementById('col' + i.toString());

        for (let j = 0; j < num_cards; j++) {
            const card = cards[j];
            const img = new Image();
            img.src = card.image();

            const card_div = document.createElement('div');
            card_div.id = card.id;

            let classes = ['card', 'rounded', 'transition', 'duration-100', 'ease-in-out'];
            if (j > 0) {
                classes.push('-mt-[88%]');
            }
            card_div.className = classes.join(' ');
            card_div.appendChild(img);

            card_div.style.opacity = '0';

            // 先插入DOM，后续动画
            col_div.appendChild(card_div);

            allCardDivs.push({ card_div, card_counter });
            allImages.push(img);
            card_counter++;
        }
    }

    // 2. 等所有图片加载完成后再统一执行动画
    let loadedCount = 0;
    const totalImages = allImages.length;
    if (totalImages === 0) return;

    function tryStartAnimation() {
        loadedCount++;
        if (loadedCount === totalImages) {
            // 所有图片加载完毕，开始动画
            allCardDivs.forEach(({ card_div, card_counter }) => {
                const randomX = 45 + Math.random() * 10;
                const randomY = -45 - Math.random() * 10;
                const randomRotate = -20 + Math.random() * 40;
                const randomDuration = 500 + Math.random() * 200;

                const keyframes = [
                    {
                        transform: `translate(${randomX}vw, ${randomY}vh) scale(0.3) rotate(${randomRotate}deg)`,
                        opacity: 0
                    },
                    {
                        transform: 'translate(0, 0) scale(1) rotate(0deg)',
                        opacity: 1
                    }
                ];

                const options = {
                    duration: randomDuration,
                    easing: 'ease-out',
                    delay: card_counter * 20,
                    fill: 'forwards'
                };

                card_div.animate(keyframes, options);
            });
        }
    }

    // 3. 监听所有图片加载
    allImages.forEach(img => {
        if (img.complete) {
            // 已经加载
            tryStartAnimation();
        } else {
            img.onload = tryStartAnimation;
            img.onerror = tryStartAnimation; // 防止某些图片加载失败导致卡死
        }
    });
};

/**
 * Remove the cards from the user interface
 */
UI.prototype.remove_cards = function () {
    for (let i = 0; i < 8; i++) {
        const col = document.getElementById('col' + i);
        if (col) col.innerHTML = '';
    }
    for (let i = 0; i < 4; i++) {
        const freeSlot = document.querySelector('#free' + i + ' .slot');
        if (freeSlot) freeSlot.innerHTML = '';
        const suitSlot = document.querySelector('#suit' + i + ' .slot');
        if (suitSlot) suitSlot.innerHTML = '';
    }
};



/**
 * When a draggable card is at the bottom of a column and it is double-clicked,
 * check if it can be moved to a foundation column or empty freecell. If it can,
 * then move it.
 */
UI.prototype.dblclick_draggable = function (event) {
    const card_id = parseInt(event.currentTarget.id, 10);
    const drop_ids = this.game.valid_drop_ids(card_id);

    // Prioritize moving to a suit pile
    let target_drop_id = drop_ids.find(id => id.startsWith('suit'));

    // If not, try moving to a freecell
    if (!target_drop_id) {
        target_drop_id = drop_ids.find(id => id.startsWith('free'));
    }

    if (target_drop_id) {
        this.dblclick_move(card_id, target_drop_id);
        this.update_history_display();
    }
};

// 完全重写，添加动画
UI.prototype.dblclick_move = function (card_id, drop_id) {
    const card = document.getElementById(card_id);
    const drop_div = document.getElementById(drop_id);

    let targetContainer = drop_div;
    if (drop_id.startsWith('free') || drop_id.startsWith('suit')) {
        const slot = drop_div.querySelector('.slot');
        if (slot) targetContainer = slot;
    }

    const fromRect = card.getBoundingClientRect();

    // Temporarily move the card to its new parent to calculate the final position
    if (drop_id.startsWith('suit')) targetContainer.innerHTML = '';
    card.classList.remove('-mt-[88%]');
    targetContainer.appendChild(card);
    const toRect = card.getBoundingClientRect();

    // Calculate the starting transform to make it appear to animate from the old position
    const initialTop = fromRect.top - toRect.top;
    const initialLeft = fromRect.left - toRect.left;

    // Use Web Animations API for a smooth transition
    card.animate([
        { transform: `translate(${initialLeft}px, ${initialTop}px)`, zIndex: this.card_max_zindex() + 1 },
        { transform: 'translate(0, 0)', zIndex: 'auto' }
    ], {
        duration: 200,
        easing: 'ease-out'
    }).onfinish = () => {
        // After animation, re-evaluate all draggables for the new game state
        this.create_draggables();
    };

    // Update the game logic and check for a win
    this.game.move_card(card_id, drop_id);
    this.is_won();
};

UI.prototype.card_max_zindex = function () {
    let max_z = 0;
    document.querySelectorAll('.card').forEach(el => {
        const z_index_str = window.getComputedStyle(el).zIndex;
        if (z_index_str !== 'auto') {
            const z_index = parseInt(z_index_str, 10);
            if (z_index > max_z) max_z = z_index;
        }
    });
    return max_z;
};


/**
 * Create draggables: make valid cards draggable.
 * This function now re-evaluates and resets all event listeners for draggable cards.
 */
UI.prototype.create_draggables = function () {
    document.querySelectorAll('.card').forEach(card => {
        card.style.opacity = '1';
        card.replaceWith(card.cloneNode(true));
    });

    const card_ids = this.game.valid_drag_ids();

    card_ids.forEach(id => {
        const card_div = document.getElementById(id);
        if (!card_div) return;

        card_div.addEventListener('pointerdown', this.handle_pointer_down.bind(this));
        card_div.addEventListener('dblclick', this.dblclick_draggable.bind(this));
        card_div.addEventListener('mouseenter', e => e.currentTarget.classList.add('ring-2', 'ring-blue-400'));
        card_div.addEventListener('mouseleave', e => e.currentTarget.classList.remove('ring-2', 'ring-blue-400'));
    });
};

UI.prototype.handle_pointer_down = function (event) {
    const card_div = event.currentTarget;
    const drag_id = parseInt(card_div.id, 10);
    const drop_ids = this.game.valid_drop_ids(drag_id);

    let startX = event.clientX;
    let startY = event.clientY;

    const moveHandler = (moveEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        card_div.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    };

    const upHandler = (upEvent) => {
        document.removeEventListener('pointermove', moveHandler);
        document.removeEventListener('pointerup', upHandler);

        card_div.style.transform = ''; // Reset transform

        const drop_target = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
        if (drop_target && drop_ids.includes(drop_target.id)) {
            this.handle_drop(card_div.id, drop_target.id);
        }
    };

    document.addEventListener('pointermove', moveHandler);
    document.addEventListener('pointerup', upHandler);
};

UI.prototype.handle_drop = function (drag_id, drop_id) {
    const card = document.getElementById(drag_id);
    const drop_div = document.getElementById(drop_id);

    let targetContainer = drop_div;
    if (drop_id.startsWith('free') || drop_id.startsWith('suit')) {
        const slot = drop_div.querySelector('.slot');
        if (slot) targetContainer = slot;
    }

    if (drop_id.startsWith('suit')) targetContainer.innerHTML = '';

    targetContainer.appendChild(card);
    card.style.top = '0';
    card.style.left = '0';

    if (drop_div.classList.contains('column')) {
        card.classList.toggle('-mt-[88%]', drop_div.children.length > 1);
    } else {
        card.classList.remove('-mt-[88%]');
    }

    this.game.move_card(parseInt(drag_id, 10), drop_id);
    this.update_history_display();
    this.is_won();
};


/**
 * Create droppables: when a card is dragged, decide where it can be dropped.
 */
UI.prototype.create_droppables = function (drag_id) {
    const drop_ids = this.game.valid_drop_ids(drag_id);
    this.drop = []; // Reset the list of current droppables

    drop_ids.forEach(drop_id => {
        const drop_div = document.getElementById(drop_id);
        if (!drop_div) return;

        this.drop.push(drop_div);

        // // Add drop zone event listeners
        // Use pointer events for highlighting and click-to-drop
        drop_div.addEventListener('pointerenter', e => drop_div.classList.add('bg-gray-600'));
        drop_div.addEventListener('pointerleave', e => drop_div.classList.remove('bg-gray-600'));
        drop_div.addEventListener('mouseup', e => {
            // Only handle if a card is being dragged (set by UI.handle_pointer_down)
            if (window.__freecell_dragged_card_id) {
            this.handle_drop(window.__freecell_dragged_card_id, drop_div.id);
            window.__freecell_dragged_card_id = null;
            }
        });

        if (droppable_hint_enabled) {
            drop_div.classList.add(...droppable_hint_style.split(' '));
        }
    });
};

/**
 * Handles dragover event on a droppable target.
 */
UI.prototype.handle_drag_over = function (event) {
    event.preventDefault(); // This is necessary to allow a drop.
    event.dataTransfer.dropEffect = 'move';
};

/**
 * Handles dragenter event for visual feedback.
 */
UI.prototype.handle_drag_enter = function (event) {
    event.preventDefault();
    event.currentTarget.classList.add('bg-gray-600');
};

/**
 * Handles dragleave event for visual feedback.
 */
UI.prototype.handle_drag_leave = function (event) {
    event.currentTarget.classList.remove('bg-gray-600');
};

/**
 * Handles the actual drop event.
 */
UI.prototype.handle_drop = function (event) {
    event.preventDefault();
    const drop_target = event.currentTarget;
    const this_id = drop_target.id;
    const drag_id_str = event.dataTransfer.getData('text/plain');

    if (!drag_id_str) return;

    const drag_id = parseInt(drag_id_str, 10);
    const card = document.getElementById(drag_id);

    // Find the actual container (e.g., the .slot inside a freecell)
    let targetContainer = drop_target;
    if (this_id.startsWith('free') || this_id.startsWith('suit')) {
        const slot = drop_target.querySelector('.slot');
        if (slot) targetContainer = slot;
    }

    if (this_id.startsWith('suit')) targetContainer.innerHTML = '';

    // Move the card in the DOM
    targetContainer.appendChild(card);
    card.style.top = '0';
    card.style.left = '0';

    // Adjust margin for stacked cards in columns
    if (drop_target.classList.contains('column')) {
        card.classList.toggle('-mt-[88%]', drop_target.children.length > 1);
    } else {
        card.classList.remove('-mt-[88%]');
    }

    // Update game state and UI
    this.game.move_card(drag_id, this_id);
    this.update_history_display();
    this.is_won();
};

/*
 * Clear all drag items
 */
UI.prototype.clear_drag = function () {
    var this_ui;
    this_ui = this;

    return function (event, ui) {
        var i, item;

        for (i = 0; i < this_ui.drag.length; i++) {
            item = this_ui.drag[i];
            // remove hover classes
            item.unbind('mouseenter').unbind('mouseleave');
            // force removal of highlight of cards that are dropped on the
            // suit cells
            $(this).removeClass('highlight');
            // remove double-click handler
            item.unbind('dblclick');
            if (item.data('ui-draggable')) {
                item.draggable('destroy');
            }
        }
        // empty the draggable array
        this_ui.drag.length = 0;

        // empty the droppable array - this makes sure that drop array is
        // cleared after an invalid drop
        this_ui.clear_drop();

        // create new draggables
        // 修复在拖放结束后重新创建可拖动元素失败的问题
        setTimeout(function () {
            this_ui.create_draggables();
        }, 0);
    };
};

/**
 * Clear all droppables
 */
UI.prototype.clear_drop = function () {
    this.drop.forEach(item => {
        item.classList.remove(...droppable_hint_style.split(' '));
        item.classList.remove('bg-gray-600');
        // A robust way to clear listeners without storing them is to clone the node
        const newItem = item.cloneNode(true);
        if (item.parentNode) {
            item.parentNode.replaceChild(newItem, item);
        }
    });
    this.drop.length = 0;
};

UI.prototype.is_won = function () {
    if (this.game.is_game_won()) {
        showToast('恭喜你，成功了!', type = 'success');
    }
};

// /**
//  * Animate the cards at the end of a won game
//  */
// UI.prototype.win_animation = function () {
//     var i, $card_div, this_ui, v_x;

//     for (i = 0; i < 53; i++) {
//         $card_div = $('#' + ((i + 4) % 52 + 1));
//         this_ui = this;
//         v_x = 3 + 3 * Math.random();

//         // this is necessary for IE because you can't pass parameters to
//         // function in setTimeout. So need to create a closure to bind
//         // the variables.
//         function animator($card_div, v_x, this_ui) {
//             setTimeout(function () {
//                 this_ui.card_animation($card_div, v_x, 0, this_ui);
//             }, 250 * i);
//         }
//         animator($card_div, v_x, this_ui);
//     }
// };

// /**
//  * Animation of a single card
//  */
// UI.prototype.card_animation = function ($card_div, v_x, v_y, this_ui) {
//     var pos, top, left, bottom;

//     pos = $card_div.offset();
//     top = pos.top;
//     left = pos.left;

//     // calculate new vertical velocity v_y
//     bottom = $(window).height() - 96; // 96 is height of card div
//     v_y += 0.5; // acceleration
//     if (top + v_y + 3 > bottom) {
//         // bounce card at bottom, and add friction
//         v_y = -0.75 * v_y; // friction = 0.75
//     }

//     left -= v_x;
//     top += v_y;
//     $card_div.offset({ top: top, left: left });
//     if (left > -80) {
//         // only continue animation if card is still visible
//         setTimeout(function () {
//             var cd = $card_div;
//             this_ui.card_animation(cd, v_x, v_y, this_ui);
//         }, 20);
//     }
// };


// 设置控件事件
UI.prototype.setup_controls = function () {
    const this_ui = this;

    // New Game button
    document.getElementById('newgame').addEventListener('click', () => {
        this_ui.game.reset();
        this_ui.remove_cards();
        this_ui.add_cards();
        this_ui.create_draggables();
        this_ui.update_history_display();
    });

    // Undo button
    document.getElementById('undo').addEventListener('click', () => this_ui.undo_action());
    // Undo shortcut
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            this_ui.undo_action();
        }
    });

    // Droppable hint toggle
    document.getElementById('droppable-hint').addEventListener('click', function () {
        droppable_hint_enabled = !droppable_hint_enabled;
        this.classList.toggle('bg-purple-500', droppable_hint_enabled);
        this.classList.toggle('hover:bg-purple-600', droppable_hint_enabled);
        this.classList.toggle('bg-gray-500', !droppable_hint_enabled);
        this.classList.toggle('hover:bg-purple-900', !droppable_hint_enabled);
    });

    // Gamemode toggle
    document.getElementById('gamemodes').addEventListener('click', function () {
        if (gamemode === 'test') {
            gamemode = 'random';
            this.textContent = '发牌模式: 随机';
        } else {
            gamemode = 'test';
            this.textContent = '发牌模式: 测试';
        }
    });
};
// 设置撤销操作
UI.prototype.undo_action = function () {
    if (this.game.undo()) {
        this.draw_board_state();
        this.create_draggables();
        this.update_history_display();
    }
};

// 重新绘制整个游戏状态
// 这个函数会在撤销操作后调用，重新绘制所有牌面
UI.prototype.draw_board_state = function () {
    this.remove_cards();

    // Redraw columns
    for (let i = 0; i < 8; i++) {
        const col_div = document.getElementById('col' + i);
        this.game.columns[i].forEach((card, j) => {
            const card_div = document.createElement('div');
            card_div.id = card.id;
            const img = new Image();
            img.src = card.image();
            card_div.appendChild(img);
            card_div.className = 'card rounded ' + (j > 0 ? '-mt-[88%]' : '');
            col_div.appendChild(card_div);
        });
    }

    // Redraw freecells and suits
    ['free', 'suit'].forEach(type => {
        const sourceArray = type === 'free' ? this.game.free : this.game.suits;
        for (let i = 0; i < 4; i++) {
            const card = sourceArray[i];
            if (card) {
                const slot_div = document.querySelector(`#${type}${i} .slot`);
                if (slot_div) {
                    const card_div = document.createElement('div');
                    card_div.id = card.id;
                    const img = new Image();
                    img.src = card.image();
                    card_div.appendChild(img);
                    card_div.className = 'card rounded';
                    slot_div.appendChild(card_div);
                }
            }
        }
    });
};

// 更新历史记录显示
// 这个函数会在每次移动后调用，更新历史记录列表
UI.prototype.update_history_display = function () {
    const history = this.game.history;
    const moveCountEl = document.getElementById('move-count');
    if (moveCountEl) moveCountEl.textContent = history.length.toString();

    const list = document.getElementById('history-list');
    if (!list) return;

    list.innerHTML = ''; // Clear previous entries

    if (history.length === 0) {
        list.innerHTML = '<div class="text-gray-500 text-center p-4">No moves yet.</div>';
        return;
    }

    const getCardName = (cardId) => {
        const card = this.game.deck.get_card(cardId);
        if (!card) return '...';
        let val = card.value;
        if (val === 1) val = 'A'; else if (val === 11) val = 'J'; else if (val === 12) val = 'Q'; else if (val === 13) val = 'K';
        const suitSymbols = { 'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠' };
        const colorClass = (card.colour === 'red') ? 'text-red-400' : 'text-gray-300';
        return `<span class="font-bold ${colorClass}">${val}${suitSymbols[card.suit]}</span>`;
    };

    const getLocationName = (locId) => {
        if (typeof locId === 'string') {
            if (locId.startsWith('free')) return `Freecell ${parseInt(locId.slice(-1)) + 1}`;
            if (locId.startsWith('suit')) return `Foundation`;
            if (locId.startsWith('col')) return `Column ${parseInt(locId.slice(-1)) + 1}`;
        }
        return `card ${getCardName(locId)}`;
    };

    const historyHtml = [...history].reverse().map((move, index) => {
        const toName = getLocationName(move.to);
        const cardName = getCardName(move.cardId);
        return `<div class="text-sm p-1.5 rounded bg-gray-800/50 text-gray-400">
            <span class="font-mono text-gray-500 mr-2">${history.length - index}.</span> Move ${cardName} to ${toName}
        </div>`;
    }).join('');

    list.insertAdjacentHTML('beforeend', historyHtml);
};


/******************************************************************************/

var my_ui;
document.addEventListener('DOMContentLoaded', function () {    
    //var g, my_ui;
    var g;

    g = new Game();
    my_ui = new UI(g);
    my_ui.init();
});