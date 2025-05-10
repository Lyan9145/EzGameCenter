from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import json
from sqlalchemy.types import TypeDecorator, TEXT
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship
from flask_sqlalchemy import SQLAlchemy

# Initialize db here instead of importing from app
db = SQLAlchemy()


# Custom type for JSON data
class JSONEncodedDict(TypeDecorator):
    impl = TEXT

    def process_bind_param(self, value, dialect):
        if value is not None:
            value = json.dumps(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            value = json.loads(value)
        return value

# Database Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    game_sessions = relationship('GameSession', backref='user', lazy=True)
    rankings = relationship('Ranking', backref='user', lazy=True)
    game_records = relationship('GameRecord', backref='user', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class GameSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, ForeignKey('user.id'), nullable=False)
    deck = db.Column(JSONEncodedDict, nullable=False)
    player_hand = db.Column(JSONEncodedDict, nullable=False)
    dealer_hand = db.Column(JSONEncodedDict, nullable=False)
    player_score = db.Column(db.Integer, nullable=False)
    dealer_score = db.Column(db.Integer, nullable=False)
    current_bet = db.Column(db.Integer, nullable=False)
    game_over = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

class Ranking(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, ForeignKey('user.id'), nullable=False)
    score = db.Column(db.Integer, default=0, nullable=False)

class GameRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, ForeignKey('user.id'), nullable=False)
    result = db.Column(db.String(10), nullable=False) # 'win', 'lose', 'draw'
    player_score = db.Column(db.Integer, nullable=False)
    dealer_score = db.Column(db.Integer, nullable=False)
    bet_amount = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


# 异步更新排名 (使用数据库)
def update_rankings_db(user_id, score):
    # 查找或创建用户的排名记录
    ranking = Ranking.query.filter_by(user_id=user_id).first()
    if ranking:
        if score > ranking.score:
            ranking.score = score
    else:
        new_ranking = Ranking(user_id=user_id, score=score)
        db.session.add(new_ranking)
    db.session.commit()

# 异步添加游戏记录 (使用数据库)
def add_game_record(user_id, result, player_score, dealer_score, bet_amount):
    new_record = GameRecord(
        user_id=user_id,
        result=result,
        player_score=player_score,
        dealer_score=dealer_score,
        bet_amount=bet_amount,
        timestamp=datetime.utcnow()
    )
    db.session.add(new_record)
    db.session.commit()
