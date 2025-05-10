from flask import Flask, render_template, request, redirect, url_for, jsonify, session, flash

from database import db, User, GameSession, Ranking, GameRecord

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'  # 生产环境应使用更安全的密钥
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///blackjack.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

import blackjack_api

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/about')
def about():
    return render_template('about.html')


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

@app.route('/blackjack')
def blackjack_game():
    if 'username' not in session:
        return redirect(url_for('login'))
    # 在 index 页面显示排名，需要从数据库获取
    rankings_data = Ranking.query.order_by(Ranking.score.desc()).all()
    # 需要获取用户名，可以通过 user 关系访问
    player_scores_display = [{'username': r.user.username, 'score': r.score} for r in rankings_data]
    return render_template('index.html', username=session['username'], player_scores=player_scores_display)

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
    with app.app_context():
        db.create_all()
    # 为了运行异步 Flask 应用，需要使用 ASGI 服务器，例如 hypercorn
    # 运行命令示例: hypercorn app:app -w 4 -k asyncio
    # 在开发环境中，可以使用 debug=True 运行，但需要安装 gevent 或 eventlet
    app.run(debug=True)
    # print("请使用 ASGI 服务器运行此应用，例如: hypercorn app:app -w 4 -k asyncio")
