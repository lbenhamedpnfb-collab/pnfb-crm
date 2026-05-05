"""
One-time script: creates the DB, imports contacts from JSON, creates admin user.
Run: python3 init_db.py
"""
import sys, os, json, shutil
sys.path.insert(0, os.path.dirname(__file__))

from app import app, db, bcrypt, User, Contact, ContactLog

CONTACTS_JSON = '/tmp/pnfb_contacts.json'
STRATEGIC_JSON = '/tmp/strategic_data.json'
INSTANCE_DIR = os.path.join(os.path.dirname(__file__), 'instance')

def main():
    print("⚙️  Initialisation de la base de données PNFB CRM...")

    os.makedirs(INSTANCE_DIR, exist_ok=True)

    # Copy strategic data
    if os.path.exists(STRATEGIC_JSON):
        dest = os.path.join(INSTANCE_DIR, 'strategic_data.json')
        shutil.copy(STRATEGIC_JSON, dest)
        print(f"✅ Données stratégiques copiées → {dest}")
    else:
        print("⚠️  strategic_data.json introuvable dans /tmp")

    with app.app_context():
        db.drop_all()
        db.create_all()
        print("✅ Tables créées")

        # Admin user
        admin_pw = input("Mot de passe admin (défaut: Admin2026!): ").strip() or "Admin2026!"
        admin = User(
            username='admin',
            email='admin@pnfb.fr',
            password_hash=bcrypt.generate_password_hash(admin_pw).decode(),
            role='admin'
        )
        db.session.add(admin)

        # Optional second user
        add_user = input("Ajouter un autre utilisateur ? (o/N): ").strip().lower()
        if add_user == 'o':
            u2_name = input("  Nom d'utilisateur: ").strip() or "user"
            u2_email = input("  Email: ").strip() or "user@pnfb.fr"
            u2_pw = input("  Mot de passe: ").strip() or "User2026!"
            user2 = User(
                username=u2_name,
                email=u2_email,
                password_hash=bcrypt.generate_password_hash(u2_pw).decode(),
                role='user'
            )
            db.session.add(user2)

        db.session.commit()
        print("✅ Utilisateurs créés")

        # Import contacts
        if not os.path.exists(CONTACTS_JSON):
            print(f"❌ {CONTACTS_JSON} introuvable — skip import contacts")
        else:
            with open(CONTACTS_JSON, 'r', encoding='utf-8') as f:
                contacts_data = json.load(f)

            print(f"📦 Import de {len(contacts_data)} contacts...")
            # Deduplicate by id (keep last occurrence)
            seen_ids = {}
            for d in contacts_data:
                seen_ids[d['id']] = d
            contacts_data = list(seen_ids.values())
            print(f"  (après déduplication : {len(contacts_data)} contacts)")
            imported = 0
            for d in contacts_data:
                c = Contact(
                    id=d.get('id'),
                    company=d.get('company',''),
                    name=d.get('name',''),
                    title=d.get('title',''),
                    sector=d.get('sector',''),
                    segment=d.get('segment',''),
                    stage=d.get('stage','Prospect'),
                    priority=d.get('priority','MEDIUM'),
                    score=d.get('score',50),
                    email=d.get('email',''),
                    email_status=d.get('email_status',''),
                    phone=d.get('phone',''),
                    decision_maker=bool(d.get('decision_maker',False)),
                    poei_offer=d.get('poei_offer',''),
                    active_offers=d.get('active_offers',''),
                    action_type=d.get('action_type',''),
                    next_action=d.get('next_action',''),
                    next_action_date=d.get('next_action_date',''),
                    deal_potential=d.get('deal_potential',''),
                    alert=d.get('alert',''),
                    linkedin=d.get('linkedin',''),
                    notes=d.get('notes',''),
                    done=bool(d.get('_done',False)),
                )
                db.session.add(c)
                # Import existing logs
                for log in d.get('log', []):
                    l = ContactLog(
                        contact_id=d['id'],
                        date=log.get('date',''),
                        type=log.get('type',''),
                        result=log.get('result',''),
                        note=log.get('note','')
                    )
                    db.session.add(l)
                imported += 1
                if imported % 100 == 0:
                    db.session.commit()
                    print(f"  {imported}/{len(contacts_data)}...")

            db.session.commit()
            print(f"✅ {imported} contacts importés")

    print("\n🎉 Base initialisée !")
    print("   Démarrer le serveur : python3 run.py")
    print(f"   Admin : admin / {admin_pw}")

if __name__ == '__main__':
    main()
