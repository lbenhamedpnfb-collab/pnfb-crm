from dotenv import load_dotenv
load_dotenv()  # charge .env automatiquement si présent

from app import app, db

with app.app_context():
    db.create_all()

print("🚀 PNFB CRM démarré → http://localhost:5050")
app.run(host='0.0.0.0', port=5050, debug=False)
