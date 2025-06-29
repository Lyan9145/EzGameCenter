const droppable_hint_style = "ring-2 ring-green-400 hover:ring-4 hover:ring-green-500";
let droppable_hint_enabled = true;

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
    // *** NEW: The history of moves for the undo function
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
    for (i = 0; i < 8; i++) {
        col = this.columns[i];
        col_len = col.length;
        if (col_len > 0) {
            card = col[col_len - 1];
            drag_ids.push(card.id.toString());
        }
    }

    return drag_ids;
};

/**
 * Create an array of ids of valid drop locations for the card. The ids are
 * the id attribute string in the DOM.
 */
// 替换旧的 Game.prototype.valid_drop_ids 函数
Game.prototype.valid_drop_ids = function (card_id) {
    var drop_ids, i, free, suit_card, drag_card, card, col;

    drop_ids = [];

    // the card being dragged
    drag_card = this.deck.get_card(card_id);

    // add empty freecells (这部分逻辑不变)
    for (i = 0; i < 4; i++) {
        free = this.free[i];
        if (free === null) {
            drop_ids.push('free' + i.toString());
        }
    }

    // add a valid suit cell (这部分逻辑不变)
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

    // *** 修改的部分在这里 ***
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
Game.prototype.pop_card = function(card_id) {
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
    
    // *** NEW: Check suit piles (for the Undo function)
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

// *** NEW: Find where a card is coming from before a move.
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

// *** NEW: Place a card at a specific location, used by move_card and undo.
Game.prototype.place_card = function(card_to_place, location_id) {
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

// *** NEW: Undo the last move.
Game.prototype.undo = function() {
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
 */
Game.prototype.Deck.prototype.shuffle = function() {
    var len, i, j, item_j;

    // useful for debugging - deal the cards in optimal order
    this.cards.sort(function(a, b) {
        if (a.value < b.value) {
            return -1;
        }
        if (a.value > b.value) {
            return 1;
        }
        return 0;
    });
    this.cards.reverse();
    

    // len = this.cards.length;
    // for (i = 0; i < len; i++) {
    //     j = Math.floor(len * Math.random());
    //     item_j = this.cards[j];
    //     this.cards[j] = this.cards[i];
    //     this.cards[i] = item_j;
    // }
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
    this.drag = [];
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
    this.win();
    // set up the new game button
    this.new_game();
    // set up the help dialog and button
    this.help();

    // this.setup_secret();

    this.setup_controls();

    // initialise draggables
    this.create_draggables();

    this.update_history_display();
};

/**
 * Add cards to the user interface with randomized animation.
 */
UI.prototype.add_cards = function () {
    console.log('Adding cards to the UI with randomized animation');
    let card_counter = 0;

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

            // --- 样式设置 ---
            let classes = ['card', 'rounded', 'transition', 'duration-100', 'ease-in-out'];
            if (j > 0) {
                classes.push('-mt-[88%]');
            }
            card_div.className = classes.join(' ');
            card_div.appendChild(img);

            // 动画开始前，将卡片设置为透明，防止闪烁
            card_div.style.opacity = '0';

            // --- 动画实现 (Web Animations API) ---

            // 1. 定义随机参数
            const randomX = 45 + Math.random() * 10; // X轴起点在 45vw 到 55vw 之间
            const randomY = -45 - Math.random() * 10; // Y轴起点在 -45vh 到 -55vh 之间
            const randomRotate = -20 + Math.random() * 40; // 旋转角度在 -20deg 到 20deg 之间
            const randomDuration = 500 + Math.random() * 200; // 动画时长在 500ms 到 700ms 之间

            // 2. 定义关键帧
            const keyframes = [
                { // from
                    transform: `translate(${randomX}vw, ${randomY}vh) scale(0.3) rotate(${randomRotate}deg)`,
                    opacity: 0
                },
                { // to
                    transform: 'translate(0, 0) scale(1) rotate(0deg)',
                    opacity: 1
                }
            ];

            // 3. 定义动画选项
            const options = {
                duration: randomDuration,
                easing: 'ease-out',
                delay: card_counter * 20, // 延迟仍然是递增的，但可以稍微缩短间隔
                fill: 'forwards' // 动画结束后保持最终状态
            };

            // 4. 执行动画
            card_div.animate(keyframes, options);

            col_div.appendChild(card_div);
            card_counter++;
        }
    }
};

/**
 * Remove the cards from the user interface
 */
UI.prototype.remove_cards = function () {
    var i;

    for (i = 0; i < 8; i++) {
        $('#col' + i.toString()).empty();
    }
    for (i = 0; i < 4; i++) {
        $('#free' + i.toString()).children(".slot").empty();
    }
    for (i = 0; i < 4; i++) {
        $('#suit' + i.toString()).children(".slot").empty();
    }
};

/**
 * Create draggables: cards in the freecells and at the bottoms of all the
 * columns can be dragged.
 */
UI.prototype.create_draggables = function () {
    var card_ids, card_count, i, id, card_div, this_ui;

    card_ids = this.game.valid_drag_ids();
    card_count = card_ids.length;
    this_ui = this;

    for (i = 0; i < card_count; i++) {
        id = card_ids[i];
        card_div = $('#' + id);

        // add to the list of draggables
        this_ui.drag.push(card_div);

        card_div.draggable({
            stack: '.card',
            containment: '#table',
            revert: 'invalid',
            revertDuration: 200,
            start: this_ui.create_droppables(),
            stop: this_ui.clear_drag()
        });
        card_div.draggable('enable');

        // add double-click event handling to all draggables
        card_div.bind('dblclick', { this_ui: this_ui }, this_ui.dblclick_draggable);

        card_div.hover(
            // hover start
            function (event) {
                $(this).addClass('ring-2 ring-blue-400');
            },
            // hover end
            function (event) {
                $(this).removeClass('ring-2 ring-blue-400');
            }
        );
    }
};

/**
 * When a draggable card is at the bottom of a column and it is double-clicked,
 * check if it can be moved to a foundation column or empty freecell. If it can,
 * then move it.
 */
UI.prototype.dblclick_draggable = function (event) {
    var this_ui, drop_ids, card_id, drop_len, i, drop_id, drop_div;
    this_ui = event.data.this_ui;

    // the valid drop locations for this card
    card_id = parseInt(this.id, 10);
    drop_ids = this_ui.game.valid_drop_ids(card_id);
    drop_len = drop_ids.length;

    // can the card be moved to a suit cell
    for (i = 0; i < drop_len; i++) {
        drop_id = drop_ids[i];
        if (drop_id.substr(0, 4) === 'suit') {
            this_ui.dblclick_move(card_id, drop_id, this_ui);
            this_ui.update_history_display();
            return;
        }
    }

    // can the card be moved to an empty freecell
    for (i = 0; i < drop_len; i++) {
        drop_id = drop_ids[i];
        if (drop_id.substr(0, 4) === 'free') {
            this_ui.dblclick_move(card_id, drop_id, this_ui);
            this_ui.update_history_display();
            return;
        }
    }
};

UI.prototype.dblclick_move = function (card_id, drop_id, this_ui) {
    const card = $('#' + card_id);
    const drop_div = $('#' + drop_id);

    // 1. 决定最终目标容器
    let $targetContainer = drop_div;
    if (drop_id.startsWith('free') || drop_id.startsWith('suit')) {
        let $slot = drop_div.children('.slot');
        if ($slot.length > 0) {
            $targetContainer = $slot;
        }
    }
    
    // 2. 记录起始和结束位置
    const fromOffset = card.offset();
    const toOffset = $targetContainer.offset();
    
    // 3. 清理旧样式并立即移动DOM
    if (drop_id.startsWith('suit')) $targetContainer.empty();
    card.removeClass('-mt-[88%]');
    card.appendTo($targetContainer);
        
    // 4. 设置初始位置以防止闪烁
    card.css({
        position: 'relative', // 确保可以定位
        top: fromOffset.top - toOffset.top,
        left: fromOffset.left - toOffset.left,
        zIndex: this_ui.card_max_zindex() + 1 // 确保在顶层
    });
    
    // 5. 执行动画到最终位置
    card.animate({
        top: 0,
        left: 0
    }, 200, function() {

    });
    
    // 6. 更新游戏逻辑状态
    this_ui.game.move_card(card_id, drop_id);

    // 7. 清理并重新创建拖拽逻辑
    this_ui.clear_drag()(); // clear_drag返回一个函数，需要立即执行它

    // 8. 检查是否获胜
    this_ui.is_won();
};

UI.prototype.card_max_zindex = function () {
    var max_z = 0;
    $('.card').each(function (i, el) {
        z_index = parseInt($(el).css('z-index'), 10);
        if (!isNaN(z_index) && z_index > max_z) {
            max_z = z_index;
        }
    });
    return max_z;
};

/**
 * Create droppables: when a card is dragged, decide where it can be dropped.
 * this method should be called when a card drag is started.
 *
 * This method should use Game methods to make decisions.
 *
 * use this as the callback for the start event of the drag. This is why it has
 * the two parameters (event, ui).
 */
UI.prototype.create_droppables = function () {
    var this_ui;
    this_ui = this;

    var droppers = function (event, ui) {
        var drop_ids, i, drop_id, drag_id;

        drag_id = parseInt($(this).attr('id'), 10);
        drop_ids = this_ui.game.valid_drop_ids(drag_id);

        for (i = 0; i < drop_ids.length; i++) {
            drop_id = drop_ids[i];
            let drop_div_id = drop_id.toString();
            // If dropping on a card, the droppable is the card itself.
            let drop_div = $('#' + drop_div_id);

            this_ui.drop.push(drop_div);
            drop_div.droppable({
                tolerance: "pointer",
                hoverClass: "bg-gray-600",
                drop: function (event, ui) {
                    var this_id = $(this).attr('id');
                    var drag_id = parseInt(ui.draggable.attr('id'), 10);
                    var $card = ui.draggable;
                    
                    let $targetContainer = $(this);
                    if (this_id.startsWith('free') || this_id.startsWith('suit')) {
                        let $slot = $(this).children('.slot');
                        if ($slot.length > 0) $targetContainer = $slot;
                    }

                    if (this_id.startsWith('suit')) $targetContainer.empty();

                    $card.appendTo($targetContainer);
                    $card.css({ top: 0, left: 0 });

                    if ($(this).hasClass('column')) {
                        if ($(this).children('.card').length > 1) {
                            $card.addClass('-mt-[88%]');
                        } else {
                            $card.removeClass('-mt-[88%]');
                        }
                    } else {
                        $card.removeClass('-mt-[88%]');
                    }

                    this_ui.game.move_card(drag_id, this_id);
                    this_ui.update_history_display();
                    this_ui.is_won();
                }
            });
            drop_div.droppable('enable');
            if (droppable_hint_enabled) {
                drop_div.addClass(droppable_hint_style);
            }
        }
    };
    return droppers;
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
        this_ui.create_draggables();
    };
};

/**
 * Clear all droppables
 */
UI.prototype.clear_drop = function () {
    var i, item;

    for (i = 0; i < this.drop.length; i++) {
        item = this.drop[i];
        if (item.data('ui-droppable')) { 
            item.droppable('destroy');
        }
        try {
            item.removeClass(droppable_hint_style);
        } catch (e) {
            // if the class is not present then this will throw an error
        }
        //item.droppable('disable');
    }
    // empty the droppable array
    this.drop.length = 0;
};

UI.prototype.is_won = function () {
    if (this.game.is_game_won()) {
        // this.win_animation();
        $('#windialog').dialog('open');
        //return false;
    }
};

/**
 * Animate the cards at the end of a won game
 */
UI.prototype.win_animation = function () {
    var i, $card_div, this_ui, v_x;

    for (i = 0; i < 53; i++) {
        $card_div = $('#' + ((i + 4) % 52 + 1));
        this_ui = this;
        v_x = 3 + 3 * Math.random();

        // this is necessary for IE because you can't pass parameters to
        // function in setTimeout. So need to create a closure to bind
        // the variables.
        function animator($card_div, v_x, this_ui) {
            setTimeout(function () {
                this_ui.card_animation($card_div, v_x, 0, this_ui);
            }, 250 * i);
        }
        animator($card_div, v_x, this_ui);
    }
};

/**
 * Animation of a single card
 */
UI.prototype.card_animation = function ($card_div, v_x, v_y, this_ui) {
    var pos, top, left, bottom;

    pos = $card_div.offset();
    top = pos.top;
    left = pos.left;

    // calculate new vertical velocity v_y
    bottom = $(window).height() - 96; // 96 is height of card div
    v_y += 0.5; // acceleration
    if (top + v_y + 3 > bottom) {
        // bounce card at bottom, and add friction
        v_y = -0.75 * v_y; // friction = 0.75
    }

    left -= v_x;
    top += v_y;
    $card_div.offset({ top: top, left: left });
    if (left > -80) {
        // only continue animation if card is still visible
        setTimeout(function () {
            var cd = $card_div;
            this_ui.card_animation(cd, v_x, v_y, this_ui);
        }, 20);
    }
};

UI.prototype.setup_secret = function () {
    var this_ui = this;
    $('#secret').click(function () {
        this_ui.win_animation();
    });
};

/**
 * Show the win dialog box
 */
UI.prototype.win = function () {
    $('#windialog').dialog({
        title: 'Freecell',
        modal: true,
        show: 'blind',
        autoOpen: false,
        zIndex: 5000
    });
};

/**
 * The help dialog
 */
UI.prototype.help = function () {
    $('#helptext').dialog({
        title: 'Help',
        modal: true,
        show: 'blind',
        autoOpen: false,
        zIndex: 5000,
        minWidth: 550
    });

    $('#help').click(function () {
        $('#helptext').dialog('open');
    });

};

UI.prototype.new_game = function () {
    var this_ui = this;
    $('#newgame').click(function () {
        this_ui.game.reset();
        this_ui.remove_cards();
        this_ui.add_cards();
        this_ui.create_draggables();
        this_ui.update_history_display(); // *** NEW
    });
};

// *** NEW SECTION FOR UNDO AND HISTORY UI ***

/**
 * NEW: Sets up event listeners for the Undo button and Ctrl+Z shortcut.
 */
// 修复后的代码
UI.prototype.setup_controls = function() {
    const this_ui = this;
    jQuery('#undo').on('click', function() {
        this_ui.undo_action();
    });

    jQuery(document).on('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            this_ui.undo_action();
        }
    });
};

/**
 * NEW: The main action for an undo operation.
 */
UI.prototype.undo_action = function() {
    const wasUndone = this.game.undo();
    if (wasUndone) {
        // Redraw the entire board from the new game state
        this.remove_cards();
        this.draw_board_state();
        this.create_draggables();
        this.update_history_display();
    }
};

/**
 * NEW: A non-animated function to draw the board based on game state.
 * Used for redraws after an undo.
 */
UI.prototype.draw_board_state = function() {
    // Redraw columns
    for (let i = 0; i < 8; i++) {
        const col_div = document.getElementById('col' + i.toString());
        const cards = this.game.columns[i];
        for (let j = 0; j < cards.length; j++) {
            const card = cards[j];
            const card_div = document.createElement('div');
            card_div.id = card.id;
            const img = new Image();
            img.src = card.image();
            card_div.appendChild(img);
            
            let classes = ['card', 'rounded'];
            if (j > 0) {
                classes.push('-mt-[88%]');
            }
            card_div.className = classes.join(' ');
            col_div.appendChild(card_div);
        }
    }
    // Redraw freecells and suits
    ['free', 'suit'].forEach(type => {
        const sourceArray = type === 'free' ? this.game.free : this.game.suits;
        for (let i = 0; i < 4; i++) {
            const card = sourceArray[i];
            if (card) {
                const slot_div = $(`#${type}${i}`).children('.slot');
                const card_div = document.createElement('div');
                card_div.id = card.id;
                const img = new Image();
                img.src = card.image();
                card_div.appendChild(img);
                card_div.className = 'card rounded';
                slot_div.append(card_div);
            }
        }
    });
};

/**
 * NEW: Updates the move count and the history list in the sidebar.
 */
UI.prototype.update_history_display = function() {
    const history = this.game.history;
    $('#move-count').text(history.length);

    const $list = $('#history-list');
    $list.empty();

    if (history.length === 0) {
        $list.append('<div class="text-gray-500 text-center p-4">No moves yet.</div>');
        return;
    }

    // Helper to get a short, readable name for a card
    const getCardName = (cardId) => {
        const card = this.game.deck.get_card(cardId);
        let val = card.value;
        if (val === 1) val = 'A';
        else if (val === 11) val = 'J';
        else if (val === 12) val = 'Q';
        else if (val === 13) val = 'K';
        const suitSymbols = { 'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠' };
        const colorClass = (card.colour === 'red') ? 'text-red-400' : 'text-gray-300';
        return `<span class="font-bold ${colorClass}">${val}${suitSymbols[card.suit]}</span>`;
    };

    // Helper to get a readable name for a location
    const getLocationName = (locId) => {
        if (typeof locId === 'string') {
            if (locId.startsWith('free')) return `Freecell ${parseInt(locId.slice(-1)) + 1}`;
            if (locId.startsWith('suit')) return `Foundation`;
            if (locId.startsWith('col')) return `Column ${parseInt(locId.slice(-1)) + 1}`;
        }
        return `card ${getCardName(locId)}`;
    };

    // Show history in reverse order (latest move on top)
    [...history].reverse().forEach((move, index) => {
        const toName = getLocationName(move.to);
        const cardName = getCardName(move.cardId);
        const moveText = `Move ${cardName} to ${toName}`;

        const $item = $(`<div class="text-sm p-1.5 rounded bg-gray-800/50 text-gray-400">
            <span class="font-mono text-gray-500 mr-2">${history.length - index}.</span> ${moveText}
        </div>`);
        $list.append($item);
    });
};


/******************************************************************************/

var my_ui;
$(document).ready(function () {
    //var g, my_ui;
    var g;

    g = new Game();
    my_ui = new UI(g);
    my_ui.init();
});