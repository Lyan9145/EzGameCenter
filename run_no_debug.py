from app import *

app.secret_key = "actually_secret"
host = '0.0.0.0'
port = 23333

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=False, host=host, port=port)