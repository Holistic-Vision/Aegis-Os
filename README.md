# AEGIS OS (v0.7.6) — GitHub Pages / PWA

MVP **privacy-first** (stockage local). Modules: Mind, Journal, Chat IA (clé perso), Library, hubs Armor/Holistic/Pelvic.

## Déploiement GitHub Pages
- Mettre le contenu du dossier `docs/` à la racine de GitHub Pages
- Dans GitHub: Settings → Pages → Branch: `main` / folder: `/docs`

## Termux (Android) — mise à jour
```bash
cd ~/ton-repo
rm -rf docs
cp -r /storage/emulated/0/Download/AEGIS_OS_v0_1/docs ./docs
git add -A
git commit -m "AEGIS v0.7.6"
git push
```

## Notes importantes
- L’assistant IA utilise une clé API utilisateur: **ne convient pas** pour un SaaS public.
- Abonnements: à intégrer via Stripe Checkout + backend (Cloudflare/Netlify/Supabase).


## Parrainage (MVP)
- Un code de parrainage est généré localement dans /account.
- Un lien de parrainage utilise `?ref=CODE`.
- Pour appliquer une réduction automatiquement sur le 1er abonnement: nécessite un backend Stripe (Checkout Session + allow_promotion_codes + metadata).


## Profil santé & snapshots
- Champs profil: grossesse, ménopause, andropause, tabac/vape (quantité/jour), problème cardiaque, problème de repos.
- Ces infos peuvent être enregistrées dans chaque check-in (snapshot) pour un suivi quotidien/hebdo/mensuel.
- Page /insights: synthèse jour/semaine/mois.


## v0.7.6
- Activation des flags santé dans Armor: HIIT désactivé par défaut si risque HIGH (enceinte ou pb cardiaque). Alternatives mobilité/respiration mises en avant.


## v0.7.6
- Override manuel: déblocage HIIT 24h si risque HIGH, avec confirmation et journalisation (check-in overrides + compteur dans /insights).


## v0.7.6
- Hotfix: remove ellipsis placeholders, safe boot loader in index.html.
- GitHub Pages base path support.
