# Portail client Gomand Consult

Espace client privé : chaque client se connecte (email + mot de passe) et retrouve **ses** devis, factures, livrables et comptes rendus, les consulte en ligne, les surligne et les commente. Il valide aussi des **galeries photo** (approuver, commenter ou refuser chaque photo). Anthony répond, publie et suit tout depuis un back-office.

- Interface : React + Vite, aux couleurs du design system du site (Montserrat, cobalt, corail).
- Hébergement du site et des fonctions serveur : **Netlify**. Code : **GitHub**.
- Comptes, base de données et fichiers : **Supabase** (région UE).
- Emails de prévenance : **Resend**.
- Les devis et factures restent gérés dans **Accountable** (la preuve d'acceptation y reste). Le portail n'en garde qu'une copie de consultation, avec la référence.

```
Navigateur ──► Netlify (site + 2 fonctions) ──► Supabase (comptes, base, fichiers privés)
                          └──► Resend (emails)
```

---

## Mise en route (compter environ une heure)

Les intitulés des menus peuvent légèrement varier chez les fournisseurs.

### 1. GitHub
1. Créez un dépôt **privé** (par exemple `Gomand-Consult/Gomand-Consult-Portail`).
2. Dans un terminal, depuis ce dossier :
   ```bash
   git init && git add . && git commit -m "Portail client"
   git branch -M main
   git remote add origin https://github.com/Gomand-Consult/Gomand-Consult-Portail.git
   git push -u origin main
   ```
   Le fichier `.gitignore` empêche d'envoyer les secrets (`.env`).

### 2. Supabase
1. Créez un projet. **Région : une région de l'Union européenne** (Francfort ou Irlande). Notez le mot de passe de la base dans votre gestionnaire de mots de passe.
2. **SQL Editor** → nouvelle requête → collez tout le contenu de `supabase/schema.sql` → *Run*. Cela crée les tables, les règles de sécurité et les deux espaces de stockage privés (`documents`, `photos`).
   *Vous aviez déjà installé la première version ?* Exécutez seulement `supabase/migrations/002_rgpd.sql` (elle ajoute l'accusé de réception de la politique de confidentialité, sans toucher aux données existantes).
3. **Authentication → Sign In / Providers** :
   - **désactivez « Allow new users to sign up »** (il ne doit pas y avoir d'inscription libre : c'est Anthony qui invite) ;
   - laissez « Confirm email » activé ;
   - **longueur minimale du mot de passe : 12** ;
   - si votre formule le permet, activez la protection contre les mots de passe compromis.
4. **Authentication → URL Configuration** :
   - *Site URL* : l'adresse finale du portail (ex. `https://espace.gomandconsult.com`) ;
   - *Redirect URLs* : ajoutez `https://espace.gomandconsult.com/definir-mot-de-passe` (et celle du site Netlify provisoire, si vous testez avant d'avoir le domaine).
5. **Authentication → Emails** :
   - *SMTP Settings* : activez l'envoi personnalisé avec Resend (voir étape 3). Sans cela, Supabase limite fortement le nombre d'invitations envoyées ;
   - *Templates* : collez `supabase/email-templates/invite.html` dans « Invite user » et `recovery.html` dans « Reset password », avec les objets indiqués en tête de chaque fichier.
6. **Project Settings → API** : notez l'**URL du projet**, la clé **anon public** et la clé **service_role** (secrète : ne la partagez jamais, ne la mettez jamais dans GitHub).
7. **Créez votre compte Anthony** : *Authentication → Users → Add user* (votre email, un mot de passe long, cochez « Auto Confirm User »). Copiez l'identifiant (UUID) créé, puis dans le SQL Editor :
   ```sql
   insert into public.profiles (id, role, full_name, email)
   values ('COLLEZ-ICI-VOTRE-UUID', 'admin', 'Anthony Gomand', 'anthony@gomandconsult.com');
   ```

### 3. Resend (emails)
1. Créez un compte, puis **Domains → Add domain** : `gomandconsult.com`. Ajoutez chez votre gestionnaire de domaine les enregistrements DNS demandés (SPF et DKIM). Ils s'ajoutent à ceux de Google Workspace sans les remplacer ; vérifiez que Resend affiche « Verified ».
2. **API Keys → Create** : copiez la clé.
3. Pour que Supabase envoie aussi ses emails via Resend (étape 2.5) : serveur `smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe = la clé API, expéditeur `portail@gomandconsult.com`.

### 4. Netlify
1. **Add new site → Import from Git** → choisissez le dépôt. Les réglages de construction sont déjà dans `netlify.toml`.
2. **Site configuration → Environment variables** (créez-les avant le premier déploiement) :

   | Variable | Valeur | Remarque |
   |---|---|---|
   | `VITE_SUPABASE_URL` | URL du projet | publique |
   | `VITE_SUPABASE_ANON_KEY` | clé anon | publique |
   | `SUPABASE_URL` | URL du projet (la même que ci-dessus) | lue par les fonctions serveur |
   | `SUPABASE_SERVICE_ROLE_KEY` | clé service_role | **secrète** : cochez « Contains secret values » |
   | `RESEND_API_KEY` | clé Resend | **secrète** |
   | `MAIL_FROM` | `Gomand Consult <portail@gomandconsult.com>` | |
   | `ADMIN_EMAIL` | `anthony@gomandconsult.com` | reçoit les notifications |
   | `SITE_URL` | `https://espace.gomandconsult.com` | adresse finale du portail |

3. Déployez. Puis **Domain management → Add a domain** : `espace.gomandconsult.com`, et créez chez votre gestionnaire de domaine l'enregistrement `CNAME` que Netlify indique. Le certificat HTTPS est automatique.

### 5. Éviter la mise en pause (formule gratuite de Supabase)
Dans GitHub : *Settings → Secrets and variables → Actions*, créez `SUPABASE_URL` et `SUPABASE_ANON_KEY`. Le workflow `.github/workflows/keep-alive.yml` appelle la base tous les 3 jours. Inutile avec la formule Pro.

### 6. Premier test (à faire avant d'inviter un vrai client)
1. Ouvrez le portail, connectez-vous avec votre compte Anthony : vous arrivez sur le back-office.
2. **Invitez-vous vous-même** avec une autre adresse email (une adresse de test) : vérifiez la réception de l'email d'invitation en français, choisissez un mot de passe, connectez-vous.
3. Avec l'accès « client » de test, vérifiez que vous ne voyez rien d'autre que votre espace.
4. Publiez un **vrai PDF** (celui d'un devis) : ouvrez-le côté client, **sélectionnez du texte**, surlignez, commentez, répondez côté Anthony, résolvez. Testez sur ordinateur **et** sur téléphone.
5. Créez une galerie de quelques photos : validez-les côté client, envoyez la sélection, vérifiez l'email reçu côté Anthony.
6. Vérifiez que les emails arrivent bien (et pas dans les courriers indésirables).

---

## Si « Le serveur n'est pas configuré » s'affiche
Le message nomme maintenant la variable manquante. Vérifiez dans Netlify (*Site configuration → Environment variables*) que le nom est **exactement** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` (ou `VITE_SUPABASE_URL`), `RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_EMAIL`, que la portée est « All scopes », puis relancez un déploiement. Les journaux des fonctions se trouvent dans *Logs → Functions*. Si le message mentionne « native WebSocket », mettez à jour les fichiers `netlify/lib/common.mjs` et `netlify.toml` (la fonction doit fonctionner sous Node 20 comme sous Node 22).

## Utilisation au quotidien
- **Nouveau client** : back-office → *Inviter un nouveau client* (entreprise, contact, email). Il reçoit un lien pour choisir son mot de passe.
- **Autre personne chez le même client** : fiche client → *Accès* → donner accès à une autre personne.
- **Devis ou facture** : exportez le PDF depuis Accountable, puis fiche client → *Publier un document*. Indiquez la référence Accountable. Cochez « Prévenir par email ».
- **Photos** : fiche client → *Créer une galerie photo*. Les photos sont allégées automatiquement (2 400 px maximum) avant l'envoi. Les fichiers d'origine restent chez vous.
- **Réponses** : l'écran d'accueil du back-office liste ce qui attend votre réponse. Un client qui oublie son mot de passe utilise « Mot de passe oublié » ; vous pouvez aussi lui renvoyer un lien depuis sa fiche.
- **Aperçu** : « Voir l'espace comme le client » montre exactement ce que le client voit.
- **Données d'un client (accès, portabilité)** : fiche client → *Données et suppression* → « Exporter les données (JSON) ».
- **Supprimer un client** : même section → retapez le nom de l'entreprise → « Supprimer définitivement ». Fichiers, accès, documents, photos et échanges sont effacés ; c'est irréversible. « Retirer l'accès » (dans *Accès*) supprime une seule personne.

## Sécurité et RGPD
Le guide complet est dans **`docs/RGPD.md`** (ce qui est fait, ce qu'il vous reste à faire, registre des traitements, procédures). En bref :
- **Politique de confidentialité** publique sur `/confidentialite`, liée depuis le pied de page, la page de connexion et les emails. Chaque client la voit une fois avant d'entrer (« J'ai pris connaissance »), avec date et version enregistrées.
- **Pas de bandeau de cookies** : le portail n'utilise que le stockage technique indispensable à la connexion, exempté de consentement.
- **Cloisonnement** : toutes les règles sont dans la base (pas seulement dans l'interface). Un client ne peut ni lire, ni modifier, ni deviner les données d'un autre, même en interrogeant directement l'API. 64 vérifications automatiques le contrôlent (voir `supabase/tests`).
- **Fichiers** : privés. Accès par liens signés qui expirent au bout d'une heure ; les dossiers sont séparés par client.
- **Auteur des messages** : déterminé par le serveur, jamais par le navigateur : impossible de se faire passer pour Anthony.
- **Emails** : ils ne contiennent jamais le texte des échanges, seulement un lien pour se connecter.
- **Polices et ressources** : hébergées par le site lui-même, aucune requête vers Google Fonts ni un autre service tiers.
- **À faire de votre côté** : accepter le contrat de sous-traitance (DPA) de Supabase, Netlify et Resend (disponibles dans leurs réglages ou sur leurs sites) ; mentionner le portail et ses sous-traitants dans votre politique de confidentialité ; ne pas y déposer de données plus sensibles que nécessaire. Faites relire la configuration par un professionnel avant d'y mettre des documents très confidentiels.

## Sauvegardes et limites des formules gratuites
- La formule gratuite de Supabase n'a **pas de sauvegarde automatique** : exportez de temps en temps les tables (*Table Editor → Export*). Les PDF se recréent depuis Accountable ; les originaux des photos sont chez vous. Ce sont les **commentaires des clients** qui seraient perdus. La formule Pro (25 $/mois) ajoute des sauvegardes quotidiennes et supprime la mise en pause.
- 1 Go de fichiers inclus en gratuit : largement suffisant pour des PDF, plus juste pour beaucoup de galeries photo (chaque photo pèse environ 0,5 à 1 Mo après allègement).
- Netlify et Resend : les formules gratuites suffisent pour ce volume.

## Ce qui a été testé, et ce qui ne l'a pas été
- **Testé automatiquement** : 64 vérifications de sécurité de la base sur un vrai PostgreSQL (`supabase/tests`), 36 tests (interface, appels serveur, géométrie des surlignages, fonction de suppression) et la compilation du site et des fonctions.
- **Non testé dans un vrai navigateur ni avec de vrais comptes Supabase, Resend, Netlify** : la lecture d'un PDF avec sélection de texte (la partie la plus délicate), l'envoi des emails, l'invitation d'un client, l'envoi de photos, l'affichage sur téléphone. Suivez la liste de l'étape 6 : si quelque chose cloche, c'est là que ça se verra.
- **Limites connues** : un PDF « image » (scan) n'a pas de texte à sélectionner : utilisez « Commenter une page entière ». L'effet « flipbook » n'est pas inclus. Les liens signés expirent après une heure : rechargez la page si un document reste ouvert très longtemps.

## Développement local
```bash
npm install
cp .env.example .env     # renseignez les deux variables VITE_*
npm run dev              # http://localhost:5173
npm test                 # tests de l'interface
```
Les fonctions serveur (`/api/...`) ne tournent pas avec `npm run dev` ; pour les essayer en local, installez la CLI Netlify (`npx netlify dev`).

Tests de sécurité de la base (nécessite PostgreSQL) : créez une base vide, exécutez `supabase/tests/stub_supabase.sql` (simule Supabase), puis `supabase/schema.sql`, puis `supabase/tests/rls.test.sql` ; il doit se terminer par « TOUS LES TESTS DE SÉCURITÉ PASSENT ».

## Structure
```
supabase/schema.sql          tables, sécurité, stockage (à exécuter une fois)
supabase/email-templates/    emails d'invitation et de réinitialisation, en français
supabase/tests/              tests de sécurité de la base
netlify/functions/           invite-client (créer un accès), delete-account (supprimer un client ou un accès) et notify (emails)
docs/RGPD.md                 conformité RGPD : checklist, registre, procédures
supabase/migrations/         mises à jour de la base pour une installation existante
src/pages/                   écrans (connexion, espace client, document, galerie, back-office)
src/components/PdfViewer.jsx lecteur PDF (pdf.js) avec surlignages
src/lib/api.js               tout ce qui parle à Supabase
src/config.js                contact (WhatsApp, email), catégories, statuts
src/styles.css               design system Gomand Consult
```
