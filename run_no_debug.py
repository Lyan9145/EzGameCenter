from app import *

app.secret_key = "actually_secret"

if __name__ == "__main__":
    app.run(debug=False)